# LifeLine 2.0 — Real-Time Emergency Response Intelligence + Gemini Dispatcher

> **Core Mission**: *"From Emergency to Appropriate Care — Coordinating conversational AI dispatch, smart ambulance capability matching, verified hospital placement, live traffic routing, and Golden Minute response optimization."*

---

## 📌 Architecture & Tech Stack

LifeLine 2.0 is designed as a unified monorepo deploying both the React/Vite frontend and FastAPI backend under a single Vercel project using **Vercel Services**:

```
LifeLine/
├── frontend/             # React + Vite Single Page Application
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── backend/              # Python FastAPI ASGI Backend
│   ├── app/
│   │   ├── main.py       # FastAPI application (app)
│   │   ├── api/          # Routers (/api/health, /api/ai, /api/emergencies, etc.)
│   │   └── services/     # Gemini, Geocoding, Optimization services
│   ├── main.py           # Vercel ASGI entrypoint (main:app)
│   ├── requirements.txt  # Python dependencies (FastAPI, SQLAlchemy, psycopg2-binary)
│   └── run.py            # Local development runner
│
└── vercel.json           # Vercel Services multi-service configuration
```

### URL Routing Architecture
- **Web Frontend**: `/` and all client SPA paths (`/emergency/new`, `/simulation`, `/history`) → React / Vite Frontend
- **API Backend**: `/api/*` → FastAPI Backend Service
- **API Documentation**: `/api/docs` → Interactive Swagger UI

Both frontend and backend share the same origin domain (e.g. `https://<lifeline>.vercel.app`), eliminating cross-origin CORS barriers while using clean same-origin `/api` calls.

---

## 🚀 Vercel Deployment Guide

Deploying LifeLine to Vercel requires **ONE Vercel Project** utilizing the modern **Vercel Services** multi-service configuration in `vercel.json`:

### `vercel.json` Specification:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "version": 2,
  "services": {
    "frontend": {
      "root": "frontend",
      "framework": "vite"
    },
    "backend": {
      "root": "backend",
      "entrypoint": "main:app"
    }
  },
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": {
        "service": "backend"
      }
    },
    {
      "source": "/(.*)",
      "destination": {
        "service": "frontend"
      }
    }
  ]
}
```

---

## 🔐 Environment Variables Configuration

Configure these in **Vercel Project Settings → Environment Variables**:

### Backend Secrets (Production)
| Variable | Description | Required / Fallback |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API Key for Dispatcher AI | Optional (Falls back to deterministic rule engine) |
| `GEMINI_MODEL` | Gemini model name (default: `gemini-2.5-flash`) | Optional |
| `DATABASE_URL` | PostgreSQL Connection URI (e.g. Neon, Supabase) | Optional (Reports `NOT CONFIGURED` if omitted) |
| `GOOGLE_MAPS_API_KEY` | Google Maps Platform API Key | Optional (Falls back to OpenStreetMap / Mapbox) |
| `GOOGLE_ROUTES_API_KEY` | Google Routes API Key (Traffic aware) | Optional (Uses Google Maps Key if omitted) |
| `GOOGLE_PLACES_API_KEY` | Google Places API Key (Hospital search) | Optional (Uses Google Maps Key if omitted) |
| `DEMO_MODE` | Set `true` to enable demo scenario tools | Optional (Default: `true`) |
| `FRONTEND_URL` | Deployed frontend origin for CORS | Optional (Default: auto-matches Vercel domains) |

### Frontend Public Variables
| Variable | Description | Required / Fallback |
|---|---|---|
| `VITE_API_BASE_URL` | API Base URL (Set to `/api`) | Required (Default: `/api`) |
| `VITE_MAPBOX_ACCESS_TOKEN` | Mapbox public GL token (`pk.eyJ...`) | Optional (Falls back to tactical canvas radar) |
| `VITE_GOOGLE_MAPS_API_KEY` | Client Google Maps JS API key | Optional |

> [!NOTE]
> Frontend client variables MUST begin with `VITE_`. Backend secrets (like `GEMINI_API_KEY`) must NOT use `VITE_`.

---

## 🗄️ Database Strategy

- **Local Development**: Uses local SQLite (`lifeline.db`).
- **Production on Vercel**: Connects to any managed PostgreSQL database provided in `DATABASE_URL` (e.g., Neon, Supabase, AWS RDS, Vercel Postgres).
- **Graceful Zero-Config Fallback**: If `DATABASE_URL` is omitted on Vercel, the app runs safely using ephemeral serverless storage (`/tmp/lifeline.db`) and audits `DATABASE: NOT CONFIGURED` in the provenance audit footer without crashing.

---

## 💻 Local Development

### 1. Backend Setup
```bash
# Install Python dependencies
pip install -r backend/requirements.txt

# Run automated tests (20/20 test suite)
python -m pytest backend/tests

# Start local FastAPI backend (http://localhost:8000)
python backend/run.py
```

### 2. Frontend Setup
```bash
cd frontend

# Install Node dependencies
npm install

# Run TypeScript build verification
npm run build

# Start local Vite dev server (http://localhost:5173)
npm run dev
```

---

## 🧪 Verification & Health Checks

Verify your deployment directly:

- **API Health Check**:
  ```bash
  curl https://<your-project>.vercel.app/api/health
  # Returns: {"status":"ok","service":"LifeLine Emergency Response Platform"}
  ```

- **Data Sources Provenance Audit**:
  ```bash
  curl https://<your-project>.vercel.app/api/data/status
  ```

- **Geocoding & Landmark Search**:
  ```bash
  curl "https://<your-project>.vercel.app/api/location/search?query=Tambaram"
  ```

- **Direct SPA Navigation**:
  Navigate directly in browser to `/emergency/new`, `/simulation`, `/history` — all routes resolve seamlessly through the client router without 404s.
