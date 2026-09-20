from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import Base, engine, SessionLocal
from app.seed.demo_data import seed_database
from app.api import health, emergencies, ambulances, hospitals, routes, demo, ai, data_status, location

def init_db():
    try:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            seed_database(db, force_reset=False)
        finally:
            db.close()
    except Exception as e:
        print(f"DB bootstrap notice: {e}")

# Bootstrap database immediately on module load for serverless environments
init_db()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Print configuration status audit (without exposing secrets)
    settings.print_startup_banner()
    init_db()
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

# Include Routers with /api prefix
app.include_router(health.router, prefix="/api")
app.include_router(location.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(data_status.router, prefix="/api")
app.include_router(emergencies.router, prefix="/api")
app.include_router(ambulances.router, prefix="/api")
app.include_router(hospitals.router, prefix="/api")
app.include_router(routes.router, prefix="/api")
app.include_router(demo.router, prefix="/api")

# Also include Routers at root for direct serverless function path resolution
app.include_router(health.router)
app.include_router(location.router)
app.include_router(ai.router)
app.include_router(data_status.router)
app.include_router(emergencies.router)
app.include_router(ambulances.router)
app.include_router(hospitals.router)
app.include_router(routes.router)
app.include_router(demo.router)

@app.get("/", summary="Root index")
def read_root():
    return {
        "platform": "LifeLine Emergency Response Intelligence",
        "status": "online",
        "demo_mode": settings.DEMO_MODE,
        "docs": "/docs",
        "api_prefix": "/api"
    }
