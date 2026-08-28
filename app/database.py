"""
Database setup for the Hazard Reporting app.

Uses SQLite for local dev — swap DATABASE_URL for a Postgres URL later
if you want to deploy (e.g. on Render or Railway) without changing any
other code, since SQLModel/SQLAlchemy abstract the SQL dialect for us.
"""
from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = "sqlite:///./hazards.db"

# check_same_thread=False is needed only for SQLite when used with FastAPI's
# threaded request handling — not needed if you switch to Postgres.
engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})


def init_db() -> None:
    """Create all tables. Called once on app startup."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency that yields a DB session per-request."""
    with Session(engine) as session:
        yield session
