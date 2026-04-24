import glob
import os
import re
import shutil
import subprocess
from datetime import datetime
from urllib.parse import unquote
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from flask import Blueprint, current_app, jsonify, request, send_file

from bag_database import BagDatabase
from bag_manager import BagManager
from bag_parser import BagParser

bag_api = Blueprint("bag_api", __name__, url_prefix="/api")


def _ok(data: Any):
    return jsonify({"success": True, "data": data, "error": None})


def _err(code: str, message: str, status: int = 400):
    return jsonify({"success": False, "data": None, "error": {"code": code, "message": message}}), status


def _ctx() -> Dict[str, Any]:
    return current_app.config["bag_ctx"]


def _sanitize_name(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_\-]+", "_", name).strip("_")
    return cleaned[:128] if cleaned else datetime.now().strftime("%Y-%m-%d_%H-%M-%S")


# ------------------ CRUD / CATALOG ------------------

@bag_api.route("/bags", methods=["GET"])
def list_bags():
    db: BagDatabase = _ctx()["db"]
    payload = db.list_bags(
        status=request.args.get("status"),
        from_time=request.args.get("from"),
        to_time=request.args.get("to"),
        search=request.args.get("search"),
        tags=request.args.get("tags"),
        sort=request.args.get("sort", "start_time"),
        order=request.args.get("order", "desc"),
        page=int(request.args.get("page", "1")),
        per_page=int(request.args.get("per_page", "50")),
    )
    return _ok(payload)


@bag_api.route("/bags/<int:bag_id>", methods=["GET"])
def get_bag(bag_id: int):
    db: BagDatabase = _ctx()["db"]
    bag = db.get_bag(bag_id)
    if not bag:
        return _err("BAG_NOT_FOUND", f"Запись с id={bag_id} не найдена", 404)
    return _ok(bag)


@bag_api.route("/bags/<int:bag_id>", methods=["PUT"])
def update_bag_meta(bag_id: int):
    db: BagDatabase = _ctx()["db"]
    if not db.get_bag(bag_id):
        return _err("BAG_NOT_FOUND", f"Запись с id={bag_id} не найдена", 404)
    body = request.get_json(silent=True) or {}
    db.update_bag(
        bag_id,
        {
            "name": body.get("name"),
            "description": body.get("description"),
            "tags": body.get("tags"),
        },
    )
    return _ok(db.get_bag(bag_id))


# ------------------ RECORD ------------------

@bag_api.route("/bags/record/start", methods=["POST"])
def start_record():
    ctx = _ctx()
    db: BagDatabase = ctx["db"]
    manager: BagManager = ctx["manager"]
    body = request.get_json(silent=True) or {}
    vehicle_type = str(body.get("vehicle_type") or "vehicle")
    default_name = datetime.now().strftime(f"%Y-%m-%d_%H-%M-%S_{vehicle_type}")
    bag_name = _sanitize_name(str(body.get("name") or default_name))
    topics = body.get("topics") if isinstance(body.get("topics"), list) else []
    description = str(body.get("description") or "")
    tags = str(body.get("tags") or "")
    max_bag_duration = int(body.get("max_bag_duration") or 300)
    max_bag_size_mb = int(body.get("max_bag_size") or 200)
    try:
        record = manager.start_record(
            name=bag_name,
            topics=[str(t) for t in topics],
            description=description,
            tags=tags,
            vehicle_type=vehicle_type,
            max_bag_duration=max_bag_duration,
            max_bag_size_mb=max_bag_size_mb,
        )
        bag_id = db.create_bag(
            {
                "name": record["name"],
                "file_path": record["file_path"],
                "format": "mcap",
                "size_bytes": 0,
                "duration_ns": 0,
                "message_count": 0,
                "start_time": record["start_time"],
                "end_time": None,
                "status": "recording",
                "description": description,
                "vehicle_type": vehicle_type,
                "tags": tags,
            }
        )
        record["bag_id"] = bag_id
        db.add_operation("record", bag_id, "started")
        return _ok(record)
    except Exception as e:
        return _err("RECORD_START_FAILED", str(e), 500)


