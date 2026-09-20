import sys
import os
import json
import traceback
from http.server import BaseHTTPRequestHandler
from pathlib import Path

logs = []

def log(msg):
    logs.append(msg)

log(f"Starting index.py execution, Python {sys.version}")

current_dir = Path(__file__).resolve().parent
root_dir = current_dir.parent
backend_dir = root_dir / "backend"

for p in (str(current_dir), str(backend_dir), str(root_dir)):
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

os.environ["VERCEL"] = "1"

try:
    log("Testing fastapi import")
    import fastapi
    log(f"Fastapi version: {fastapi.__version__}")
except Exception as e:
    log(f"Fastapi import failed: {e}\n{traceback.format_exc()}")

try:
    log("Testing pydantic import")
    import pydantic
    log(f"Pydantic version: {pydantic.__version__}")
except Exception as e:
    log(f"Pydantic import failed: {e}\n{traceback.format_exc()}")

try:
    log("Testing sqlalchemy import")
    import sqlalchemy
    log(f"SQLAlchemy version: {sqlalchemy.__version__}")
except Exception as e:
    log(f"SQLAlchemy import failed: {e}\n{traceback.format_exc()}")

try:
    log("Testing app.main import")
    from app.main import app as fastapi_app
    log("Successfully imported app.main:app")
except Exception as e:
    log(f"App import failed: {e}\n{traceback.format_exc()}")

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({
            "status": "diagnostic_complete",
            "logs": logs,
            "sys_path": sys.path,
            "cwd": os.getcwd()
        }, indent=2).encode())

    def do_POST(self):
        self.do_GET()
