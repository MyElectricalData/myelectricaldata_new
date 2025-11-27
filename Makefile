# Makefile for MyElectricalData project
# Usage: make [target]

# Variables
COMPOSE = docker compose
WATCH_SCRIPT = ./watch-backend.sh
LOG_DIR = ./tmp
LOG_FILE = $(LOG_DIR)/watch-backend.log
WATCH_PID_FILE = $(LOG_DIR)/watch-backend.pid

# Enable TTY for colors
export COMPOSE_INTERACTIVE_NO_CLI = 1

# Colors for output
GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m # No Color

# Default target
.DEFAULT_GOAL := help

## Help
help:
	@echo "$(GREEN)MyElectricalData - Makefile Commands$(NC)"
	@echo ""
	@echo "$(YELLOW)Development:$(NC)"
	@echo "  make dev          - Start development environment with hot reload watching"
	@echo "  make up           - Start all services without hot reload"
	@echo "  make down         - Stop all services"
	@echo "  make restart      - Restart all services"
	@echo ""
	@echo "$(YELLOW)Backend specific:$(NC)"
	@echo "  make watch        - Start backend file watcher only"
	@echo "  make stop-watch   - Stop backend file watcher"
	@echo "  make backend-logs - Show backend logs"
	@echo "  make backend-restart - Restart backend container"
	@echo ""
	@echo "$(YELLOW)Database:$(NC)"
	@echo "  make db-shell     - Access PostgreSQL shell"
	@echo "  make db-backup    - Backup database"
	@echo "  make migrate      - Apply database migrations"
	@echo ""
	@echo "$(YELLOW)Documentation:$(NC)"
	@echo "  make docs         - Start documentation server via Docker (http://localhost:8002)"
	@echo "  make docs-build   - Build documentation"
	@echo "  make docs-dev     - Start documentation dev server with hot reload (http://localhost:8002)"
	@echo ""
	@echo "$(YELLOW)Maintenance:$(NC)"
	@echo "  make logs         - Show all logs"
	@echo "  make ps           - Show running containers"
	@echo "  make clean        - Clean temporary files and logs"
	@echo "  make rebuild      - Rebuild all containers"
	@echo ""

## Start development environment with hot reload
dev: check-deps
	@./dev.sh

## Start all services (without hot reload)
up:
	@echo "$(GREEN)Starting all services...$(NC)"
	$(COMPOSE) up -d
	@echo "$(GREEN)Services started! Access the app at http://localhost:8000$(NC)"

## Start services in foreground
up-fg:
	@echo "$(GREEN)Starting all services in foreground...$(NC)"
	$(COMPOSE) up

## Stop all services
down:
	@echo "$(YELLOW)Stopping all services...$(NC)"
	@make stop-watch
	@make stop-docs
	$(COMPOSE) down
	@echo "$(GREEN)All services stopped$(NC)"

## Stop documentation server
stop-docs:
	@if [ -f $(LOG_DIR)/docs.pid ]; then \
		echo "$(YELLOW)Stopping docs server (PID: $$(cat $(LOG_DIR)/docs.pid))...$(NC)"; \
		kill `cat $(LOG_DIR)/docs.pid` 2>/dev/null || true; \
		rm -f $(LOG_DIR)/docs.pid; \
		echo "$(GREEN)Docs server stopped$(NC)"; \
	fi

## Restart all services
restart:
	@echo "$(YELLOW)Restarting all services...$(NC)"
	$(COMPOSE) restart
	@echo "$(GREEN)Services restarted$(NC)"

## Start backend file watcher only
watch:
	@echo "$(GREEN)Starting backend file watcher...$(NC)"
	@mkdir -p $(LOG_DIR)
	@if [ -f $(WATCH_PID_FILE) ]; then \
		echo "$(YELLOW)Stopping existing watcher...$(NC)"; \
		kill `cat $(WATCH_PID_FILE)` 2>/dev/null || true; \
		rm -f $(WATCH_PID_FILE); \
	fi
	@if [ -f $(WATCH_SCRIPT) ]; then \
		nohup $(WATCH_SCRIPT) > $(LOG_FILE) 2>&1 & echo $$! > $(WATCH_PID_FILE); \
		echo "$(GREEN)Watcher started with PID: $$(cat $(WATCH_PID_FILE))$(NC)"; \
		echo "$(GREEN)Logs available at: $(LOG_FILE)$(NC)"; \
		echo "$(YELLOW)Run 'make stop-watch' to stop the watcher$(NC)"; \
	else \
		echo "$(RED)Error: $(WATCH_SCRIPT) not found$(NC)"; \
		exit 1; \
	fi

