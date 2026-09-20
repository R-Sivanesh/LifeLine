import os
import tempfile
from pathlib import Path
from typing import List
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
    PROJECT_VERSION: str = "2.0.0"
    API_PREFIX: str = "/api"
    
    # Mapbox Platform
    MAPBOX_ACCESS_TOKEN: str = os.getenv("MAPBOX_ACCESS_TOKEN", "")
    
    # AI Providers
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    
    # Google Maps Platform (Routes, Places, Maps JS)
    GOOGLE_MAPS_API_KEY: str = os.getenv("GOOGLE_MAPS_API_KEY", "")
    GOOGLE_ROUTES_API_KEY: str = os.getenv("GOOGLE_ROUTES_API_KEY", os.getenv("GOOGLE_MAPS_API_KEY", ""))
    GOOGLE_PLACES_API_KEY: str = os.getenv("GOOGLE_PLACES_API_KEY", os.getenv("GOOGLE_MAPS_API_KEY", ""))
    
    # Database & Environment
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    DEMO_MODE: bool = os.getenv("DEMO_MODE", "true").lower() in ("true", "1", "t")
    IS_VERCEL: bool = bool(os.getenv("VERCEL") in ("1", "true", "True") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
    
    # SQLite fallback location if DATABASE_URL is empty
    SQLITE_DB_PATH: str = os.path.join(tempfile.gettempdir(), "lifeline.db") if (os.getenv("VERCEL") in ("1", "true", "True") or os.getenv("AWS_LAMBDA_FUNCTION_NAME")) else str(Path(__file__).resolve().parent.parent / "lifeline.db")

    def get_allowed_origins(self) -> List[str]:
        origins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000"
        ]
        if self.FRONTEND_URL and self.FRONTEND_URL.strip():
            url = self.FRONTEND_URL.strip().rstrip("/")
            if url not in origins:
                origins.append(url)
        return origins

    def is_database_configured(self) -> bool:
        return bool(self.DATABASE_URL and self.DATABASE_URL.strip() and not self.DATABASE_URL.startswith("sqlite:///"))

    def get_config_summary(self) -> dict:
        has_gemini = bool(self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip() and not self.GEMINI_API_KEY.startswith("your_"))
        has_mapbox = bool(self.MAPBOX_ACCESS_TOKEN and self.MAPBOX_ACCESS_TOKEN.strip() and not self.MAPBOX_ACCESS_TOKEN.startswith("your_"))
        has_google_maps = bool(self.GOOGLE_MAPS_API_KEY and self.GOOGLE_MAPS_API_KEY.strip() and not self.GOOGLE_MAPS_API_KEY.startswith("your_"))
        has_google_routes = bool(self.GOOGLE_ROUTES_API_KEY and self.GOOGLE_ROUTES_API_KEY.strip() and not self.GOOGLE_ROUTES_API_KEY.startswith("your_"))
        has_google_places = bool(self.GOOGLE_PLACES_API_KEY and self.GOOGLE_PLACES_API_KEY.strip() and not self.GOOGLE_PLACES_API_KEY.startswith("your_"))
        has_production_db = self.is_database_configured()

        if has_production_db:
            db_status = "CONFIGURED (PostgreSQL / Managed DB)"
        elif self.IS_VERCEL:
            db_status = "NOT CONFIGURED (Ephemeral Serverless Storage)"
        else:
            db_status = "CONFIGURED (Local SQLite)"
        
        return {
            "database": db_status,
            "gemini_ai": f"CONFIGURED ({self.GEMINI_MODEL})" if has_gemini else "MISSING (Local Rule Engine)",
            "mapbox": "CONFIGURED" if has_mapbox else "MISSING",
            "google_maps": "CONFIGURED" if has_google_maps else "MISSING",
            "google_routes": "CONFIGURED" if has_google_routes else "MISSING",
            "google_places": "CONFIGURED" if has_google_places else "MISSING",
        }

    def print_startup_banner(self):
        summary = self.get_config_summary()
        print("\n" + "=" * 55)
        print(" LifeLine 2.0 — Emergency Intelligence Startup Audit")
        print("=" * 55)
        print(f"  {'✓' if 'CONFIGURED' in summary['database'] and 'Ephemeral' not in summary['database'] else '⚠'} Database:       {summary['database']}")
        print(f"  {'✓' if 'CONFIGURED' in summary['gemini_ai'] else '⚠'} Gemini AI:      {summary['gemini_ai']}")
        print(f"  {'✓' if summary['mapbox'] == 'CONFIGURED' else '⚠'} Mapbox:         {summary['mapbox']}")
        print(f"  {'✓' if summary['google_maps'] == 'CONFIGURED' else '⚠'} Google Maps:    {summary['google_maps']}")
        print(f"  {'✓' if summary['google_routes'] == 'CONFIGURED' else '⚠'} Google Routes:  {summary['google_routes']}")
        print(f"  {'✓' if summary['google_places'] == 'CONFIGURED' else '⚠'} Google Places:  {summary['google_places']}")
        print("=" * 55 + "\n")

settings = Settings()
