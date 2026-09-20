"""
Vercel ASGI application entrypoint for LifeLine FastAPI backend.
"""
from app.main import app

__all__ = ["app"]
