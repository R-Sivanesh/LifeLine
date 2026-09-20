import sys
import os
from pathlib import Path

# Ensure Vercel serverless marker is set before loading app modules
os.environ["VERCEL"] = "1"

# Add backend and root directories to Python search path
current_dir = Path(__file__).resolve().parent
root_dir = current_dir.parent
backend_dir = root_dir / "backend"

for p in (str(backend_dir), str(root_dir), str(current_dir)):
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

# Import FastAPI application
from app.main import app
from app.database import Base, engine, SessionLocal
from app.seed.demo_data import seed_database

# Guarantee tables and initial seed data on serverless cold start
try:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db, force_reset=False)
    finally:
        db.close()
except Exception as err:
    print(f"Serverless cold start bootstrap notice: {err}")

# Expose both app and handler for Vercel Python runtime
handler = app
