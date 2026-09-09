import os
import tempfile

os.environ.setdefault(
    "DATABASE_PATH", os.path.join(tempfile.mkdtemp(prefix="pm-test-db-"), "kanban.db")
)
