import os
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load root .env or local .env
root_env = Path(__file__).resolve().parent.parent.parent / ".env"
if root_env.exists():
    load_dotenv(dotenv_path=root_env)
else:
    load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = "LifeLine"
    PROJECT_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    MAPBOX_ACCESS_TOKEN: str = os.getenv("MAPBOX_ACCESS_TOKEN", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    DEMO_MODE: bool = os.getenv("DEMO_MODE", "true").lower() in ("true", "1", "t")
    
    # SQLite fallback location if DATABASE_URL is empty
    SQLITE_DB_PATH: str = str(Path(__file__).resolve().parent.parent / "lifeline.db")

settings = Settings()
