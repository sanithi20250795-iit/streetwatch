"""
The User model — kept separate from HazardReport since it's a distinct
entity. Passwords are never stored in plaintext; only the bcrypt hash is.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


class UserBase(SQLModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(unique=True, index=True, max_length=255)


class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserRegister(UserBase):
    """Shape of the JSON body clients send when registering."""
    password: str = Field(min_length=6, max_length=128)


class UserLogin(SQLModel):
    """Shape of the JSON body clients send when logging in."""
    email: str
    password: str


class UserRead(UserBase):
    """Shape of the user data returned to clients — no password fields."""
    id: int


class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
