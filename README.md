# Streetwatch — Community Hazard Reporter

A crowdsourced local hazard reporting app built for **Summer School 2.0**,
addressing **SDG 11 — Sustainable Cities and Communities**.

Residents report infrastructure hazards (potholes, broken streetlights,
flooding, damaged sidewalks, fallen trees) by dropping a pin on a map.
Reports are tracked through a status pipeline (**Reported → In Progress →
Resolved**) so anyone can see what's being worked on.

Anyone can view the map without an account (civic transparency). Filing a
report or updating a status requires logging in — this is the app's
authenticated interaction, backed by real hashed-password accounts and JWT
sessions rather than a decorative login form.

**Pages:**
- `/` — homepage
- `/login` — login / create account
- `/map` — the interactive hazard map + reporting dashboard

## Tech stack

- **Backend:** Python, FastAPI, SQLModel (SQLAlchemy + Pydantic)
- **Auth:** JWT sessions (PyJWT) + bcrypt password hashing
- **Database:** SQLite (swap the `DATABASE_URL` in `app/database.py` for
  Postgres if you deploy)
- **Frontend:** Vanilla HTML/CSS/JS + Leaflet.js for the map (no framework —
  kept simple so every line is easy to explain)

## Project structure


hazard-report-app/
├── app/
│   ├── main.py              # FastAPI app, mounts frontend + routes
│   ├── database.py          # DB engine/session setup
│   ├── auth.py              # password hashing, JWT create/verify, get_current_user
│   ├── models/
│   │   ├── hazard.py        # HazardReport model + request/response schemas
│   │   └── user.py          # User model + auth request/response schemas
│   └── routers/
│       ├── auth.py          # /api/auth/register, /api/auth/login
│       └── reports.py       # /api/reports CRUD endpoints (report/status routes require login)
├── frontend/
│   ├── home.html            # landing page
│   ├── login.html           # login / register
│   ├── map.html             # map + reporting dashboard
│   └── static/
│       ├── style.css        # shared design system + map page styles
│       ├── home.css         # homepage + login page styles
│       ├── auth.js          # shared token storage helpers
│       ├── app.js           # map page logic
│       └── login-page.js    # login/register form logic
├── requirements.txt
└── README.md

## Setup

1. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the server:
   ```bash
   uvicorn app.main:app --reload
   ```

4. Open:
   - **App:** http://127.0.0.1:8000/
   - **API docs (Swagger):** http://127.0.0.1:8000/docs

The SQLite database file (`hazards.db`) is created automatically on first run.

## API endpoints

| Method | Path                  | Auth required? | Purpose                          |
|--------|-----------------------|-----------------|-----------------------------------|
| POST   | `/api/auth/register`  | No              | Create an account, returns a JWT  |
| POST   | `/api/auth/login`     | No              | Log in, returns a JWT             |
| POST   | `/api/reports`        | **Yes**         | Create a new hazard report        |
| GET    | `/api/reports`        | No              | List reports (optional `?status=`)|
| GET    | `/api/reports/{id}`   | No              | Get a single report               |
| PATCH  | `/api/reports/{id}`   | **Yes**         | Update a report's status          |
| DELETE | `/api/reports/{id}`   | No              | Delete a report                   |

Authenticated requests send `Authorization: Bearer <token>`, where `<token>`
is the `access_token` returned by register/login.

## Notes for the technical documentation writeup

- **Problem statement:** Local infrastructure hazards often go unreported or
  unresolved for a long time because there's no shared, visible log — this
  app gives communities a lightweight way to flag issues and track resolution.
- **Key features:** homepage, account registration/login, interactive map,
  pin-drop reporting, status pipeline, status filtering, auto-generated API
  docs.
- **Meaningful interactions:** (1) logging in / creating an account, (2)
  submitting a hazard report, (3) updating a report's status — all hit the
  FastAPI backend and persist to SQLite.
