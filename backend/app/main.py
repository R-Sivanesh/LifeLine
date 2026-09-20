from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import Base, engine, SessionLocal
from app.seed.demo_data import seed_database
from app.api import health, emergencies, ambulances, hospitals, routes, demo

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables
    Base.metadata.create_all(bind=engine)
    # Seed default demo dataset if empty
    db = SessionLocal()
    try:
        seed_database(db, force_reset=False)
    finally:
        db.close()
    yield

app = FastAPI(
    title="LifeLine — Intelligent Emergency Response & Routing Platform",
    description=(
        "Mission-critical emergency response intelligence platform connecting emergency severity extraction, "
        "smart ambulance matching, hospital readiness checks, Mapbox dynamic routing, road risk assessment, "
        "and Golden Minute response-to-care optimization."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For flexible hackathon demo environments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(health.router, prefix="/api")
app.include_router(emergencies.router, prefix="/api")
app.include_router(ambulances.router, prefix="/api")
app.include_router(hospitals.router, prefix="/api")
app.include_router(routes.router, prefix="/api")
app.include_router(demo.router, prefix="/api")

@app.get("/", summary="Root index")
def read_root():
    return {
        "platform": "LifeLine Emergency Response Intelligence",
        "status": "online",
        "demo_mode": settings.DEMO_MODE,
        "docs": "/docs",
        "api_prefix": "/api"
    }
