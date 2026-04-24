import os
import shutil
import signal
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


class BagRecordWatchdog:
    def __init__(self, bag_dir: Path, interval_sec: int = 30):
        self.bag_dir = Path(bag_dir)
        self.interval = interval_sec
        self._timer: Optional[threading.Timer] = None
        self._stopped = False

    def _sync(self) -> None:
        if self._stopped:
            return
        try:
            for fname in os.listdir(self.bag_dir):
                fpath = self.bag_dir / fname
                if fpath.is_file():
                    fd = os.open(fpath, os.O_RDONLY)
                    try:
                        os.fsync(fd)
                    finally:
                        os.close(fd)
            dir_fd = os.open(self.bag_dir, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except Exception:
            pass
        self._schedule()

    def _schedule(self) -> None:
        if self._stopped:
            return
        self._timer = threading.Timer(self.interval, self._sync)
        self._timer.daemon = True
        self._timer.start()

    def start(self) -> None:
        self._stopped = False
        self._schedule()

    def stop(self) -> None:
        self._stopped = True
        if self._timer:
            self._timer.cancel()


MCAP_STORAGE_CONFIG_YAML = """# MCAP storage plugin config (Humble rosbag2_storage_mcap).
# Keep keys conservative: only documented options, no compression to avoid
# failing on builds that lack the zstd plugin on Jetson.
chunk_size: 1048576
"""


def _tail(path: Path, max_bytes: int = 4096) -> str:
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - max_bytes))
            return f.read().decode("utf-8", errors="replace")
    except Exception:
        return ""


