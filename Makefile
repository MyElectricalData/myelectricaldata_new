# Makefile for MyElectricalData project
# Usage: make [target]

# Variables
COMPOSE = docker compose
WATCH_SCRIPT = ./watch-backend.sh
LOG_DIR = ./tmp
LOG_FILE = $(LOG_DIR)/watch-backend.log
WATCH_PID_FILE = $(LOG_DIR)/watch-backend.pid

# Docker Registry Configuration
REGISTRY = ghcr.io
GITHUB_ORG = myelectricaldata
GITHUB_REPO = myelectricaldata_new
IMAGE_BACKEND = $(REGISTRY)/$(GITHUB_ORG)/$(GITHUB_REPO)/backend
IMAGE_FRONTEND = $(REGISTRY)/$(GITHUB_ORG)/$(GITHUB_REPO)/frontend
IMAGE_DOCS = $(REGISTRY)/$(GITHUB_ORG)/$(GITHUB_REPO)/docs

# Version tagging (use git commit hash for dev, or set VERSION=x.x.x)
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH := $(shell git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
VERSION ?= dev-$(GIT_COMMIT)
PLATFORMS ?= linux/amd64,linux/arm64

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
	@echo "$(YELLOW)Docker Registry (ghcr.io):$(NC)"
	@echo "  make docker-login     - Login to GitHub Container Registry"
	@echo "  make docker-build     - Build all Docker images"
	@echo "  make docker-push      - Push all images to ghcr.io"
	@echo "  make docker-release   - Build and push all images (dev)"
	@echo "  make docker-build-backend  - Build backend image only"
	@echo "  make docker-build-frontend - Build frontend image only"
	@echo "  make docker-push-backend   - Push backend image only"
	@echo "  make docker-push-frontend  - Push frontend image only"
	@echo ""
	@echo "$(YELLOW)Docker Registry Variables:$(NC)"
	@echo "  VERSION=$(VERSION)  (set with: make docker-release VERSION=1.0.0)"
	@echo "  REGISTRY=$(REGISTRY)"
	@echo "  GITHUB_ORG=$(GITHUB_ORG)"
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

# =============================================================================
# Docker Registry Commands (ghcr.io)
# =============================================================================

## Login to GitHub Container Registry
docker-login:
	@echo "$(GREEN)Logging in to GitHub Container Registry...$(NC)"
	@echo "$(YELLOW)Make sure GITHUB_TOKEN is set or use: echo \$$GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin$(NC)"
	@if [ -n "$$GITHUB_TOKEN" ]; then \
		echo "$$GITHUB_TOKEN" | docker login $(REGISTRY) -u $(GITHUB_ORG) --password-stdin; \
		echo "$(GREEN)Logged in to $(REGISTRY)$(NC)"; \
	else \
		echo "$(RED)GITHUB_TOKEN not set. Please set it or login manually:$(NC)"; \
		echo "  export GITHUB_TOKEN=your_token"; \
		echo "  make docker-login"; \
		exit 1; \
	fi

## Build backend Docker image
docker-build-backend:
	@echo "$(GREEN)Building backend image: $(IMAGE_BACKEND):$(VERSION)$(NC)"
	docker build -t $(IMAGE_BACKEND):$(VERSION) \
		-t $(IMAGE_BACKEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		./apps/api
	@echo "$(GREEN)Backend image built: $(IMAGE_BACKEND):$(VERSION)$(NC)"

## Build frontend Docker image
docker-build-frontend:
	@echo "$(GREEN)Building frontend image: $(IMAGE_FRONTEND):$(VERSION)$(NC)"
	docker build -t $(IMAGE_FRONTEND):$(VERSION) \
		-t $(IMAGE_FRONTEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		./apps/web
	@echo "$(GREEN)Frontend image built: $(IMAGE_FRONTEND):$(VERSION)$(NC)"

## Build all Docker images
docker-build: docker-build-backend docker-build-frontend
	@echo "$(GREEN)All images built successfully$(NC)"

## Push backend Docker image to registry
docker-push-backend:
	@echo "$(GREEN)Pushing backend image: $(IMAGE_BACKEND):$(VERSION)$(NC)"
	docker push $(IMAGE_BACKEND):$(VERSION)
	docker push $(IMAGE_BACKEND):latest
	@echo "$(GREEN)Backend image pushed$(NC)"

## Push frontend Docker image to registry
docker-push-frontend:
	@echo "$(GREEN)Pushing frontend image: $(IMAGE_FRONTEND):$(VERSION)$(NC)"
	docker push $(IMAGE_FRONTEND):$(VERSION)
	docker push $(IMAGE_FRONTEND):latest
	@echo "$(GREEN)Frontend image pushed$(NC)"

## Push all Docker images to registry
docker-push: docker-push-backend docker-push-frontend
	@echo "$(GREEN)All images pushed successfully$(NC)"

## Build and push all Docker images (dev release)
docker-release: docker-build docker-push
	@echo "$(GREEN)==================================================$(NC)"
	@echo "$(GREEN)Release complete!$(NC)"
	@echo "$(GREEN)Images published:$(NC)"
	@echo "  - $(IMAGE_BACKEND):$(VERSION)"
	@echo "  - $(IMAGE_BACKEND):latest"
	@echo "  - $(IMAGE_FRONTEND):$(VERSION)"
	@echo "  - $(IMAGE_FRONTEND):latest"
	@echo "$(GREEN)==================================================$(NC)"

## Build multi-platform images and push (for production releases)
docker-release-multiarch: docker-login
	@echo "$(GREEN)Building and pushing multi-platform images...$(NC)"
	@echo "$(YELLOW)Platforms: $(PLATFORMS)$(NC)"
	docker buildx build --platform $(PLATFORMS) \
		-t $(IMAGE_BACKEND):$(VERSION) \
		-t $(IMAGE_BACKEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		--push \
		./apps/api
	docker buildx build --platform $(PLATFORMS) \
		-t $(IMAGE_FRONTEND):$(VERSION) \
		-t $(IMAGE_FRONTEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		--push \
		./apps/web
	@echo "$(GREEN)Multi-platform release complete!$(NC)"

## Show current Docker image tags
docker-info:
	@echo "$(GREEN)Docker Registry Configuration$(NC)"
	@echo "  Registry:     $(REGISTRY)"
	@echo "  Organization: $(GITHUB_ORG)"
	@echo "  Version:      $(VERSION)"
	@echo "  Git Commit:   $(GIT_COMMIT)"
	@echo "  Git Branch:   $(GIT_BRANCH)"
	@echo ""
	@echo "$(GREEN)Image Names:$(NC)"
	@echo "  Backend:  $(IMAGE_BACKEND):$(VERSION)"
	@echo "  Frontend: $(IMAGE_FRONTEND):$(VERSION)"

.PHONY: help dev up up-fg down restart watch stop-watch stop-docs backend-logs backend-restart db-shell db-backup migrate logs ps clean rebuild check-deps install-fswatch docs docs-build docs-dev docs-down docker-login docker-build docker-build-backend docker-build-frontend docker-push docker-push-backend docker-push-frontend docker-release docker-release-multiarch docker-info
