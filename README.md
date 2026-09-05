# StreetWatch — Community Hazard Reporter

A crowdsourced local infrastructure hazard reporting app built for
**Summer School 2.0**, addressing **SDG 11 — Sustainable Cities and
Communities**.

Residents report infrastructure hazards (potholes, broken streetlights,
flooding, damaged roads, illegal dumping, water leakage, unsafe
infrastructure, fallen trees, electrical hazards, and more) by dropping a
pin on a map. Reports are tracked through a full status pipeline
(**Reported → Verified → In Progress → Resolved**) with a dated timeline,
so anyone can see what's being worked on. The platform also includes an
authority-facing admin dashboard, community confirmation/comments, and four
lightweight AI/data-science features.

Anyone can view the map, track a report, and browse the homepage without an
account (civic transparency). Filing a report, updating a status, confirming
a hazard, or commenting requires logging in — the app's authenticated
interactions are backed by real hashed-password accounts and JWT sessions
rather than a decorative login form.

**Pages:**
- `/` — homepage (live stats, category grid, recent reports, emergency alert banner, how-it-works, SDG 11 section)
- `/login` — login / create account
- `/map` — interactive hazard map + reporting dashboard, with filters and a toggleable risk-hotspot layer
- `/track` — public "Track a Report" lookup by Report ID (status timeline, community confirmations, comments)
- `/my-reports` — the logged-in user's own reports + in-app update notifications
- `/admin` — authority dashboard (reports, users, analytics) — admin accounts only

## Key features

**Citizen-facing**
- Hazard reporting form: 11 categories, GPS location with "Use My Location" or pin-on-map, photo/video evidence, severity, optional contact details
- Interactive map with severity-colored markers and filters (hazard type, status, severity, date range, location text)
- Status tracking with a public per-report timeline
- "My Reports" dashboard, editing a report before it's verified, and post-resolution feedback
- Community confirmations (a bucketed, transparent reliability score from confirmation counts) and per-report comments
- English / Sinhala language switch (`i18n.js`)

**Authority-facing**
- Admin dashboard: verify/reject reports, reassign department, update status, attach notes and resolution-photo evidence, manage user accounts
- Analytics dashboard: reports per month, most common hazard, top problem areas, severity distribution, average resolution time, department performance

**AI / data-science features** (`app/services/ai_service.py`)
- **Image classification** — zero-shot hazard-type + confidence guess from an uploaded photo, via a vision-capable Claude model (no labeled training dataset required)
- **Severity estimation** — keyword scoring on the description, optionally nudged by a pixel-darkness heuristic on the photo
- **Duplicate detection** — geography (haversine distance) + hazard type + recency, surfaced to the citizen *before* they submit a report that might already exist
- **Predictive risk analytics** — historical reports bucketed into a coarse grid and scored by recency-weighted frequency, shown on the map as a toggleable hotspot layer

**Python Bonus Brick:** the duplicate-detection feature relies on a genuine
calculation beyond basic CRUD — `haversine_distance_meters()` in
`ai_service.py` computes the great-circle distance between two GPS
coordinates. Without it, the app has no way to tell "the same pothole
reported twice" from "two different potholes," so it directly serves a real
need rather than being bolted on for its own sake. It's exercised on real
report data every time a report is submitted or looked up
(`find_possible_duplicates`), and was verified manually by filing two
reports at the same map location and confirming the duplicate warning
fired, then filing one further away and confirming it didn't.

## Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend framework | Python 3, FastAPI, Uvicorn (ASGI) | REST API, request validation, routing |
| Data layer | SQLModel (SQLAlchemy + Pydantic), SQLite | ORM + schema validation sharing one model definition |
| Authentication | PyJWT, bcrypt | Stateless session tokens, salted password hashing |
| Frontend | HTML5, CSS3, vanilla JavaScript | No framework — kept dependency-free and easy to explain |
| Mapping | Leaflet.js, OpenStreetMap tiles | Interactive map, markers, filters, risk-hotspot layer |
| AI — image classification | Anthropic Claude API (vision) | Zero-shot hazard-type + severity guess from photos |
| AI — severity heuristic | Pillow, NumPy | Keyword scoring + pixel-based image heuristic |
| AI — duplicate detection | Pure Python (haversine geometry) | Geo + hazard-type + recency matching, no ML needed |
| AI — predictive analytics | Pure Python (grid aggregation) | Recency-weighted report-frequency hotspots |
| Internationalization | Custom `i18n.js` | English / Sinhala language switch |

## Project structure

```
streetwatch/
├── app/
│   ├── main.py                # FastAPI app, mounts frontend + all routers
│   ├── database.py            # DB engine/session setup
│   ├── auth.py                # password hashing, JWT create/verify, get_current_user
│   ├── models/
│   │   ├── hazard.py          # HazardReport model + request/response schemas (incl. ai_* fields)
│   │   ├── user.py            # User model + auth request/response schemas
│   │   ├── feedback.py        # Post-resolution feedback model
│   │   ├── community.py       # Confirmation + comment models
│   │   └── status_history.py  # Per-report status timeline log
│   ├── services/
│   │   └── ai_service.py      # All four AI/data-science functions
│   └── routers/
│       ├── auth.py            # /api/auth/*
│       ├── reports.py         # /api/reports/* (CRUD, history, edit, feedback)
│       ├── community.py       # /api/reports/{id}/confirm, /comments
│       ├── analytics.py       # /api/analytics/* (duplicate check, risk areas)
│       └── admin.py           # /api/admin/* (report + user management, analytics)
├── frontend/
│   ├── home.html               # landing page
│   ├── login.html              # login / register
│   ├── map.html                # map + reporting dashboard
│   ├── track.html              # public report tracking page
│   ├── my-reports.html         # logged-in user's reports + notifications
│   ├── admin.html               # authority dashboard
│   └── static/
│       ├── style.css           # shared design system + map/track/legend/popup styles
│       ├── home.css            # homepage + login page + confirm/comments styles
│       ├── admin.css           # admin dashboard styles
│       ├── i18n.js             # English/Sinhala translations + language switch
│       ├── auth.js             # shared token storage + nav auth-state helpers
│       ├── app.js              # map page logic (markers, filters, duplicate check, risk layer)
│       ├── track.js            # track-by-ID page logic (timeline, confirmations, comments)
│       ├── home.js             # homepage stats/category/emergency logic
│       ├── my-reports.js       # "My Reports" dashboard + notification badge
│       ├── login-page.js       # login/register form logic
│       └── admin.js            # admin dashboard logic
├── make_admin.py               # CLI script to promote/demote a user to admin by email
├── requirements.txt
└── README.md
```

