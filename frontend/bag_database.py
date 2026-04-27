import sqlite3
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


class BagDatabase:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path).expanduser()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=FULL")
        conn.execute("PRAGMA wal_autocheckpoint=1000")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS bags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    file_path TEXT NOT NULL UNIQUE,
                    format TEXT NOT NULL DEFAULT 'mcap',
                    size_bytes INTEGER DEFAULT 0,
                    duration_ns INTEGER DEFAULT 0,
                    message_count INTEGER DEFAULT 0,
                    start_time TEXT NOT NULL,
                    end_time TEXT,
                    status TEXT NOT NULL DEFAULT 'active',
                    description TEXT,
                    vehicle_type TEXT,
                    tags TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS bag_topics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bag_id INTEGER NOT NULL REFERENCES bags(id) ON DELETE CASCADE,
                    topic_name TEXT NOT NULL,
                    message_type TEXT NOT NULL,
                    message_count INTEGER DEFAULT 0,
                    frequency_hz REAL
                );

                CREATE TABLE IF NOT EXISTS bag_operations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bag_id INTEGER REFERENCES bags(id) ON DELETE SET NULL,
                    operation TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'started',
                    started_at TEXT DEFAULT (datetime('now')),
                    finished_at TEXT,
                    error_message TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_bags_status ON bags(status);
                CREATE INDEX IF NOT EXISTS idx_bags_start_time ON bags(start_time);
                CREATE INDEX IF NOT EXISTS idx_bag_topics_bag_id ON bag_topics(bag_id);
                """
            )

    def create_bag(self, payload: Dict[str, Any]) -> int:
        cols = [
            "name",
            "file_path",
            "format",
            "size_bytes",
            "duration_ns",
            "message_count",
            "start_time",
            "end_time",
            "status",
            "description",
            "vehicle_type",
            "tags",
        ]
        values = [payload.get(c) for c in cols]
        with self._connect() as conn:
            cur = conn.execute(
                f"INSERT INTO bags ({','.join(cols)}) VALUES ({','.join(['?'] * len(cols))})",
                values,
            )
            return int(cur.lastrowid)

    def update_bag(self, bag_id: int, payload: Dict[str, Any]) -> None:
        allowed = {
            "name",
            "size_bytes",
            "duration_ns",
            "message_count",
            "end_time",
            "status",
            "description",
            "tags",
            "vehicle_type",
        }
        updates = {k: v for k, v in payload.items() if k in allowed}
        if not updates:
            return
        assignments = [f"{k} = ?" for k in updates]
        params = list(updates.values()) + [bag_id]
        with self._connect() as conn:
            conn.execute(
                f"UPDATE bags SET {', '.join(assignments)}, updated_at = datetime('now') WHERE id = ?",
                params,
            )

    def set_topics(self, bag_id: int, topics: Iterable[Dict[str, Any]]) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM bag_topics WHERE bag_id = ?", (bag_id,))
            for topic in topics:
                conn.execute(
                    """
                    INSERT INTO bag_topics (bag_id, topic_name, message_type, message_count, frequency_hz)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        bag_id,
                        topic.get("topic_name"),
                        topic.get("message_type", "unknown"),
                        topic.get("message_count", 0),
                        topic.get("frequency_hz"),
                    ),
                )

    def get_bag(self, bag_id: int) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM bags WHERE id = ?", (bag_id,)).fetchone()
            if not row:
                return None
            topics = conn.execute(
                "SELECT topic_name, message_type, message_count, frequency_hz FROM bag_topics WHERE bag_id = ? ORDER BY topic_name",
                (bag_id,),
            ).fetchall()
        item = dict(row)
        item["topics"] = [dict(t) for t in topics]
        return item

    def list_bags(
        self,
        status: Optional[str] = None,
        from_time: Optional[str] = None,
        to_time: Optional[str] = None,
        search: Optional[str] = None,
        tags: Optional[str] = None,
        sort: str = "start_time",
        order: str = "desc",
        page: int = 1,
        per_page: int = 50,
    ) -> Dict[str, Any]:
        sort_allowed = {"name", "start_time", "size_bytes", "message_count", "status", "updated_at"}
        sort_col = sort if sort in sort_allowed else "start_time"
        sort_order = "ASC" if str(order).lower() == "asc" else "DESC"
        where: List[str] = []
        params: List[Any] = []
        if status:
            where.append("status = ?")
            params.append(status)
        # Compare timestamps via strftime('%s', ...) so the filter works
        # consistently regardless of whether the row's start_time is a
        # naive local ISO string (from datetime.now().isoformat()) or
        # tz-aware UTC (from _iso_from_ns). String compare on raw ISO
        # mishandles the second-precision boundary on the upper bound.
        if from_time:
            where.append("CAST(strftime('%s', start_time) AS INTEGER) >= CAST(strftime('%s', ?) AS INTEGER)")
            params.append(from_time)
        if to_time:
            where.append("CAST(strftime('%s', start_time) AS INTEGER) <= CAST(strftime('%s', ?) AS INTEGER)")
            params.append(to_time)
        if search:
            where.append("(name LIKE ? OR COALESCE(description,'') LIKE ?)")
            like = f"%{search}%"
            params.extend([like, like])
        if tags:
            where.append("COALESCE(tags,'') LIKE ?")
            params.append(f"%{tags}%")
        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        page = max(1, int(page))
        per_page = max(1, min(500, int(per_page)))
        offset = (page - 1) * per_page
        with self._connect() as conn:
            total = conn.execute(f"SELECT COUNT(*) AS c FROM bags {where_sql}", params).fetchone()["c"]
            rows = conn.execute(
                f"SELECT * FROM bags {where_sql} ORDER BY {sort_col} {sort_order} LIMIT ? OFFSET ?",
                [*params, per_page, offset],
            ).fetchall()
        return {
            "items": [dict(r) for r in rows],
            "page": page,
            "per_page": per_page,
            "total": total,
        }

    def find_bag_by_path(self, bag_path: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM bags WHERE file_path = ?", (bag_path,)).fetchone()
        return dict(row) if row else None

    def delete_bag(self, bag_id: int) -> Optional[Dict[str, Any]]:
        bag = self.get_bag(bag_id)
        if not bag:
            return None
        with self._connect() as conn:
            conn.execute("DELETE FROM bags WHERE id = ?", (bag_id,))
        return bag

    def recording_bags(self) -> List[Tuple[int, str]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT id, file_path FROM bags WHERE status = 'recording'").fetchall()
        return [(int(r["id"]), str(r["file_path"])) for r in rows]

    def add_operation(
        self,
        operation: str,
        bag_id: Optional[int] = None,
        status: str = "started",
        error_message: Optional[str] = None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO bag_operations (bag_id, operation, status, finished_at, error_message)
                VALUES (?, ?, ?, datetime('now'), ?)
                """,
                (bag_id, operation, status, error_message),
            )
