# =============================================================================
# Stage 1: Dependencies (cached separately from code)
# =============================================================================
FROM python:3.12-slim AS deps

WORKDIR /app

# Install system dependencies (rarely changes - cached)
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy ONLY dependency files first (better cache)
COPY pyproject.toml README.md ./

# Install dependencies (cached if pyproject.toml unchanged)
# uv crashes under QEMU emulation, so we use pip for multi-arch builds
RUN pip install --no-cache-dir .

# =============================================================================
# Stage 2: Production image
# =============================================================================
FROM python:3.12-slim

WORKDIR /app

# Install runtime dependencies only (no gcc needed)
RUN apt-get update && apt-get install -y \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Set timezone
ENV TZ=Europe/Paris
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Copy installed packages from deps stage
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy application code (changes frequently - last layer)
COPY . .

# Expose port
EXPOSE 8000

# Start the application directly with uvicorn
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