## Setup

1. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\Activate.ps1
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. (Optional) Set an Anthropic API key to enable AI image classification —
   without it, report creation still works fine, the `ai_hazard_type` /
   `ai_confidence` fields just stay `null`:
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...      # Windows: $env:ANTHROPIC_API_KEY = "sk-ant-..."
   ```

4. Run the server:
   ```bash
   uvicorn app.main:app --reload
   ```

5. Open:
   - **App:** http://127.0.0.1:8000/
   - **API docs (Swagger):** http://127.0.0.1:8000/docs

The SQLite database file (`hazards.db`) is created automatically on first
run. If you pull a schema change (new columns on an existing table), delete
`hazards.db` and restart — SQLModel's `create_all()` only creates missing
tables, it doesn't alter existing ones.

### Making yourself an admin

There's no public sign-up path for admin accounts. After registering
normally through the site, promote that account from the command line:
```bash
python make_admin.py your-email@example.com
```
Log out and back in afterward — the Admin nav link is set from the user
object saved at login time, so it won't appear until you re-authenticate.

## API endpoints

Authenticated requests send `Authorization: Bearer <token>`, where
`<token>` is the `access_token` returned by register/login.

**Auth** — `/api/auth`
| Method | Path | Auth? | Purpose |
|---|---|---|---|
| POST | `/register` | No | Create an account, returns a JWT |
| POST | `/login` | No | Log in, returns a JWT |

**Reports** — `/api/reports`
| Method | Path | Auth? | Purpose |
|---|---|---|---|
| POST | `` | **Yes** | Create a report (multipart/form-data; runs AI classification + severity estimation) |
| GET | `` | No | List reports, with filters (`hazard_type`, `status`, `severity`, `date_from`, `date_to`, `location`, `unresolved`, `limit`) |
| GET | `/stats` | No | Aggregate counts for the homepage stats bar |
| GET | `/mine` | **Yes** | The logged-in user's own reports |
| GET | `/{id}` | No | Get a single report |
| GET | `/{id}/history` | No | Status-change timeline for the track page |
| PATCH | `/{id}` | **Yes** | Update a report's status |
| PUT | `/{id}/edit` | **Yes** | Edit report details (owner only, before verification) |
| POST | `/{id}/feedback` | **Yes** | Leave post-resolution feedback (owner only, once resolved) |
| GET | `/{id}/feedback` | No | Read feedback for a report |
| DELETE | `/{id}` | No | Delete a report |

**Community** — `/api/reports`
| Method | Path | Auth? | Purpose |
|---|---|---|---|
| POST | `/{id}/confirm` | **Yes** | Toggle confirming a hazard is still there / was fixed |
| GET | `/{id}/confirmations` | No | Confirmation count + bucketed reliability label/score |
| GET | `/{id}/comments` | No | List comments |
| POST | `/{id}/comments` | **Yes** | Add a comment |

**Analytics (AI features)** — `/api/analytics`
| Method | Path | Auth? | Purpose |
|---|---|---|---|
| GET | `/check-duplicate` | No | Pre-flight duplicate check before submitting a report |
| GET | `/risk-areas` | No | Recency-weighted report-frequency grid (predictive hotspots) |

**Admin** — `/api/admin` (admin accounts only)
| Method | Path | Auth? | Purpose |
|---|---|---|---|
| GET | `/reports` | **Yes (admin)** | List/filter all reports for management |
| PATCH | `/reports/{id}` | **Yes (admin)** | Verify/reject, reassign department, add notes, attach resolution evidence |
| GET | `/analytics` | **Yes (admin)** | Reports/month, common hazard, top areas, severity distribution, avg. resolution time, department performance |
| GET | `/users` | **Yes (admin)** | List registered users |
| PATCH | `/users/{id}` | **Yes (admin)** | Activate/deactivate a user, toggle admin status |

## Notes for the technical documentation writeup

- **Problem statement:** Local infrastructure hazards often go unreported,
  or are reported redundantly and inconsistently, because there's no shared,
  visible log — StreetWatch gives citizens a lightweight way to flag issues
  and track resolution, and gives authorities a structured way to manage
  and analyze them.
- **Key features:** see the "Key features" section above.
- **Meaningful interactions:** (1) logging in / creating an account, (2)
  submitting a hazard report (triggers AI classification + severity
  estimation), (3) updating a report's status, (4) confirming a hazard or
  leaving a comment — all hit the FastAPI backend and persist to SQLite.
- **Python Bonus Brick:** see the dedicated section above — the haversine
  distance calculation behind duplicate detection.
