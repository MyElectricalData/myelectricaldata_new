# Makefile for MyElectricalData project
# Usage: make [target]

# Container Runtime Detection
# Supports: docker, nerdctl (containerd/Rancher Desktop)
# Priority: first runtime with a working daemon wins
# Override: make CONTAINER_RT=nerdctl <target>
CONTAINER_RT ?= $(shell docker info >/dev/null 2>&1 && echo "docker" || { nerdctl info >/dev/null 2>&1 && echo "nerdctl" || echo "docker"; })

# Runtime capability flags
RUNTIME_IS_NERDCTL := $(if $(filter nerdctl,$(CONTAINER_RT)),true,)
HAS_BUILDX := $(if $(RUNTIME_IS_NERDCTL),,$(shell $(CONTAINER_RT) buildx version >/dev/null 2>&1 && echo yes))

# Variables
# Development uses dev/ folder, production uses root
COMPOSE = $(CONTAINER_RT) compose -f dev/docker-compose.yml
COMPOSE_SERVER = $(CONTAINER_RT) compose -f dev/docker-compose.server.yml
# Production compose files (at root)
COMPOSE_PROD = $(CONTAINER_RT) compose
COMPOSE_PROD_SERVER = $(CONTAINER_RT) compose -f docker-compose.server.yml
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
	@echo "$(YELLOW)Runtime: $(CONTAINER_RT) | buildx: $(if $(HAS_BUILDX),oui,non)$(NC)"
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
	@echo "  make db-shell         - Access PostgreSQL shell"
	@echo "  make db-backup        - Backup database"
	@echo "  make migrate          - Apply all pending migrations"
	@echo "  make migrate-downgrade - Rollback last migration"
	@echo "  make migrate-history  - Show migration history"
	@echo "  make migrate-current  - Show current migration revision"
	@echo "  make migrate-revision - Generate a new migration"
	@echo "  make migrate-stamp    - Stamp database with current revision"
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
	@echo "  make docker-login          - Login to GitHub Container Registry"
	@echo "  make docker-build          - Build all Docker images (local arch)"
	@echo "  make docker-push           - Push all images to ghcr.io"
	@echo "  make docker-release        - Build and push all images (local arch)"
	@echo "  make docker-release-native - Build native arch only (fast, for local testing)"
	@echo "  make docker-release-amd64  - Build and push amd64 images (x86_64 servers)"
	@echo "  make docker-release-arm64  - Build and push arm64 images (ARM servers)"
	@echo "  make docker-release-multiarch - Build multi-arch via buildx (may fail with QEMU)"
	@echo "  make docker-release-ci     - Trigger GitHub Actions for multi-arch (recommended)"
	@echo "  make docker-buildx-setup   - Setup buildx for multi-platform builds"
	@echo "  make docker-info           - Show current image tags and config"
	@echo ""
	@echo "$(YELLOW)Docker Registry Variables:$(NC)"
	@echo "  VERSION=$(VERSION)  (set with: make docker-release-amd64 VERSION=1.0.0)"
	@echo "  REGISTRY=$(REGISTRY)"
	@echo "  GITHUB_ORG=$(GITHUB_ORG)"
	@echo ""
	@echo "$(YELLOW)Server Mode (gateway multi-users):$(NC)"
	@echo "  make server-up        - Start server mode services"
	@echo "  make server-down      - Stop server mode services"
	@echo "  make server-logs      - Show server mode logs"
	@echo "  make server-restart   - Restart server mode services"
	@echo "  make server-rebuild   - Rebuild server mode containers"
	@echo "  make server-migrate   - Apply migrations for server database"
	@echo "  make server-db-shell  - Access server PostgreSQL shell"
	@echo ""
	@echo "$(YELLOW)Kubernetes (rancher-desktop):$(NC)"
	@echo "  make k8s-deploy       - Deploy to K8s in dev mode (volume mounts)"
	@echo "  make k8s-deploy-prod  - Deploy to K8s in production mode"
	@echo "  make k8s-delete       - Delete deployment from K8s"
	@echo "  make k8s-status       - Show deployment status"
	@echo "  make k8s-logs-backend - Show backend logs"
	@echo "  make k8s-logs-frontend - Show frontend logs"
	@echo ""

## Start development environment with hot reload
dev: check-deps
	@./dev.sh