## Stop backend file watcher
stop-watch:
	@if [ -f $(WATCH_PID_FILE) ]; then \
		echo "$(YELLOW)Stopping backend watcher (PID: $$(cat $(WATCH_PID_FILE)))...$(NC)"; \
		kill `cat $(WATCH_PID_FILE)` 2>/dev/null || true; \
		rm -f $(WATCH_PID_FILE); \
		echo "$(GREEN)Watcher stopped$(NC)"; \
	else \
		echo "$(YELLOW)No watcher running$(NC)"; \
	fi

## Show backend logs
backend-logs:
	@if [ "$$(uname)" = "Darwin" ]; then \
		script -q /dev/null $(COMPOSE) logs -f backend; \
	else \
		script -q -c "$(COMPOSE) logs -f backend" /dev/null; \
	fi

## Restart backend container
backend-restart:
	@echo "$(YELLOW)Restarting backend...$(NC)"
	$(COMPOSE) restart backend
	@echo "$(GREEN)Backend restarted$(NC)"

## Access PostgreSQL shell
db-shell:
	@echo "$(GREEN)Connecting to PostgreSQL...$(NC)"
	$(COMPOSE) exec postgres psql -U myelectricaldata -d myelectricaldata

## Backup database
db-backup:
	@echo "$(GREEN)Creating database backup...$(NC)"
	@mkdir -p $(LOG_DIR)/backups
	$(COMPOSE) exec -T postgres pg_dump -U myelectricaldata myelectricaldata > $(LOG_DIR)/backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "$(GREEN)Backup saved to $(LOG_DIR)/backups/$(NC)"

## Apply database migrations
migrate:
	@echo "$(GREEN)Applying database migrations...$(NC)"
	@if [ -f ./apps/api/scripts/create_refresh_tracker_table.sql ]; then \
		docker exec -i myelectricaldata-postgres psql -U myelectricaldata -d myelectricaldata < ./apps/api/scripts/create_refresh_tracker_table.sql; \
		echo "$(GREEN)Migrations applied$(NC)"; \
	else \
		echo "$(YELLOW)No migrations found$(NC)"; \
	fi

## Show all logs
logs:
	@if [ "$$(uname)" = "Darwin" ]; then \
		script -q /dev/null $(COMPOSE) logs -f; \
	else \
		script -q -c "$(COMPOSE) logs -f" /dev/null; \
	fi

## Show running containers
ps:
	$(COMPOSE) ps

## Clean temporary files and logs
clean:
	@echo "$(YELLOW)Cleaning temporary files...$(NC)"
	@rm -rf $(LOG_DIR)
	@echo "$(GREEN)Cleaned$(NC)"

## Rebuild all containers
rebuild:
	@echo "$(YELLOW)Rebuilding all containers...$(NC)"
	$(COMPOSE) down
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d
	@echo "$(GREEN)Rebuild complete$(NC)"

## Check dependencies
check-deps:
	@command -v docker >/dev/null 2>&1 || { echo "$(RED)Docker is required but not installed$(NC)"; exit 1; }
	@command -v docker compose >/dev/null 2>&1 || { echo "$(RED)Docker Compose is required but not installed$(NC)"; exit 1; }
	@echo "$(GREEN)Dependencies OK$(NC)"

## Install fswatch for better file watching on macOS
install-fswatch:
	@echo "$(GREEN)Installing fswatch for better file watching...$(NC)"
	@if command -v brew >/dev/null 2>&1; then \
		brew install fswatch; \
		echo "$(GREEN)fswatch installed$(NC)"; \
	else \
		echo "$(RED)Homebrew not found. Please install fswatch manually$(NC)"; \
		exit 1; \
	fi

## Documentation: Start docs server via Docker
docs:
	@echo "$(GREEN)Starting documentation server...$(NC)"
	$(COMPOSE) --profile docs up -d docs
	@echo "$(GREEN)Documentation available at http://localhost:8002$(NC)"

## Documentation: Build docs locally
docs-build:
	@echo "$(GREEN)Building documentation...$(NC)"
	@cd apps/docs && npm run build
	@echo "$(GREEN)Documentation built in apps/docs/build/$(NC)"

## Documentation: Start dev server with hot reload
docs-dev:
	@echo "$(GREEN)Starting documentation dev server...$(NC)"
	@cd apps/docs && npm start -- --port 8002
	@echo "$(GREEN)Documentation dev server running at http://localhost:8002$(NC)"

## Documentation: Stop docs server
docs-down:
	@echo "$(YELLOW)Stopping documentation server...$(NC)"
	$(COMPOSE) --profile docs down docs
	@echo "$(GREEN)Documentation server stopped$(NC)"

.PHONY: help dev up up-fg down restart watch stop-watch stop-docs backend-logs backend-restart db-shell db-backup migrate logs ps clean rebuild check-deps install-fswatch docs docs-build docs-dev docs-down
