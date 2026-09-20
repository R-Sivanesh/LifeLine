import sys
import os
from pathlib import Path

# Ensure Vercel serverless marker is set
os.environ["VERCEL"] = "1"

# Add directories to Python sys.path
current_dir = Path(__file__).resolve().parent
root_dir = current_dir.parent
backend_dir = root_dir / "backend"

for p in (str(current_dir), str(backend_dir), str(root_dir)):
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

# Import real FastAPI application
from app.main import app
