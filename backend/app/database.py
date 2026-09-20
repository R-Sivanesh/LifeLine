import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

logger = logging.getLogger(__name__)

database_url = settings.DATABASE_URL.strip()

if not database_url:
    # Use SQLite database
    sqlite_path = settings.SQLITE_DB_PATH.replace("\\", "/")
    database_url = f"sqlite:///{sqlite_path}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    if settings.IS_VERCEL:
        logger.warning("DATABASE: NOT CONFIGURED. Running in ephemeral serverless mode at /tmp/lifeline.db. Set DATABASE_URL in Vercel environment variables for persistence.")
else:
    # Ensure postgresql:// prefix if using postgres:// (e.g. Neon, Supabase, Heroku style)
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    engine = create_engine(database_url, pool_pre_ping=True)
    logger.info("DATABASE: CONFIGURED with managed production database.")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
