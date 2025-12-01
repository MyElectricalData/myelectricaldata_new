#!/bin/bash
set -e

echo "Starting MyElectricalData API..."

# Run database migrations
echo "Applying database migrations..."
alembic upgrade head
echo "Migrations applied successfully"

# Start the application
echo "Starting uvicorn server..."
exec uvicorn src.main:app --host 0.0.0.0 --port 8000