## Start all services (without hot reload) - Client mode by default
up:
	@echo "$(GREEN)Starting client mode services...$(NC)"
	@if [ ! -f .env.local-client ]; then \
		echo "$(RED)Error: .env.local-client not found$(NC)"; \
		echo "$(YELLOW)Copy .env.client.example to .env.local-client and configure your credentials$(NC)"; \
		exit 1; \
	fi
	$(COMPOSE) up -d
	@echo "$(GREEN)Services started!$(NC)"
	@echo "  Frontend: http://localhost:8100"
	@echo "  Backend:  http://localhost:8181"
	@echo "  API Docs: http://localhost:8181/docs"

## Start services in foreground - Client mode by default
up-fg:
	@echo "$(GREEN)Starting client mode services in foreground...$(NC)"
	@if [ ! -f .env.local-client ]; then \
		echo "$(RED)Error: .env.local-client not found$(NC)"; \
		echo "$(YELLOW)Copy .env.client.example to .env.local-client and configure your credentials$(NC)"; \
		exit 1; \
	fi
	$(COMPOSE) up

## Stop all services
down:
	@echo "$(YELLOW)Stopping all services...$(NC)"
	@make stop-watch
	@make stop-docs
	$(COMPOSE) down
	@if [ -f .env.api ]; then \
		echo "$(YELLOW)Stopping server mode services...$(NC)"; \
		$(COMPOSE_SERVER) down 2>/dev/null || true; \
	fi
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

## Show backend logs (client mode)
backend-logs:
	@if [ "$$(uname)" = "Darwin" ]; then \
		script -q /dev/null $(COMPOSE) logs -f backend-client; \
	else \
		script -q -c "$(COMPOSE) logs -f backend-client" /dev/null; \
	fi

## Restart backend container (client mode)
backend-restart:
	@echo "$(YELLOW)Restarting backend (client)...$(NC)"
	$(COMPOSE) restart backend-client
	@echo "$(GREEN)Backend restarted$(NC)"

## Access PostgreSQL shell (client mode)
db-shell:
	@echo "$(GREEN)Connecting to PostgreSQL (client)...$(NC)"
	$(COMPOSE) exec postgres-client psql -U myelectricaldata -d myelectricaldata_client

## Backup database (client mode)
db-backup:
	@echo "$(GREEN)Creating database backup (client)...$(NC)"
	@mkdir -p $(LOG_DIR)/backups
	$(COMPOSE) exec -T postgres-client pg_dump -U myelectricaldata myelectricaldata_client > $(LOG_DIR)/backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "$(GREEN)Backup saved to $(LOG_DIR)/backups/$(NC)"

## Apply database migrations (Alembic) - client mode
migrate:
	@echo "$(GREEN)Applying database migrations (client)...$(NC)"
	$(COMPOSE) exec backend-client alembic upgrade head
	@echo "$(GREEN)Migrations applied$(NC)"

## Rollback last migration - client mode
migrate-downgrade:
	@echo "$(YELLOW)Rolling back last migration (client)...$(NC)"
	$(COMPOSE) exec backend-client alembic downgrade -1
	@echo "$(GREEN)Rollback complete$(NC)"

## Show migration history - client mode
migrate-history:
	@echo "$(GREEN)Migration history (client):$(NC)"
	$(COMPOSE) exec backend-client alembic history

## Show current migration revision - client mode
migrate-current:
	@echo "$(GREEN)Current migration revision (client):$(NC)"
	$(COMPOSE) exec backend-client alembic current

## Generate a new migration (autogenerate) - client mode
migrate-revision:
	@echo "$(GREEN)Creating new migration (client)...$(NC)"
	@read -p "Enter migration message: " msg; \
	$(COMPOSE) exec backend-client alembic revision --autogenerate -m "$$msg"
	@echo "$(GREEN)Migration created$(NC)"

