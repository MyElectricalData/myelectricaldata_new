"""Model for tracking last refresh times of various caches"""
from sqlalchemy import Column, String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from .base import Base


class RefreshTracker(Base):
    """Track last refresh time for various cache types"""

    __tablename__ = "refresh_tracker"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cache_type = Column(String, unique=True, nullable=False, index=True)  # 'tempo' or 'ecowatt'
    last_refresh = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<RefreshTracker(cache_type={self.cache_type}, last_refresh={self.last_refresh})>"