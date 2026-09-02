"""
One-off script to promote a registered user to admin status.

Usage (from the project root, with your venv active):
    python make_admin.py someone@example.com

Run it again on the same email to demote them back to a citizen account.
There's no public signup path for admin accounts on purpose — this keeps
that decision out of the API entirely.
"""
import sys

from sqlmodel import Session, select

from app.database import engine, init_db
from app.models.hazard import HazardReport  # noqa: F401 — ensures table is registered
from app.models.status_history import StatusHistory  # noqa: F401
from app.models.feedback import ReportFeedback  # noqa: F401
from app.models.user import User


def main():
    if len(sys.argv) != 2:
        print("Usage: python make_admin.py someone@example.com")
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    init_db()

    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        if not user:
            print(f"No account found with email: {email}")
            sys.exit(1)

        user.is_admin = not user.is_admin
        session.add(user)
        session.commit()

        role = "ADMIN" if user.is_admin else "citizen"
        print(f"{user.name} ({user.email}) is now a {role}.")


if __name__ == "__main__":
    main()