@bag_api.route("/bags/record/stop", methods=["POST"])
def stop_record():
    ctx = _ctx()
    db: BagDatabase = ctx["db"]
    manager: BagManager = ctx["manager"]
    parser: BagParser = ctx["parser"]
    current = manager.stop_record()
    if not current:
        return _err("NOT_RECORDING", "Активная запись не найдена", 409)
    # Priority: path match (unique), then exact-name match via list, else fail.
    exact = db.find_bag_by_path(current["file_path"])
    if exact:
        bag_id = int(exact["id"])
    else:
        matches = db.list_bags(search=current["name"], per_page=5)["items"]
        exact_name = [m for m in matches if m.get("name") == current["name"]]
        if exact_name:
            bag_id = int(exact_name[0]["id"])
        elif matches:
            bag_id = int(matches[0]["id"])
        else:
            return _err("BAG_NOT_FOUND", "Запись в БД не найдена", 404)
    info = parser.parse_bag_dir(current["file_path"])
    message_count = int(info.get("message_count", 0) or 0)
    duration_ns = int(info.get("duration_ns", 0) or 0)
    size_bytes = int(info.get("size_bytes", 0) or 0)
    died_early = bool(current.get("died_early"))
    empty = message_count == 0 and duration_ns == 0 and size_bytes == 0
    status = "error" if (died_early or empty) else "active"
    db.update_bag(
        bag_id,
        {
            "size_bytes": size_bytes,
            "duration_ns": duration_ns,
            "message_count": message_count,
            "end_time": info.get("end_time"),
            "status": status,
        },
    )
    db.set_topics(bag_id, info.get("topics", []))
    op_status = "failed" if status == "error" else "completed"
    err_msg = None
    if status == "error":
        err_msg = (
            f"ros2 bag record finished empty (rc={current.get('returncode')}). "
            f"Log tail:\n{current.get('log_tail') or ''}"
        )
    db.add_operation("record", bag_id, op_status, error_message=err_msg)
    result = db.get_bag(bag_id)
    if status == "error":
        result = dict(result or {})
        result["record_failed"] = True
        result["returncode"] = current.get("returncode")
        result["log_tail"] = current.get("log_tail") or ""
    return _ok(result)


@bag_api.route("/bags/record/status", methods=["GET"])
def record_status():
    return _ok(_ctx()["manager"].get_record_status())


# ------------------ PLAY ------------------

@bag_api.route("/bags/<int:bag_id>/play", methods=["POST"])
def play_bag(bag_id: int):
    db: BagDatabase = _ctx()["db"]
    manager: BagManager = _ctx()["manager"]
    parser: BagParser = _ctx()["parser"]
    bag = db.get_bag(bag_id)
    if not bag:
        return _err("BAG_NOT_FOUND", f"Запись с id={bag_id} не найдена", 404)
    body = request.get_json(silent=True) or {}
    rate = float(body.get("rate") or 1.0)
    loop = bool(body.get("loop") or False)
    topics = body.get("topics") if isinstance(body.get("topics"), list) else None
    # Self-heal: if DB has duration_ns=0 (stop_record parse failed or old row),
    # re-parse the bag directory right now. Without a real duration the player
    # can't show totals or reset the loop, so users see "0.0s / 0.0s" and
    # the progress bar never resets.
    if not int(bag.get("duration_ns") or 0):
        info = parser.parse_bag_dir(bag["file_path"])
        if int(info.get("duration_ns") or 0):
            db.update_bag(
                bag_id,
                {
                    "size_bytes": info.get("size_bytes", 0),
                    "duration_ns": info.get("duration_ns", 0),
                    "message_count": info.get("message_count", 0),
                    "end_time": info.get("end_time"),
                    "status": "active",
                },
            )
            db.set_topics(bag_id, info.get("topics", []))
            bag = db.get_bag(bag_id) or bag
    duration_sec = float(int(bag.get("duration_ns") or 0) / 1_000_000_000)
    try:
        result = manager.start_play(
            bag["file_path"],
            rate=rate,
            loop=loop,
            topics=topics,
            duration_sec=duration_sec,
            bag_id=bag_id,
        )
        db.add_operation("play", bag_id, "started")
        return _ok(result)
    except Exception as e:
        return _err("PLAY_START_FAILED", str(e), 500)


