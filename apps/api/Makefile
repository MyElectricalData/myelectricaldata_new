.PHONY: install run test lint format clean sync migrate migrate-upgrade migrate-downgrade migrate-revision migrate-history migrate-current

install:
	uv sync

sync:
	uv sync

run:
	uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

test:
	uv run pytest tests/ -v --cov=src --cov-report=html

test-unit:
	uv run pytest tests/unit/ -v

test-integration:
	uv run pytest tests/integration/ -v

lint:
	uv run ruff check src tests
	uv run mypy src

format:
	uv run black src tests
	uv run ruff check --fix src tests

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	rm -rf .pytest_cache .coverage htmlcov .mypy_cache .venv

# Alembic migrations
migrate: migrate-upgrade

migrate-upgrade:
	uv run alembic upgrade head

migrate-downgrade:
	uv run alembic downgrade -1

migrate-revision:
	@read -p "Enter migration message: " msg; \
	uv run alembic revision --autogenerate -m "$$msg"

migrate-history:
	uv run alembic history

migrate-current:
	uv run alembic current

migrate-stamp-head:
	uv run alembic stamp head