## Stamp the database with current revision (for existing databases) - client mode
migrate-stamp:
	@echo "$(YELLOW)Stamping database with head revision (client)...$(NC)"
	$(COMPOSE) exec backend-client alembic stamp head
	@echo "$(GREEN)Database stamped$(NC)"

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
	@if ! command -v docker >/dev/null 2>&1 && ! command -v nerdctl >/dev/null 2>&1; then \
		echo "$(RED)Docker ou nerdctl est requis$(NC)"; exit 1; \
	fi
	@$(CONTAINER_RT) compose version >/dev/null 2>&1 || { echo "$(RED)$(CONTAINER_RT) compose est requis$(NC)"; exit 1; }
	@echo "$(GREEN)Runtime: $(CONTAINER_RT) | buildx: $(if $(HAS_BUILDX),oui,non)$(NC)"

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
	@echo "$(YELLOW)Make sure GITHUB_TOKEN is set or use: echo \$$GITHUB_TOKEN | $(CONTAINER_RT) login ghcr.io -u USERNAME --password-stdin$(NC)"
	@if [ -n "$$GITHUB_TOKEN" ]; then \
		echo "$$GITHUB_TOKEN" | $(CONTAINER_RT) login $(REGISTRY) -u $(GITHUB_ORG) --password-stdin; \
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
	$(CONTAINER_RT) build -t $(IMAGE_BACKEND):$(VERSION) \
		-t $(IMAGE_BACKEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		./apps/api
	@echo "$(GREEN)Backend image built: $(IMAGE_BACKEND):$(VERSION)$(NC)"

## Build frontend Docker image
docker-build-frontend:
	@echo "$(GREEN)Building frontend image: $(IMAGE_FRONTEND):$(VERSION)$(NC)"
	$(CONTAINER_RT) build -t $(IMAGE_FRONTEND):$(VERSION) \
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
	$(CONTAINER_RT) push $(IMAGE_BACKEND):$(VERSION)
	$(CONTAINER_RT) push $(IMAGE_BACKEND):latest
	@echo "$(GREEN)Backend image pushed$(NC)"

## Push frontend Docker image to registry
docker-push-frontend:
	@echo "$(GREEN)Pushing frontend image: $(IMAGE_FRONTEND):$(VERSION)$(NC)"
	$(CONTAINER_RT) push $(IMAGE_FRONTEND):$(VERSION)
	$(CONTAINER_RT) push $(IMAGE_FRONTEND):latest
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
## Nécessite Docker avec buildx. Non supporté par nerdctl → utiliser docker-release-ci
docker-release-multiarch: docker-login
ifdef HAS_BUILDX
	@echo "$(GREEN)Building and pushing multi-platform images...$(NC)"
	@echo "$(YELLOW)Platforms: $(PLATFORMS)$(NC)"
	$(CONTAINER_RT) buildx build --platform $(PLATFORMS) \
		-t $(IMAGE_BACKEND):$(VERSION) \
		-t $(IMAGE_BACKEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		--push \
		./apps/api
	$(CONTAINER_RT) buildx build --platform $(PLATFORMS) \
		-t $(IMAGE_FRONTEND):$(VERSION) \
		-t $(IMAGE_FRONTEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		--push \
		./apps/web
	@echo "$(GREEN)Multi-platform release complete!$(NC)"
else
	@echo "$(RED)buildx non disponible (runtime: $(CONTAINER_RT))$(NC)"
	@echo "$(YELLOW)Alternatives :$(NC)"
	@echo "  make docker-release-native   - Build architecture native uniquement"
	@echo "  make docker-release-ci       - Build multi-arch via GitHub Actions"
	@exit 1
endif

## Build and push amd64 images only (for x86_64 servers)
docker-release-amd64: docker-login
	@echo "$(GREEN)Building and pushing amd64 images...$(NC)"
ifdef HAS_BUILDX
	$(CONTAINER_RT) buildx build --platform linux/amd64 \
		-t $(IMAGE_BACKEND):$(VERSION) \
		-t $(IMAGE_BACKEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		--push \
		./apps/api
	$(CONTAINER_RT) buildx build --platform linux/amd64 \
		-t $(IMAGE_FRONTEND):$(VERSION) \
		-t $(IMAGE_FRONTEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		--push \
		./apps/web
else
	$(CONTAINER_RT) build --platform linux/amd64 \
		-t $(IMAGE_BACKEND):$(VERSION) \
		-t $(IMAGE_BACKEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		./apps/api
	$(CONTAINER_RT) push $(IMAGE_BACKEND):$(VERSION)
	$(CONTAINER_RT) push $(IMAGE_BACKEND):latest
	$(CONTAINER_RT) build --platform linux/amd64 \
		-t $(IMAGE_FRONTEND):$(VERSION) \
		-t $(IMAGE_FRONTEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		./apps/web
	$(CONTAINER_RT) push $(IMAGE_FRONTEND):$(VERSION)
	$(CONTAINER_RT) push $(IMAGE_FRONTEND):latest
endif
	@echo "$(GREEN)amd64 release complete!$(NC)"
	@echo "$(GREEN)Images:$(NC)"
	@echo "  - $(IMAGE_BACKEND):$(VERSION)"
	@echo "  - $(IMAGE_FRONTEND):$(VERSION)"

## Build and push arm64 images only (for ARM servers like Raspberry Pi, Apple Silicon)
docker-release-arm64: docker-login
	@echo "$(GREEN)Building and pushing arm64 images...$(NC)"
ifdef HAS_BUILDX
	$(CONTAINER_RT) buildx build --platform linux/arm64 \
		-t $(IMAGE_BACKEND):$(VERSION) \
		-t $(IMAGE_BACKEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		--push \
		./apps/api
	$(CONTAINER_RT) buildx build --platform linux/arm64 \
		-t $(IMAGE_FRONTEND):$(VERSION) \
		-t $(IMAGE_FRONTEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		--push \
		./apps/web
else
	$(CONTAINER_RT) build --platform linux/arm64 \
		-t $(IMAGE_BACKEND):$(VERSION) \
		-t $(IMAGE_BACKEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		./apps/api
	$(CONTAINER_RT) push $(IMAGE_BACKEND):$(VERSION)
	$(CONTAINER_RT) push $(IMAGE_BACKEND):latest
	$(CONTAINER_RT) build --platform linux/arm64 \
		-t $(IMAGE_FRONTEND):$(VERSION) \
		-t $(IMAGE_FRONTEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		./apps/web
	$(CONTAINER_RT) push $(IMAGE_FRONTEND):$(VERSION)
	$(CONTAINER_RT) push $(IMAGE_FRONTEND):latest
endif
	@echo "$(GREEN)arm64 release complete!$(NC)"

## Setup buildx for multi-platform builds (Docker uniquement)
docker-buildx-setup:
ifdef HAS_BUILDX
	@echo "$(GREEN)Setting up Docker buildx...$(NC)"
	$(CONTAINER_RT) buildx create --name myelectricaldata-builder --use --bootstrap 2>/dev/null || $(CONTAINER_RT) buildx use myelectricaldata-builder
	$(CONTAINER_RT) buildx inspect --bootstrap
	@echo "$(GREEN)Buildx ready for multi-platform builds$(NC)"
else
	@echo "$(RED)buildx non disponible (runtime: $(CONTAINER_RT))$(NC)"
	@echo "$(YELLOW)buildx nécessite Docker Engine. nerdctl/Rancher Desktop ne le supporte pas.$(NC)"
	@exit 1
endif

## Trigger GitHub Actions to build multi-arch images (recommended for cross-platform)
docker-release-ci:
	@echo "$(GREEN)Triggering GitHub Actions for multi-arch build...$(NC)"
	@if [ -z "$(CI_VERSION)" ]; then \
		echo "$(YELLOW)No version specified, using 'latest'$(NC)"; \
		gh workflow run docker-release.yml; \
	else \
		echo "$(YELLOW)Version: $(CI_VERSION)$(NC)"; \
		gh workflow run docker-release.yml -f version=$(CI_VERSION); \
	fi
	@echo "$(GREEN)Workflow triggered! Check progress at:$(NC)"
	@echo "  https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)/actions"

## Build native architecture only (fast, for local testing)
docker-release-native: docker-login
	@echo "$(GREEN)Building and pushing native architecture images...$(NC)"
	$(CONTAINER_RT) build -t $(IMAGE_BACKEND):$(VERSION) \
		-t $(IMAGE_BACKEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		./apps/api
	$(CONTAINER_RT) push $(IMAGE_BACKEND):$(VERSION)
	$(CONTAINER_RT) push $(IMAGE_BACKEND):latest
	$(CONTAINER_RT) build -t $(IMAGE_FRONTEND):$(VERSION) \
		-t $(IMAGE_FRONTEND):latest \
		--label "org.opencontainers.image.source=https://github.com/$(GITHUB_ORG)/$(GITHUB_REPO)" \
		./apps/web
	$(CONTAINER_RT) push $(IMAGE_FRONTEND):$(VERSION)
	$(CONTAINER_RT) push $(IMAGE_FRONTEND):latest
	@echo "$(GREEN)Native release complete!$(NC)"

## Show current Docker image tags
docker-info:
	@echo "$(GREEN)Docker Registry Configuration$(NC)"
	@echo "  Runtime:      $(CONTAINER_RT)"
	@echo "  buildx:       $(if $(HAS_BUILDX),oui,non)"
	@echo "  Registry:     $(REGISTRY)"
	@echo "  Organization: $(GITHUB_ORG)"
	@echo "  Version:      $(VERSION)"
	@echo "  Git Commit:   $(GIT_COMMIT)"
	@echo "  Git Branch:   $(GIT_BRANCH)"
	@echo ""
	@echo "$(GREEN)Image Names:$(NC)"
	@echo "  Backend:  $(IMAGE_BACKEND):$(VERSION)"
	@echo "  Frontend: $(IMAGE_FRONTEND):$(VERSION)"

# =============================================================================
# Kubernetes Commands (rancher-desktop)
# =============================================================================

K8S_DEPLOY_SCRIPT = ./scripts/k8s-deploy.sh

## Deploy to Kubernetes (dev mode with volume mounts)
k8s-deploy:
	@echo "$(GREEN)Deploying to Kubernetes (dev mode)...$(NC)"
	@$(K8S_DEPLOY_SCRIPT) deploy

## Deploy to Kubernetes (production mode with built images)
k8s-deploy-prod:
	@echo "$(GREEN)Deploying to Kubernetes (production mode)...$(NC)"
	@$(K8S_DEPLOY_SCRIPT) --prod deploy

## Delete Kubernetes deployment
k8s-delete:
	@echo "$(YELLOW)Deleting Kubernetes deployment...$(NC)"
	@$(K8S_DEPLOY_SCRIPT) delete

## Show Kubernetes deployment status
k8s-status:
	@$(K8S_DEPLOY_SCRIPT) status

## Show backend logs in Kubernetes
k8s-logs-backend:
	@$(K8S_DEPLOY_SCRIPT) logs backend

## Show frontend logs in Kubernetes
k8s-logs-frontend:
	@$(K8S_DEPLOY_SCRIPT) logs frontend

# =============================================================================
# Server Mode Commands (gateway multi-users)
# =============================================================================

## Start server mode services
server-up:
	@echo "$(GREEN)Starting server mode services...$(NC)"
	$(COMPOSE_SERVER) up -d
	@echo "$(GREEN)Server mode started!$(NC)"
	@echo "  Frontend: http://localhost:8000"
	@echo "  Backend:  http://localhost:8081"
	@echo "  API Docs: http://localhost:8081/docs"

## Stop server mode services
server-down:
	@echo "$(YELLOW)Stopping server mode services...$(NC)"
	$(COMPOSE_SERVER) down
	@echo "$(GREEN)Server mode stopped$(NC)"

## Show server mode logs
server-logs:
	@if [ "$$(uname)" = "Darwin" ]; then \
		script -q /dev/null $(COMPOSE_SERVER) logs -f; \
	else \
		script -q -c "$(COMPOSE_SERVER) logs -f" /dev/null; \
	fi

## Restart server mode services
server-restart:
	@echo "$(YELLOW)Restarting server mode services...$(NC)"
	$(COMPOSE_SERVER) restart
	@echo "$(GREEN)Server mode restarted$(NC)"

## Rebuild server mode containers
server-rebuild:
	@echo "$(YELLOW)Rebuilding server mode containers...$(NC)"
	$(COMPOSE_SERVER) down
	$(COMPOSE_SERVER) build --no-cache
	$(COMPOSE_SERVER) up -d
	@echo "$(GREEN)Server mode rebuild complete$(NC)"

## Apply migrations for server database
server-migrate:
	@echo "$(GREEN)Applying migrations to server database...$(NC)"
	$(COMPOSE_SERVER) exec backend alembic upgrade head
	@echo "$(GREEN)Server migrations applied$(NC)"

## Access server PostgreSQL shell
server-db-shell:
	@echo "$(GREEN)Connecting to server PostgreSQL...$(NC)"
	$(COMPOSE_SERVER) exec postgres psql -U myelectricaldata -d myelectricaldata

## Show server mode container status
server-ps:
	$(COMPOSE_SERVER) ps

## Show server backend logs only
server-backend-logs:
	@if [ "$$(uname)" = "Darwin" ]; then \
		script -q /dev/null $(COMPOSE_SERVER) logs -f backend; \
	else \
		script -q -c "$(COMPOSE_SERVER) logs -f backend" /dev/null; \
	fi

.PHONY: help dev up up-fg down restart watch stop-watch stop-docs backend-logs backend-restart db-shell db-backup migrate migrate-downgrade migrate-history migrate-current migrate-revision migrate-stamp logs ps clean rebuild check-deps install-fswatch docs docs-build docs-dev docs-down docker-login docker-build docker-build-backend docker-build-frontend docker-push docker-push-backend docker-push-frontend docker-release docker-release-native docker-release-multiarch docker-release-amd64 docker-release-arm64 docker-release-ci docker-buildx-setup docker-info k8s-deploy k8s-deploy-prod k8s-delete k8s-status k8s-logs-backend k8s-logs-frontend server-up server-down server-logs server-restart server-rebuild server-migrate server-db-shell server-ps server-backend-logs