@bag_api.route("/bags/play/stop", methods=["POST"])
def stop_play():
    _ctx()["manager"].stop_play()
    return _ok({"stopped": True})


@bag_api.route("/bags/play/pause", methods=["POST"])
def pause_play():
    manager: BagManager = _ctx()["manager"]
    body = request.get_json(silent=True) or {}
    # Toggle by default; accept explicit {"action": "pause"|"resume"}.
    action = str(body.get("action") or "toggle").lower()
    try:
        status = manager.get_play_status()
        if action == "resume" or (action == "toggle" and status.get("paused")):
            return _ok(manager.resume_play())
        return _ok(manager.pause_play())
    except Exception as e:
        return _err("PLAY_CONTROL_FAILED", str(e), 409)


@bag_api.route("/bags/play/status", methods=["GET"])
def play_status():
    return _ok(_ctx()["manager"].get_play_status())


# ------------------ DELETE / DOWNLOAD / SCAN ------------------

@bag_api.route("/bags/<int:bag_id>", methods=["DELETE"])
def delete_bag(bag_id: int):
    db: BagDatabase = _ctx()["db"]
    storage_dir: Path = _ctx()["storage_dir"]
    bag = db.delete_bag(bag_id)
    if not bag:
        return _err("BAG_NOT_FOUND", f"Запись с id={bag_id} не найдена", 404)
    path = Path(bag["file_path"]).expanduser().resolve()
    try:
        storage_root = storage_dir.resolve()
        if storage_root in path.parents and path.exists():
            shutil.rmtree(path, ignore_errors=True)
    except Exception:
        pass
    db.add_operation("delete", bag_id, "completed")
    return _ok({"deleted": True, "id": bag_id})


@bag_api.route("/bags/<int:bag_id>/download", methods=["GET"])
def download_bag(bag_id: int):
    db: BagDatabase = _ctx()["db"]
    storage_dir: Path = _ctx()["storage_dir"]
    bag = db.get_bag(bag_id)
    if not bag:
        return _err("BAG_NOT_FOUND", f"Запись с id={bag_id} не найдена", 404)
    bag_path = Path(bag["file_path"]).expanduser().resolve()
    storage_root = storage_dir.resolve()
    if storage_root not in bag_path.parents:
        return _err("PATH_FORBIDDEN", "Недопустимый путь архива", 403)
    archive_base = str(storage_root / f"{_sanitize_name(bag['name'])}_{bag_id}")
    zip_path = shutil.make_archive(archive_base, "zip", root_dir=str(bag_path))
    return send_file(zip_path, as_attachment=True, download_name=f"{_sanitize_name(bag['name'])}.zip")


