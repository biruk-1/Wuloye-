"""
main.py — Wuloye AI Service (FastAPI)

Sprint 1: Foundation only.
No AI models or recommendation logic is implemented yet.
This service exposes a health check endpoint and establishes the
structure that future AI features will be built upon.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ─── Application Factory ──────────────────────────────────────────────────────

app = FastAPI(
    title="Wuloye AI Service",
    description="Python microservice for AI/ML features",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS ────────────────────────────────────────────────────────────────────
# Restrict to known origins in production via environment variable if needed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/api/health", tags=["Health"])
def health_check():
    """
    Returns the operational status of the AI service.
    Used by Docker health checks and the backend service.
    """
    return {"status": "AI Service Running"}


# Future routers will be included here in subsequent sprints:
# app.include_router(recommendations_router, prefix="/api/recommendations")
# app.include_router(models_router,          prefix="/api/models")
