from __future__ import annotations
import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .role import Role
    from .pdl import PDL
    from .token import Token


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    client_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    client_secret: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # Kept for backward compatibility
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    debug_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    admin_data_sharing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    admin_data_sharing_enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    enedis_customer_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    role_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("roles.id"), nullable=True)

    # Relations
    role: Mapped["Role"] = relationship("Role", back_populates="users")
    pdls: Mapped[list["PDL"]] = relationship("PDL", back_populates="user", cascade="all, delete-orphan")
    tokens: Mapped[list["Token"]] = relationship("Token", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email})>"