@bag_api.route("/bags/scan", methods=["POST"])
def scan_storage():
    db: BagDatabase = _ctx()["db"]
    parser: BagParser = _ctx()["parser"]
    storage_dir: Path = _ctx()["storage_dir"]
    body = request.get_json(silent=True) or {}
    requested = Path(str(body.get("path") or storage_dir)).expanduser().resolve()
    root = storage_dir.resolve()
    if requested != root and root not in requested.parents:
        return _err("PATH_FORBIDDEN", "Сканирование разрешено только внутри директории хранения", 403)
    imported = 0
    refreshed = 0
    for child in requested.iterdir():
        if not child.is_dir():
            continue
        has_bag_files = any(child.glob("*.mcap")) or any(child.glob("*.db3"))
        if not has_bag_files:
            continue
        existing = db.find_bag_by_path(str(child))
        if existing:
            # Heal DB rows saved by an earlier broken parse (0 duration /
            # 0 messages): re-parse the bag dir and update metadata in place.
            if not existing.get("duration_ns") or not existing.get("message_count"):
                info = parser.parse_bag_dir(str(child))
                if info.get("duration_ns") or info.get("message_count"):
                    db.update_bag(
                        int(existing["id"]),
                        {
                            "size_bytes": info.get("size_bytes", 0),
                            "duration_ns": info.get("duration_ns", 0),
                            "message_count": info.get("message_count", 0),
                            "end_time": info.get("end_time"),
                            "status": "active",
                        },
                    )
                    db.set_topics(int(existing["id"]), info.get("topics", []))
                    refreshed += 1
            continue
        info = parser.parse_bag_dir(str(child))
        bag_id = db.create_bag(
            {
                "name": child.name,
                "file_path": str(child),
                "format": info.get("format", "mcap"),
                "size_bytes": info.get("size_bytes", 0),
                "duration_ns": info.get("duration_ns", 0),
                "message_count": info.get("message_count", 0),
                "start_time": info.get("start_time") or datetime.now().isoformat(),
                "end_time": info.get("end_time"),
                "status": "active",
                "description": "",
                "vehicle_type": None,
                "tags": "",
            }
        )
        db.set_topics(bag_id, info.get("topics", []))
        imported += 1
    return _ok({"imported": imported, "refreshed": refreshed})


# ------------------ INSPECTOR / TIMELINE / CHART ------------------

@bag_api.route("/bags/<int:bag_id>/topics", methods=["GET"])
def bag_topics(bag_id: int):
    db: BagDatabase = _ctx()["db"]
    bag = db.get_bag(bag_id)
    if not bag:
        return _err("BAG_NOT_FOUND", f"Запись с id={bag_id} не найдена", 404)
    return _ok(bag.get("topics", []))


@bag_api.route("/bags/<int:bag_id>/topics/<path:topic>/messages", methods=["GET"])
def bag_topic_messages(bag_id: int, topic: str):
    db: BagDatabase = _ctx()["db"]
    bag = db.get_bag(bag_id)
    if not bag:
        return _err("BAG_NOT_FOUND", f"Запись с id={bag_id} не найдена", 404)
    topic_name = "/" + unquote(topic).lstrip("/")
    offset = max(0, int(request.args.get("offset", "0")))
    limit = max(1, min(500, int(request.args.get("limit", "100"))))
    from_ns = _parse_time_ns(request.args.get("from_time"))
    to_ns = _parse_time_ns(request.args.get("to_time"))
    try:
        items, total = _read_bag_messages(
            bag["file_path"], bag.get("format") or "mcap", topic_name, offset, limit, from_ns, to_ns
        )
    except BagReadError as e:
        return _err("BAG_READ_FAILED", str(e), 500)
    return _ok(
        {
            "topic": topic_name,
            "items": items,
            "offset": offset,
            "limit": limit,
            "count": len(items),
            "total": total,
        }
    )


@bag_api.route("/bags/<int:bag_id>/topics/<path:topic>/chart", methods=["GET"])
def bag_topic_chart(bag_id: int, topic: str):
    db: BagDatabase = _ctx()["db"]
    bag = db.get_bag(bag_id)
    if not bag:
        return _err("BAG_NOT_FOUND", f"Запись с id={bag_id} не найдена", 404)
    topic_name = "/" + unquote(topic).lstrip("/")
    field = request.args.get("field") or ""
    downsample = max(1, min(5000, int(request.args.get("downsample", "2000"))))
    try:
        points, fields = _bag_topic_chart_points(
            bag["file_path"], bag.get("format") or "mcap", topic_name, field, downsample
        )
    except BagReadError as e:
        return _err("BAG_READ_FAILED", str(e), 500)
    return _ok({"topic": topic_name, "field": field, "points": points, "available_fields": fields})


