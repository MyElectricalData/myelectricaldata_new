#!/bin/bash

# Start development mode with hot-reload
echo "🚀 Starting development mode with hot-reload..."
echo ""
echo "Frontend will be available at: http://localhost:5173"
echo "Backend API at: http://localhost:8000"
echo ""
echo "Changes to frontend files will automatically trigger rebuild!"
echo "Press Ctrl+C to stop"
echo ""

# Start dev frontend
docker compose -f docker-compose.dev.yml up --build
