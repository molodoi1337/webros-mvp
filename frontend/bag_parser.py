import glob
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def _iso_from_ns(ts_ns: int) -> str:
    return datetime.fromtimestamp(ts_ns / 1_000_000_000, tz=timezone.utc).isoformat()


class BagParser:
    def parse_bag_dir(self, bag_dir: str) -> Dict[str, Any]:
        path = Path(bag_dir).expanduser()
        mcap_files = sorted(glob.glob(str(path / "*.mcap")))
        db3_files = sorted(glob.glob(str(path / "*.db3")))
        files = mcap_files or db3_files
        bag_format = "mcap" if mcap_files else "db3"
        size_bytes = sum(os.path.getsize(f) for f in files if os.path.isfile(f))

        # Three sources, tried in order, because a hard kill of ros2 bag
        # record (boat power loss) leaves no metadata.yaml and an
        # unfinalized .mcap that rosbag2_py.get_metadata() can't read:
        #   1. rosbag2_py.get_metadata() — works only on cleanly closed bags
        #   2. metadata.yaml — also only present on clean shutdown
        #   3. mcap recovery scan — walks the .mcap chunk by chunk and
        #      reconstructs counts/timestamps from whatever survived
        metadata_path = path / "metadata.yaml"
        info = self._try_rosbag2_info(path, bag_format)
        if (not info or not int(info.get("duration_ns") or 0)) and metadata_path.exists() and metadata_path.stat().st_size > 0:
            yaml_info = self._try_yaml_metadata(metadata_path)
            if yaml_info and int(yaml_info.get("duration_ns") or 0):
                info = yaml_info
        if (not info or not int(info.get("duration_ns") or 0)) and files:
            recovered = self._try_mcap_recover(files) if bag_format == "mcap" else None
            if recovered and (recovered.get("message_count") or recovered.get("duration_ns")):
                info = recovered
        if info:
            info["format"] = bag_format
            info["size_bytes"] = size_bytes
            return info

        now_iso = datetime.now(tz=timezone.utc).isoformat()
        return {
            "format": bag_format,
            "size_bytes": size_bytes,
            "duration_ns": 0,
            "message_count": 0,
            "start_time": now_iso,
            "end_time": None,
            "topics": [],
        }

    def _try_yaml_metadata(self, metadata_path: Path) -> Dict[str, Any] | None:
        try:
            import yaml  # type: ignore
        except Exception:
            return None
        try:
            with open(metadata_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
        except Exception:
            return None
        root = data.get("rosbag2_bagfile_information") or data
        duration_ns = int((root.get("duration") or {}).get("nanoseconds") or 0)
        start_ns = int((root.get("starting_time") or {}).get("nanoseconds_since_epoch") or 0)
        message_count = int(root.get("message_count") or 0)
        duration_sec = duration_ns / 1_000_000_000 if duration_ns > 0 else 0.0
        topics: List[Dict[str, Any]] = []
        for entry in root.get("topics_with_message_count") or []:
            meta = entry.get("topic_metadata") or {}
            count = int(entry.get("message_count") or 0)
            freq = round(count / duration_sec, 3) if duration_sec > 0 else None
            topics.append(
                {
                    "topic_name": meta.get("name"),
                    "message_type": meta.get("type", "unknown"),
                    "message_count": count,
                    "frequency_hz": freq,
                }
            )
        end_ns = start_ns + duration_ns if duration_ns > 0 else start_ns
        return {
            "duration_ns": duration_ns,
            "message_count": message_count,
            "start_time": _iso_from_ns(start_ns) if start_ns > 0 else datetime.now(tz=timezone.utc).isoformat(),
            "end_time": _iso_from_ns(end_ns) if end_ns > 0 else None,
            "topics": topics,
        }

    def _try_mcap_recover(self, mcap_files: List[str]) -> Dict[str, Any] | None:
        # Walk MCAP records directly so that even an MCAP without a
        # finalized footer/summary (the result of SIGKILL on the
        # recorder) yields a usable timestamp range and message count.
        try:
            from mcap.reader import make_reader  # type: ignore
        except Exception:
            return None
        topics: Dict[str, Dict[str, Any]] = {}
        message_count = 0
        start_ns: int | None = None
        end_ns: int | None = None
        for fpath in mcap_files:
            try:
                f = open(fpath, "rb")
            except Exception:
                continue
            try:
                reader = make_reader(f)
                # Iterate manually so a torn final chunk (very common
                # after SIGKILL) doesn't discard everything we already
                # counted before the read error.
                it = reader.iter_messages()
                while True:
                    try:
                        item = next(it)
                    except StopIteration:
                        break
                    except Exception:
                        break
                    schema, channel, message = item
                    message_count += 1
                    ts = int(message.log_time)
                    if start_ns is None or ts < start_ns:
                        start_ns = ts
                    if end_ns is None or ts > end_ns:
                        end_ns = ts
                    name = channel.topic
                    msg_type = (schema.name if schema else "unknown") or "unknown"
                    slot = topics.setdefault(
                        name, {"topic_name": name, "message_type": msg_type, "message_count": 0, "frequency_hz": None}
                    )
                    slot["message_count"] += 1
            except Exception:
                pass
            finally:
                try:
                    f.close()
                except Exception:
                    pass
        if message_count == 0 or start_ns is None or end_ns is None:
            return None
        duration_ns = max(0, int(end_ns) - int(start_ns))
        duration_sec = duration_ns / 1_000_000_000 if duration_ns > 0 else 0.0
        for slot in topics.values():
            if duration_sec > 0:
                slot["frequency_hz"] = round(slot["message_count"] / duration_sec, 3)
        return {
            "duration_ns": int(duration_ns),
            "message_count": int(message_count),
            "start_time": _iso_from_ns(int(start_ns)),
            "end_time": _iso_from_ns(int(end_ns)),
            "topics": list(topics.values()),
        }

    def _try_rosbag2_info(self, bag_dir: Path, bag_format: str) -> Dict[str, Any] | None:
        try:
            import rosbag2_py  # type: ignore
        except Exception:
            return None

        try:
            storage_options = rosbag2_py.StorageOptions(uri=str(bag_dir), storage_id=bag_format)
            converter_options = rosbag2_py.ConverterOptions("", "")
            reader = rosbag2_py.SequentialReader()
            reader.open(storage_options, converter_options)
            metadata = reader.get_metadata()
            duration_ns = int(metadata.duration.nanoseconds)
            duration_sec = duration_ns / 1_000_000_000 if duration_ns > 0 else 0.0
            topics: List[Dict[str, Any]] = []
            for t in metadata.topics_with_message_count:
                count = int(t.message_count)
                freq = round(count / duration_sec, 3) if duration_sec > 0 else None
                topics.append(
                    {
                        "topic_name": t.topic_metadata.name,
                        "message_type": t.topic_metadata.type,
                        "message_count": count,
                        "frequency_hz": freq,
                    }
                )
            start_ns = int(metadata.starting_time.nanoseconds_since_epoch)
            end_ns = start_ns + duration_ns if duration_ns > 0 else start_ns
            return {
                "duration_ns": duration_ns,
                "message_count": int(metadata.message_count),
                "start_time": _iso_from_ns(start_ns),
                "end_time": _iso_from_ns(end_ns),
                "topics": topics,
            }
        except Exception:
            return None