class BagManager:
    def __init__(self, storage_dir: Path):
        self.storage_dir = Path(storage_dir).expanduser()
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.record_process: Optional[subprocess.Popen] = None
        self.play_process: Optional[subprocess.Popen] = None
        self.current_record: Optional[Dict[str, Any]] = None
        self.record_watchdog: Optional[BagRecordWatchdog] = None
        self._play_state: Dict[str, Any] = {
            "bag_id": None,
            "bag_path": None,
            "rate": 1.0,
            "loop": False,
            "duration_sec": 0.0,
            "started_at": None,
            "paused": False,
            "paused_at": None,
            "paused_total": 0.0,
        }
        self._lock = threading.Lock()

    # ------------------ RECORD ------------------

    def _ensure_storage_config(self) -> Path:
        cfg_path = self.storage_dir / "mcap_storage_config.yaml"
        # Always (re)write — the embedded yaml is the source of truth; old
        # installs may have a stale/invalid config from an earlier version.
        cfg_path.write_text(MCAP_STORAGE_CONFIG_YAML, encoding="utf-8")
        return cfg_path

    def start_record(
        self,
        name: str,
        topics: List[str],
        description: str = "",
        tags: str = "",
        vehicle_type: str = "vehicle",
        max_bag_duration: int = 300,
        max_bag_size_mb: int = 200,
    ) -> Dict[str, Any]:
        with self._lock:
            if self.record_process and self.record_process.poll() is None:
                raise RuntimeError("Recording already running")

            stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            safe_name = "".join(ch for ch in name if ch.isalnum() or ch in ("-", "_")).strip("_")
            bag_name = safe_name or f"{stamp}_{vehicle_type}"
            bag_dir = self.storage_dir / bag_name

            # ros2 bag record требует несуществующую папку и создаёт её сам.
            # Если осталась пустая от упавшего запуска — подчищаем. Если с данными — отказываем.
            if bag_dir.exists():
                has_data = any(bag_dir.glob("*.mcap")) or any(bag_dir.glob("*.db3"))
                if has_data:
                    raise RuntimeError(
                        f"Папка '{bag_name}' уже существует с данными — выбери другое имя"
                    )
                shutil.rmtree(bag_dir)

            self.storage_dir.mkdir(parents=True, exist_ok=True)
            storage_cfg = self._ensure_storage_config()
            log_path = self.storage_dir / f"{bag_name}.record.log"

            cmd = [
                "ros2",
                "bag",
                "record",
                "--storage",
                "mcap",
                "--storage-config-file",
                str(storage_cfg),
                "--output",
                str(bag_dir),
                "--max-bag-duration",
                str(max_bag_duration),
                "--max-bag-size",
                str(max_bag_size_mb * 1024 * 1024),
            ]
            if topics:
                cmd.extend(topics)
            else:
                cmd.append("-a")
            record_log = open(str(log_path), "a", buffering=1)
            record_log.write("CMD: " + " ".join(cmd) + "\n")
            record_log.flush()
            self.record_process = subprocess.Popen(
                cmd, stdout=record_log, stderr=subprocess.STDOUT, preexec_fn=os.setsid
            )
            # Sanity-check: ros2 bag record sometimes exits in <1s on bad
            # storage config, missing plugin, or bad CLI. Catch it here so
            # we don't persist a phantom "recording" with no data.
            time.sleep(0.8)
            if self.record_process.poll() is not None:
                rc = self.record_process.returncode
                self.record_process = None
                raise RuntimeError(
                    f"ros2 bag record упал сразу после старта (rc={rc}). "
                    f"Лог: {log_path}\n----\n{_tail(log_path)}"
                )
            self.record_watchdog = BagRecordWatchdog(bag_dir)
            self.record_watchdog.start()
            self.current_record = {
                "name": bag_name,
                "file_path": str(bag_dir),
                "description": description,
                "tags": tags,
                "vehicle_type": vehicle_type,
                "topics": topics,
                "start_time": datetime.now().isoformat(),
                "pid": self.record_process.pid,
                "log_path": str(log_path),
            }
            return dict(self.current_record)

    def stop_record(self, timeout_sec: int = 15) -> Optional[Dict[str, Any]]:
        with self._lock:
            proc = self.record_process
            current = dict(self.current_record) if self.current_record else None
            already_dead = bool(proc and proc.poll() is not None)
            if not proc:
                self.record_process = None
                self.current_record = None
                return current
            if not already_dead:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGINT)
                except Exception:
                    proc.terminate()
                waited = 0.0
                while proc.poll() is None and waited < timeout_sec:
                    time.sleep(0.2)
                    waited += 0.2
                if proc.poll() is None:
                    proc.kill()
            rc = proc.returncode
            if self.record_watchdog:
                self.record_watchdog.stop()
                self.record_watchdog = None
            self.record_process = None
            self.current_record = None
            if current:
                current["returncode"] = rc
                current["died_early"] = already_dead
                log_path = current.get("log_path")
                if log_path:
                    current["log_tail"] = _tail(Path(log_path))
            return current

    def get_record_status(self) -> Dict[str, Any]:
        with self._lock:
            is_running = self.record_process is not None and self.record_process.poll() is None
            return {"recording": bool(is_running), "current": self.current_record}

    # ------------------ PLAY ------------------

    def start_play(
        self,
        bag_dir: str,
        rate: float = 1.0,
        loop: bool = False,
        topics: Optional[List[str]] = None,
        duration_sec: float = 0.0,
        bag_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            if self.play_process and self.play_process.poll() is None:
                raise RuntimeError("Playback already running")
            cmd = ["ros2", "bag", "play", str(Path(bag_dir).expanduser()), "--rate", str(rate)]
            if loop:
                cmd.append("--loop")
            if topics:
                cmd.extend(["--topics", *topics])
            self.play_process = subprocess.Popen(
                cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, preexec_fn=os.setsid
            )
            self._play_state = {
                "bag_id": bag_id,
                "bag_path": bag_dir,
                "rate": float(rate),
                "loop": bool(loop),
                "duration_sec": float(duration_sec),
                "started_at": time.monotonic(),
                "paused": False,
                "paused_at": None,
                "paused_total": 0.0,
            }
            return {
                "playing": True,
                "pid": self.play_process.pid,
                "bag_path": bag_dir,
                "bag_id": bag_id,
                "rate": rate,
                "loop": loop,
                "duration_sec": duration_sec,
            }

    def stop_play(self) -> None:
        with self._lock:
            if not self.play_process:
                return
            if self.play_process.poll() is None:
                # If currently paused, resume before SIGINT so the process can shut down cleanly.
                if self._play_state.get("paused"):
                    try:
                        os.killpg(os.getpgid(self.play_process.pid), signal.SIGCONT)
                    except Exception:
                        pass
                try:
                    os.killpg(os.getpgid(self.play_process.pid), signal.SIGINT)
                except Exception:
                    self.play_process.terminate()
            self.play_process = None
            self._play_state = {
                "bag_id": None,
                "bag_path": None,
                "rate": 1.0,
                "loop": False,
                "duration_sec": 0.0,
                "started_at": None,
                "paused": False,
                "paused_at": None,
                "paused_total": 0.0,
            }

    def pause_play(self) -> Dict[str, Any]:
        with self._lock:
            if not self.play_process or self.play_process.poll() is not None:
                raise RuntimeError("Нет активного воспроизведения")
            if self._play_state.get("paused"):
                return {"paused": True}
            try:
                os.killpg(os.getpgid(self.play_process.pid), signal.SIGSTOP)
            except Exception as e:
                raise RuntimeError(f"Не удалось приостановить: {e}")
            self._play_state["paused"] = True
            self._play_state["paused_at"] = time.monotonic()
            return {"paused": True}

    def resume_play(self) -> Dict[str, Any]:
        with self._lock:
            if not self.play_process or self.play_process.poll() is not None:
                raise RuntimeError("Нет активного воспроизведения")
            if not self._play_state.get("paused"):
                return {"paused": False}
            try:
                os.killpg(os.getpgid(self.play_process.pid), signal.SIGCONT)
            except Exception as e:
                raise RuntimeError(f"Не удалось возобновить: {e}")
            paused_at = self._play_state.get("paused_at") or time.monotonic()
            self._play_state["paused_total"] = float(self._play_state.get("paused_total") or 0.0) + (
                time.monotonic() - float(paused_at)
            )
            self._play_state["paused"] = False
            self._play_state["paused_at"] = None
            return {"paused": False}

    def get_play_status(self) -> Dict[str, Any]:
        with self._lock:
            running = self.play_process is not None and self.play_process.poll() is None
            state = dict(self._play_state)
            # Process may have ended on its own — reflect that and clear state.
            if not running:
                self.play_process = None
                self._play_state = {
                    "bag_id": None,
                    "bag_path": None,
                    "rate": 1.0,
                    "loop": False,
                    "duration_sec": 0.0,
                    "started_at": None,
                    "paused": False,
                    "paused_at": None,
                    "paused_total": 0.0,
                }
                return {"playing": False, "paused": False, "elapsed_sec": 0.0, "duration_sec": 0.0, "rate": 1.0}
            started_at = state.get("started_at") or time.monotonic()
            paused_total = float(state.get("paused_total") or 0.0)
            if state.get("paused"):
                paused_at = state.get("paused_at") or time.monotonic()
                wall_elapsed = max(0.0, float(paused_at) - float(started_at) - paused_total)
            else:
                wall_elapsed = max(0.0, time.monotonic() - float(started_at) - paused_total)
            elapsed_sec = wall_elapsed * float(state.get("rate") or 1.0)
            duration = float(state.get("duration_sec") or 0.0)
            if duration > 0:
                if state.get("loop"):
                    # rosbag2 --loop restarts playback from t=0; show the
                    # current-iteration progress, not the total wall time,
                    # otherwise the progress bar keeps growing past 100%.
                    elapsed_sec = elapsed_sec % duration
                else:
                    elapsed_sec = min(elapsed_sec, duration)
            return {
                "playing": True,
                "paused": bool(state.get("paused")),
                "elapsed_sec": round(elapsed_sec, 3),
                "duration_sec": round(duration, 3),
                "rate": float(state.get("rate") or 1.0),
                "loop": bool(state.get("loop")),
                "bag_id": state.get("bag_id"),
                "bag_path": state.get("bag_path"),
            }