@bag_api.route("/bags/<int:bag_id>/timeline", methods=["GET"])
def bag_timeline(bag_id: int):
    db: BagDatabase = _ctx()["db"]
    bag = db.get_bag(bag_id)
    if not bag:
        return _err("BAG_NOT_FOUND", f"Запись с id={bag_id} не найдена", 404)
    bin_count = max(20, min(500, int(request.args.get("bins", "120"))))
    try:
        data = _bag_timeline(bag["file_path"], bag.get("format") or "mcap", bin_count)
    except BagReadError as e:
        return _err("BAG_READ_FAILED", str(e), 500)
    return _ok(data)


# ------------------ STORAGE / ROS TOPICS ------------------

@bag_api.route("/storage", methods=["GET"])
def storage_info():
    storage_dir: Path = _ctx()["storage_dir"]
    usage = shutil.disk_usage(str(storage_dir))
    low_threshold = 1024 * 1024 * 1024  # 1 GB
    return _ok(
        {
            "path": str(storage_dir),
            "total_bytes": int(usage.total),
            "used_bytes": int(usage.used),
            "free_bytes": int(usage.free),
            "low_space": bool(usage.free < low_threshold),
            "low_threshold_bytes": low_threshold,
        }
    )


@bag_api.route("/ros/topics", methods=["GET"])
def ros_topics():
    try:
        proc = subprocess.run(["ros2", "topic", "list", "-t"], capture_output=True, text=True, timeout=2.5)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or "ros2 topic list failed")
        rows: List[Dict[str, str]] = []
        for line in proc.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            if "[" in line and "]" in line:
                topic, msg_type = line.split("[", 1)
                rows.append({"name": topic.strip(), "type": msg_type.rstrip("]").strip()})
            else:
                rows.append({"name": line, "type": "unknown"})
        return _ok(rows)
    except Exception as e:
        return _err("ROS_TOPICS_FAILED", str(e), 500)


# ================== BAG READER HELPERS ==================


class BagReadError(RuntimeError):
    pass


