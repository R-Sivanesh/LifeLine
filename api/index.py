import sys
import os
import json
import traceback
from http.server import BaseHTTPRequestHandler
from pathlib import Path

# Mark environment as Vercel serverless
os.environ["VERCEL"] = "1"

# Prepare Python paths
current_dir = Path(__file__).resolve().parent
root_dir = current_dir.parent
backend_dir = root_dir / "backend"

for p in (str(current_dir), str(backend_dir), str(root_dir)):
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

import_error = None
fastapi_app = None

try:
    from app.main import app as fastapi_app
except Exception as e:
    import_error = {
        "error": str(e),
        "traceback": traceback.format_exc(),
        "sys_path": sys.path,
        "files_in_api": os.listdir(str(current_dir)) if current_dir.exists() else [],
        "files_in_root": os.listdir(str(root_dir)) if root_dir.exists() else [],
    }

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200 if import_error is None else 500)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        if import_error:
            self.wfile.write(json.dumps({"status": "error", "details": import_error}).encode())
        else:
            self.wfile.write(json.dumps({
                "status": "ok",
                "message": "LifeLine FastAPI Backend successfully initialized",
                "app_title": fastapi_app.title,
                "version": fastapi_app.version
            }).encode())

    def do_POST(self):
        self.do_GET()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
