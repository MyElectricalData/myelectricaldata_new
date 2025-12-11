# MyElectricalData Local Client - Makefile

.PHONY: help install dev run test lint format clean build docker-build docker-run

# Default target
help:
	@echo "MyElectricalData Local Client - Available commands:"
	@echo ""
	@echo "  install      - Install dependencies"
	@echo "  dev          - Install development dependencies"
	@echo "  run          - Run the application"
	@echo "  test         - Run tests"
	@echo "  lint         - Run linting"
	@echo "  format       - Format code"
	@echo "  clean        - Clean temporary files"
	@echo "  build        - Build the package"
	@echo "  docker-build - Build Docker image"
	@echo "  docker-run   - Run with Docker Compose"
	@echo ""

# Install dependencies
install:
	uv sync

# Install development dependencies
dev:
	uv sync --all-extras

# Run the application
run:
	uv run python -m src.main run

# Run with config file
run-config:
	uv run python -m src.main run --config config.yaml

# Run tests
test:
	uv run pytest tests/ -v

# Run tests with coverage
test-cov:
	uv run pytest tests/ -v --cov=src --cov-report=html

# Run linting
lint:
	uv run ruff check src tests
	uv run mypy src

# Format code
format:
	uv run black src tests
	uv run ruff check --fix src tests

# Clean temporary files
clean:
	rm -rf __pycache__ .pytest_cache .mypy_cache .ruff_cache
	rm -rf htmlcov .coverage
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete

# Build the package
build:
	uv build

# Docker build
docker-build:
	docker build -t myelectricaldata/local-client:latest .

# Docker run with compose
docker-run:
	docker compose up -d

# Docker stop
docker-stop:
	docker compose down

# Docker logs
docker-logs:
	docker compose logs -f myelectricaldata

# Config validation
config-validate:
	uv run python -m src.main config validate

# Config show
config-show:
	uv run python -m src.main config show