def _parse_time_ns(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    s = value.strip()
    if not s:
        return None
    # Accept raw integer nanoseconds.
    if s.isdigit():
        return int(s)
    # ISO 8601 with optional trailing Z.
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        return int(dt.timestamp() * 1_000_000_000)
    except Exception:
        return None


def _bag_files(bag_dir: str, bag_format: str) -> List[str]:
    ext = "db3" if bag_format == "db3" else "mcap"
    return sorted(glob.glob(str(Path(bag_dir).expanduser() / f"*.{ext}")))


def _open_reader(bag_dir: str, bag_format: str):
    try:
        import rosbag2_py  # type: ignore
    except Exception as e:
        raise BagReadError(f"rosbag2_py недоступен: {e}")
    storage_options = rosbag2_py.StorageOptions(uri=str(Path(bag_dir).expanduser()), storage_id=bag_format)
    converter_options = rosbag2_py.ConverterOptions("", "")
    reader = rosbag2_py.SequentialReader()
    try:
        reader.open(storage_options, converter_options)
    except Exception as e:
        raise BagReadError(f"Не удалось открыть bag: {e}")
    return reader


def _topic_type_map(reader) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    try:
        for t in reader.get_all_topics_and_types():
            mapping[t.name] = t.type
    except Exception:
        pass
    return mapping


def _deserialize_msg(raw_bytes: bytes, msg_type_str: str):
    from rclpy.serialization import deserialize_message  # type: ignore
    from rosidl_runtime_py.utilities import get_message  # type: ignore

    msg_cls = get_message(msg_type_str)
    return deserialize_message(raw_bytes, msg_cls)


def _msg_to_dict(msg) -> Any:
    try:
        from rosidl_runtime_py import message_to_ordereddict  # type: ignore

        return _jsonable(message_to_ordereddict(msg))
    except Exception:
        # Fallback: best-effort __dict__ dump.
        try:
            return _jsonable({k: getattr(msg, k) for k in getattr(msg, "__slots__", [])})
        except Exception:
            return repr(msg)


def _jsonable(val: Any) -> Any:
    if val is None or isinstance(val, (bool, int, float, str)):
        return val
    if isinstance(val, dict):
        return {str(k): _jsonable(v) for k, v in val.items()}
    if isinstance(val, (bytes, bytearray, memoryview)):
        data = bytes(val)
        return list(data[:256])
    if hasattr(val, "tolist"):
        try:
            return _jsonable(val.tolist())
        except Exception:
            pass
    if isinstance(val, (list, tuple)):
        return [_jsonable(v) for v in val]
    return repr(val)


def _apply_topic_filter(reader, topic_name: str) -> None:
    # Use SetFilter if available to avoid scanning unrelated messages.
    try:
        import rosbag2_py  # type: ignore

        flt = rosbag2_py.StorageFilter(topics=[topic_name])
        reader.set_filter(flt)
    except Exception:
        pass


def _read_bag_messages(
    bag_dir: str,
    bag_format: str,
    topic_name: str,
    offset: int,
    limit: int,
    from_ns: Optional[int],
    to_ns: Optional[int],
) -> Tuple[List[Dict[str, Any]], int]:
    reader = _open_reader(bag_dir, bag_format)
    tmap = _topic_type_map(reader)
    msg_type = tmap.get(topic_name)
    if not msg_type:
        return [], 0
    _apply_topic_filter(reader, topic_name)

    items: List[Dict[str, Any]] = []
    index = 0
    total = 0
    scan_cap = 200000
    while reader.has_next() and total < scan_cap:
        try:
            t_name, raw, ts_ns = reader.read_next()
        except Exception:
            break
        if t_name != topic_name:
            continue
        if from_ns is not None and ts_ns < from_ns:
            continue
        if to_ns is not None and ts_ns > to_ns:
            continue
        total += 1
        if index < offset:
            index += 1
            continue
        if len(items) >= limit:
            # We still need total count; keep scanning but don't decode further.
            continue
        try:
            msg = _deserialize_msg(raw, msg_type)
            value = _msg_to_dict(msg)
        except Exception as e:
            value = {"__error__": f"decode failed: {e}"}
        items.append({"index": index, "timestamp": int(ts_ns), "value": value})
        index += 1
    return items, total


def _walk_fields(prefix: str, value: Any, out: List[str], depth: int = 0) -> None:
    if depth > 6:
        return
    if isinstance(value, dict):
        for k, v in value.items():
            path = f"{prefix}.{k}" if prefix else str(k)
            _walk_fields(path, v, out, depth + 1)
    elif isinstance(value, (list, tuple)):
        if value and isinstance(value[0], (int, float, bool)):
            out.append(prefix + "[0]")
    else:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if prefix:
                out.append(prefix)


def _get_field(value: Any, path: str) -> Optional[float]:
    if not path:
        return None
    cur: Any = value
    for part in path.split("."):
        key = part
        idx: Optional[int] = None
        m = re.match(r"(.*?)\[(\d+)\]$", part)
        if m:
            key = m.group(1)
            idx = int(m.group(2))
        if key:
            if isinstance(cur, dict):
                if key not in cur:
                    return None
                cur = cur[key]
            else:
                cur = getattr(cur, key, None)
                if cur is None:
                    return None
        if idx is not None:
            try:
                cur = cur[idx]
            except Exception:
                return None
    try:
        if isinstance(cur, bool):
            return float(int(cur))
        return float(cur)
    except Exception:
        return None


def _auto_pick_field(sample_dict: Any) -> Optional[str]:
    found: List[str] = []
    _walk_fields("", sample_dict, found)
    return found[0] if found else None


def _bag_topic_chart_points(
    bag_dir: str,
    bag_format: str,
    topic_name: str,
    field: str,
    downsample: int,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    reader = _open_reader(bag_dir, bag_format)
    tmap = _topic_type_map(reader)
    msg_type = tmap.get(topic_name)
    if not msg_type:
        return [], []
    _apply_topic_filter(reader, topic_name)

    all_points: List[Tuple[int, float]] = []
    available: List[str] = []
    picked_field = field
    scanned = 0
    scan_cap = 50000  # hard cap to bound memory on huge bags
    while reader.has_next() and scanned < scan_cap:
        try:
            t_name, raw, ts_ns = reader.read_next()
        except Exception:
            break
        if t_name != topic_name:
            continue
        scanned += 1
        try:
            msg = _deserialize_msg(raw, msg_type)
            d = _msg_to_dict(msg)
        except Exception:
            continue
        if not available:
            found: List[str] = []
            _walk_fields("", d, found)
            available = found[:32]
            if not picked_field:
                picked_field = _auto_pick_field(d) or ""
        if not picked_field:
            continue
        v = _get_field(d, picked_field)
        if v is None:
            continue
        all_points.append((int(ts_ns), float(v)))

    if not all_points:
        return [], available
    # Downsample by striding through sorted-by-time points.
    all_points.sort(key=lambda p: p[0])
    stride = max(1, len(all_points) // downsample)
    points = [{"t": int(ts), "v": val, "field": picked_field} for ts, val in all_points[::stride]][:downsample]
    return points, available


def _bag_timeline(bag_dir: str, bag_format: str, bin_count: int) -> Dict[str, Any]:
    reader = _open_reader(bag_dir, bag_format)
    tmap = _topic_type_map(reader)
    topics = sorted(tmap.keys())
    timestamps: Dict[str, List[int]] = {t: [] for t in topics}
    start_ns: Optional[int] = None
    end_ns: Optional[int] = None
    while reader.has_next():
        try:
            t_name, _raw, ts_ns = reader.read_next()
        except Exception:
            break
        if t_name not in timestamps:
            continue
        timestamps[t_name].append(int(ts_ns))
        if start_ns is None or ts_ns < start_ns:
            start_ns = int(ts_ns)
        if end_ns is None or ts_ns > end_ns:
            end_ns = int(ts_ns)
    if start_ns is None or end_ns is None or end_ns <= start_ns:
        return {"start_ns": start_ns or 0, "end_ns": end_ns or 0, "bin_count": bin_count, "topics": []}

    span = end_ns - start_ns
    bin_size = max(1, span // bin_count)
    topic_rows: List[Dict[str, Any]] = []
    for t_name in topics:
        bins = [0] * bin_count
        for ts in timestamps[t_name]:
            idx = min(bin_count - 1, (ts - start_ns) // bin_size)
            bins[int(idx)] += 1
        topic_rows.append(
            {
                "topic": t_name,
                "type": tmap.get(t_name, "unknown"),
                "message_count": len(timestamps[t_name]),
                "bins": bins,
            }
        )
    return {
        "start_ns": int(start_ns),
        "end_ns": int(end_ns),
        "bin_count": bin_count,
        "bin_size_ns": int(bin_size),
        "topics": topic_rows,
    }


# Kept for backwards compatibility in case external code imports them.
def _topic_echo_slice(*_args, **_kwargs):  # pragma: no cover - legacy shim
    return []


def _extract_numeric_points(*_args, **_kwargs):  # pragma: no cover - legacy shim
    return []


def _iter_bag_dirs(storage_dir: Path) -> Iterable[Path]:
    for child in storage_dir.iterdir():
        if child.is_dir() and (any(child.glob("*.mcap")) or any(child.glob("*.db3"))):
            yield child
