#!/bin/bash

# Quick script to rebuild frontend
echo "📦 Rebuilding frontend..."
docker compose build --no-cache frontend && docker compose up -d frontend

if [ $? -eq 0 ]; then
    echo "✅ Frontend rebuilt successfully!"
else
    echo "❌ Frontend rebuild failed!"
    exit 1
fi
