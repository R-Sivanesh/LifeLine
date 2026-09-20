import sys
import os
import traceback
from pathlib import Path

# Mark environment as Vercel serverless
os.environ["VERCEL"] = "1"

try:
    current_dir = Path(__file__).resolve().parent
    root_dir = current_dir.parent
    backend_dir = root_dir / "backend"

    for p in (str(backend_dir), str(root_dir), str(current_dir)):
        if os.path.exists(p) and p not in sys.path:
            sys.path.insert(0, p)

    # Import the real FastAPI application
    from app.main import app
    handler = app

except Exception as exc:
    error_traceback = traceback.format_exc()
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    app = FastAPI(title="LifeLine Bootstrap Error Diagnostics")

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
    async def bootstrap_error(full_path: str):
        return JSONResponse(
            status_code=500,
            content={
                "error": "Serverless FastAPI Bootstrap Failure",
                "exception": str(exc),
                "traceback": error_traceback,
                "cwd": os.getcwd(),
                "sys_path": sys.path,
                "api_files": os.listdir(str(Path(__file__).resolve().parent)),
                "root_files": os.listdir(str(Path(__file__).resolve().parent.parent))
            }
        )

    handler = app
