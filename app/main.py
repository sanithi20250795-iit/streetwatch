"""
Entry point for the Hazard Reporting API.

Run locally with:
    uvicorn app.main:app --reload

Then visit:
    http://127.0.0.1:8000/          -> the frontend map/report page
    http://127.0.0.1:8000/docs      -> interactive Swagger API docs
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.routers import admin, analytics, auth, community, reports

from app.database import init_db

app = FastAPI(
    title="Community Hazard Reporter",
    description="Crowdsourced local hazard reporting for SDG 11 — Sustainable Cities and Communities.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


app.include_router(auth.router)
app.include_router(reports.router)
app.include_router(admin.router)
app.include_router(community.router)
app.include_router(analytics.router)

app.mount("/static", StaticFiles(directory="frontend/static"), name="static")


@app.get("/")
def serve_home():
    return FileResponse("frontend/home.html")


@app.get("/login")
def serve_login():
    return FileResponse("frontend/login.html")


@app.get("/map")
def serve_map():
    return FileResponse("frontend/map.html")


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/track")
def serve_track():
    return FileResponse("frontend/track.html")


@app.get("/my-reports")
def serve_my_reports():
    return FileResponse("frontend/my-reports.html")


@app.get("/admin")
def serve_admin():
    return FileResponse("frontend/admin.html")

@app.get("/privacy")
def serve_privacy():
    return FileResponse("frontend/privacy.html")

@app.get("/terms")
def serve_terms():
    return FileResponse("frontend/terms.html")