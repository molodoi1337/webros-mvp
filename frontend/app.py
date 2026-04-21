import os
import re
import subprocess
import threading
import time
from pathlib import Path

from flask import Flask, render_template, jsonify, request
from bag_api import bag_api
from bag_database import BagDatabase
from bag_manager import BagManager
from bag_parser import BagParser

app = Flask(__name__)
default_rosbridge_host = os.environ.get("ROSBRIDGE_HOST", "127.0.0.1")
default_rosbridge_port = os.environ.get("ROSBRIDGE_PORT", "9090")

storage_dir = Path(os.environ.get("ROSBAG_STORAGE_DIR", "~/rosbag_storage")).expanduser()
storage_dir.mkdir(parents=True, exist_ok=True)
db = BagDatabase(storage_dir / "rosbag_catalog.db")
bag_manager = BagManager(storage_dir)
bag_parser = BagParser()


def _recover_recordings() -> None:
    orphaned = db.recording_bags()
    for bag_id, bag_path in orphaned:
        path = Path(bag_path).expanduser()
        if not path.exists():
            db.update_bag(bag_id, {"status": "error"})
            db.add_operation("recover", bag_id, "failed", "Директория записи отсутствует")
            continue
        info = bag_parser.parse_bag_dir(str(path))
        status = "recovered" if info.get("size_bytes", 0) > 0 else "error"
        db.update_bag(
            bag_id,
            {
                "status": status,
                "size_bytes": info.get("size_bytes", 0),
                "duration_ns": info.get("duration_ns", 0),
                "message_count": info.get("message_count", 0),
                "end_time": info.get("end_time"),
            },
        )
        db.set_topics(bag_id, info.get("topics", []))
        db.add_operation("recover", bag_id, "completed")


_recover_recordings()
app.config["bag_ctx"] = {
    "storage_dir": storage_dir,
    "db": db,
    "manager": bag_manager,
    "parser": bag_parser,
}
app.register_blueprint(bag_api)

# --------------- Ping monitor (background thread) ---------------

PING_HZ = 3
PING_SUBPROCESS_TIMEOUT = 0.5

_ping_lock = threading.Lock()
_ping_state = {
    'host': None,
    'latency': None,
    'status': 'idle',
    'running': False,
    'thread': None,
}


def _ping_once(host):
    try:
        result = subprocess.run(
            ['ping', '-c', '1', '-W', '1', host],
            capture_output=True, text=True, timeout=PING_SUBPROCESS_TIMEOUT,
        )
        if result.returncode == 0:
            m = re.search(r'time[=<]([\d.]+)', result.stdout)
            if m:
                return round(float(m.group(1)), 1)
        return None
    except (subprocess.TimeoutExpired, Exception):
        return None


def _ping_worker():
    interval = 1.0 / PING_HZ
    while True:
        with _ping_lock:
            if not _ping_state['running']:
                break
            host = _ping_state['host']

        if not host:
            time.sleep(interval)
            continue

        ts = time.monotonic()
        latency = _ping_once(host)

        with _ping_lock:
            if not _ping_state['running']:
                break
            _ping_state['latency'] = latency
            _ping_state['status'] = 'online' if latency is not None else 'offline'

        time.sleep(max(0, interval - (time.monotonic() - ts)))


# --------------- Routes ---------------

@app.route('/')
def home():
    return render_template(
        'index.html',
        rosbridge_host=default_rosbridge_host,
        rosbridge_port=default_rosbridge_port,
    )


@app.route('/api/ping', methods=['GET'])
def get_ping():
    with _ping_lock:
        return jsonify({
            'host': _ping_state['host'],
            'latency': _ping_state['latency'],
            'status': _ping_state['status'],
        })


@app.route('/api/ping/start', methods=['POST'])
def start_ping():
    data = request.get_json(force=True, silent=True) or {}
    host = data.get('host', '').strip()
    if not host:
        return jsonify({'error': 'host is required'}), 400

    with _ping_lock:
        _ping_state['host'] = host
        _ping_state['latency'] = None
        _ping_state['status'] = 'idle'
        need_thread = (
            not _ping_state['running']
            or _ping_state['thread'] is None
            or not _ping_state['thread'].is_alive()
        )
        if need_thread:
            _ping_state['running'] = True
            t = threading.Thread(target=_ping_worker, daemon=True)
            _ping_state['thread'] = t
            t.start()

    return jsonify({'ok': True, 'host': host})


@app.route('/api/ping/stop', methods=['POST'])
def stop_ping():
    with _ping_lock:
        _ping_state['running'] = False
        _ping_state['host'] = None
        _ping_state['status'] = 'idle'
        _ping_state['latency'] = None
    return jsonify({'ok': True})


if __name__ == '__main__':
    app.run(
        os.environ.get("FLASK_HOST", "0.0.0.0"),
        int(os.environ.get("FLASK_PORT", "8080")),
        debug=False,
    )
