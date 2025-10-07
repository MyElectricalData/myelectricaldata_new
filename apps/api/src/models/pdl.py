import uuid
from sqlalchemy import String, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin


class PDL(Base, TimestampMixin):
    __tablename__ = "pdls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    usage_point_id: Mapped[str] = mapped_column(String(14), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Custom name for PDL
    display_order: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Custom sort order

    # Contract information
    subscribed_power: Mapped[int | None] = mapped_column(Integer, nullable=True)  # kVA
    offpeak_hours: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # HC schedules by day

    # Relations
    user: Mapped["User"] = relationship("User", back_populates="pdls")

    def __repr__(self) -> str:
        return f"<PDL(id={self.id}, usage_point_id={self.usage_point_id})>"
