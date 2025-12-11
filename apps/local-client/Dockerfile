# MyElectricalData Local Client
# Multi-stage build for optimized image

# Frontend build stage
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Copy frontend files
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build:fast

# Python build stage
FROM python:3.11-slim AS python-builder

WORKDIR /app

# Install uv for fast package installation
RUN pip install uv

# Copy dependency files
COPY pyproject.toml README.md ./

# Install dependencies
RUN uv pip install --system --no-cache .

# Runtime stage
FROM python:3.11-slim AS runtime

WORKDIR /app

# Create non-root user
RUN groupadd -r medclient && useradd -r -g medclient medclient

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=python-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-builder /usr/local/bin /usr/local/bin

# Copy application code
COPY src/ /app/src/

# Copy frontend build
COPY --from=frontend-builder /frontend/dist /app/static

# Create directories
RUN mkdir -p /data /config && chown -R medclient:medclient /data /config /app

# Switch to non-root user
USER medclient

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    CONFIG_FILE=/config/config.yaml \
    DATABASE_URL=sqlite+aiosqlite:////data/myelectricaldata.db

# Expose ports
EXPOSE 8080 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Volumes
VOLUME ["/data", "/config"]

# Entry point
ENTRYPOINT ["python", "-m", "src.main"]
CMD ["run", "--host", "0.0.0.0", "--port", "8080"]
