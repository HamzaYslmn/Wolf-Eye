"""
MARK: TinyDB module — single-file JSON database for Wolf-Eye
Tables: drones, humans, comms, cameras
Usage:
  from modules.database import db, drones, humans, comms, cameras
Note: humans[0] = "player" (has objectives field for target markers)
Thread-safe: RLock middleware prevents concurrent read/write corruption.
"""
from pathlib import Path
from threading import RLock
from tinydb import TinyDB, Query
from tinydb.storages import JSONStorage
from tinydb.middlewares import Middleware

# MARK: Thread-safe middleware — prevents concurrent read/write corruption
class ThreadSafeMiddleware(Middleware):
    def __init__(self, storage_cls=JSONStorage):
        super().__init__(storage_cls)
        self._lock = RLock()

    def read(self):
        with self._lock:
            return self.storage.read()

    def write(self, data):
        with self._lock:
            self.storage.write(data)

    def close(self):
        with self._lock:
            self.storage.close()

# MARK: Database path
DB_PATH = Path(__file__).resolve().parent / 'db' / 'wolf_eye.json'
db = TinyDB(DB_PATH, indent=2, ensure_ascii=False,
            storage=ThreadSafeMiddleware(JSONStorage))

# MARK: Tables
drones  = db.table('drones')
humans  = db.table('humans')
comms   = db.table('comms')
cameras = db.table('cameras')

Q = Query()

# MARK: Photos directory
PHOTOS_DIR = DB_PATH.parent / 'photos'

# MARK: Seed — scan db/photos/ for camera metadata (idempotent)
def seed():
  """Populate cameras table from photos directory if empty."""
  if not cameras.all() and PHOTOS_DIR.exists():
    for f in sorted(PHOTOS_DIR.rglob('*')):
      if f.is_file() and f.suffix.lstrip('.').lower() in {'jpg', 'jpeg', 'png', 'webp', 'gif'}:
        rel = str(f.relative_to(PHOTOS_DIR)).replace('\\', '/')
        cameras.insert({'name': f.stem, 'category': f.parent.name, 'path': rel})

seed()
