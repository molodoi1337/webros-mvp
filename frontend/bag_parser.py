import glob
import os
import subprocess
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

        # Recovery cascade for crashed recordings (boat SIGKILL):
        #   1. If metadata.yaml is missing/empty, ask `ros2 bag reindex`
        #      to rebuild it from the .mcap. This is by far the best
        #      outcome — it leaves the bag fully usable by rosbag2_py
        #      (timeline / topic messages / charts / ros2 bag play),
        #      not just countable in the catalog.
        #   2. rosbag2_py.get_metadata() — works once metadata.yaml is
        #      back (either pre-existing or freshly reindexed).
        #   3. Parse metadata.yaml directly — fallback for builds where
        #      rosbag2_py is missing from the Flask venv.
        #   4. mcap python NonSeekingReader — last-resort scan for
        #      counts/timestamps if reindex couldn't be run.
        metadata_path = path / "metadata.yaml"
        if files and (not metadata_path.exists() or metadata_path.stat().st_size == 0):
            self._try_reindex(path, bag_format)
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

    def _try_reindex(self, bag_dir: Path, bag_format: str) -> bool:
        # `ros2 bag reindex` walks the storage files and writes a fresh
        # metadata.yaml. Works on .mcap files that were never finalized
        # (no footer/summary), which is the case after SIGKILL on the
        # recorder. Does NOT require the `mcap` python package.
        try:
            proc = subprocess.run(
                ["ros2", "bag", "reindex", str(bag_dir), "--storage", bag_format],
                capture_output=True,
                text=True,
                timeout=30,
            )
        except Exception:
            return False
        return proc.returncode == 0 and (bag_dir / "metadata.yaml").exists()

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
        # NB: mcap.reader.make_reader picks SeekingReader for regular
        # files, and SeekingReader requires the footer/summary section
        # at the end of the file — which a SIGKILL'd recorder never
        # writes. NonSeekingReader streams from byte 0 and works on
        # unfinalized files.
        try:
            from mcap.reader import NonSeekingReader  # type: ignore
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
                reader = NonSeekingReader(f)
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
