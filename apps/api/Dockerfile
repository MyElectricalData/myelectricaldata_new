FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Set timezone
ENV TZ=Europe/Paris
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install uv for faster dependency installation
RUN pip install uv

# Copy dependency files
COPY pyproject.toml .
COPY uv.lock* ./
COPY README.md .

# Install dependencies using uv into system python
RUN uv pip install --system -r pyproject.toml

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Start the application directly with uvicorn (no uv run)
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
