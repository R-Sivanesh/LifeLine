from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import Base, engine, SessionLocal
from app.seed.demo_data import seed_database
from app.api import health, emergencies, ambulances, hospitals, routes, demo, ai, data_status, location

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Print configuration status audit (without exposing secrets)
    settings.print_startup_banner()
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
        "Mission-critical emergency response intelligence platform connecting Gemini conversational dispatch, "
        "smart capability ambulance matching, Google Places hospital readiness checks, Google Routes dynamic live traffic routing, "
        "road risk assessment, and Golden Minute response-to-care optimization."
    ),
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(health.router, prefix="/api")
app.include_router(location.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(data_status.router, prefix="/api")
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
