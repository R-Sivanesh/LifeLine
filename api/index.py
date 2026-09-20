import sys
import os
import json
import traceback
from pathlib import Path

os.environ["VERCEL"] = "1"

current_dir = Path(__file__).resolve().parent
root_dir = current_dir.parent
backend_dir = root_dir / "backend"

for p in (str(current_dir), str(backend_dir), str(root_dir)):
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

import_error = None
real_app = None

try:
    from app.main import app as real_app
except Exception as e:
    import_error = {
        "error": str(e),
        "traceback": traceback.format_exc(),
        "sys_path": sys.path
    }

async def app(scope, receive, send):
    if scope['type'] != 'http':
        if real_app:
            await real_app(scope, receive, send)
        return

    if import_error:
        body = json.dumps({"status": "import_failed", "details": import_error}).encode('utf-8')
        await send({
            'type': 'http.response.start',
            'status': 500,
            'headers': [
                [b'content-type', b'application/json'],
                [b'content-length', str(len(body)).encode('utf-8')],
            ]
        })
        await send({
            'type': 'http.response.body',
            'body': body,
        })
        return

    try:
        await real_app(scope, receive, send)
    except Exception as exc:
        err_data = {
            "status": "runtime_exception",
            "error": str(exc),
            "traceback": traceback.format_exc(),
            "scope_path": scope.get("path"),
            "scope_type": scope.get("type")
        }
        body = json.dumps(err_data).encode('utf-8')
        await send({
            'type': 'http.response.start',
            'status': 500,
            'headers': [
                [b'content-type', b'application/json'],
                [b'content-length', str(len(body)).encode('utf-8')],
            ]
        })
        await send({
            'type': 'http.response.body',
            'body': body,
        })
