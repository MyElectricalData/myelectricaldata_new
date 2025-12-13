# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MyElectricalData is a secure API gateway that enables French individuals to access their Linky electricity data through professional Enedis APIs. The system acts as an intermediary, handling OAuth2 consent, caching, and rate limiting.

**Architecture**: Monorepo with FastAPI backend (`apps/api/`) and React/Vite frontend (`apps/web/`)

## Development Commands

### Root Makefile (Recommended)

```bash
# Development
make dev              # Start development with hot-reload watching
make up               # Start all services
make down             # Stop all services
make restart          # Restart all services

# Backend
make backend-logs     # Show backend logs
make backend-restart  # Restart backend only
make watch            # Start backend file watcher
make stop-watch       # Stop backend file watcher

# Database
make db-shell            # Access PostgreSQL shell
make db-backup           # Backup database
make migrate             # Apply all pending migrations
make migrate-downgrade   # Rollback last migration
make migrate-history     # Show migration history
make migrate-current     # Show current migration revision
make migrate-revision    # Generate a new migration (autogenerate)
make migrate-stamp       # Stamp database with current revision

# Maintenance
make logs             # Show all logs
make ps               # Show running containers
make clean            # Clean temporary files
make rebuild          # Rebuild all containers
make help             # Show all available commands
```

**Access Points:**

- Frontend: <http://localhost:8000> (via Vite dev server)
- Backend API: <http://localhost:8081>
- API Docs: <http://localhost:8081/docs>
- pgAdmin: <http://localhost:5050>

### Docker (Manual Alternative)

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Stop services
docker compose down
```

### Backend (apps/api/)

**Package Manager**: `uv` (Astral's fast Python package manager)

**Using Makefile** (from `apps/api/` directory):

```bash
make sync             # Install/sync dependencies (alias: make install)
make run              # Run development server
make test             # Run all tests with coverage
make test-unit        # Run unit tests only
make test-integration # Run integration tests only
make lint             # Run ruff + mypy
make format           # Format code with black + ruff --fix
make clean            # Clean cache files
```

**Manual Commands** (without Makefile):

```bash
# Install dependencies
uv sync

# Run locally (without Docker)
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Run tests
uv run pytest
uv run pytest tests/test_specific.py  # Single file
uv run pytest tests/test_file.py::test_function  # Single test

# Linting
uv run ruff check src tests
uv run mypy src

# Formatting
uv run black src tests
uv run ruff check --fix src tests
```

**Database Migration (Alembic):**

```bash
# Auto-detect: SQLite (default) or PostgreSQL based on DATABASE_URL
# SQLite: sqlite+aiosqlite:///./data/myelectricaldata.db
# PostgreSQL: postgresql+asyncpg://user:pass@postgres:5432/db

# Apply all pending migrations
docker compose exec backend alembic upgrade head

# Rollback last migration
docker compose exec backend alembic downgrade -1

# Show migration history
docker compose exec backend alembic history

# Generate a new migration (after modifying models)
docker compose exec backend alembic revision --autogenerate -m "Description"

# For existing databases, stamp with current revision
docker compose exec backend alembic stamp head

# Local development (from apps/api/)
cd apps/api
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "Description"
```

### Frontend (apps/web/)

```bash
# Install dependencies
npm install

# Development server (standalone, without Docker)
npm run dev  # Runs on http://localhost:3000

# Build for production
npm run build

# Type checking
npm run build  # Includes tsc check

# Linting
npm run lint

# Tests
npm test                 # Run all tests
npm run test:ui          # Interactive UI
npm run test:coverage    # Generate coverage report
```

## Architecture & Key Concepts

### Authentication Flow

1. **User Signup** → Creates account with `client_id`/`client_secret` (OAuth2 Client Credentials)
2. **Login** → JWT token (30-day expiration) stored in localStorage
3. **Enedis Consent** → User authorizes at account level (not per-PDL)
4. **PDL Detection** → All user's PDLs automatically retrieved from Enedis after consent
5. **API Access** → Use `client_id`/`client_secret` for API calls

### Data Flow

```text
User → Frontend (React) → Backend (FastAPI) → Adapter → Enedis API
                              ↓
                          Cache (Redis)
                              ↓
                          Database (SQLite/PostgreSQL)
```

### Backend Structure (`apps/api/src/`)

- **`adapters/`**: Enedis API wrapper with rate limiting (5 req/sec)
- **`routers/`**: FastAPI endpoints (accounts, pdl, enedis, admin, energy_offers)
- **`models/`**: SQLAlchemy models (User, PDL, Token, Role, EnergyProvider, EnergyOffer)
- **`middleware/`**: Auth verification, admin checks
- **`services/`**: Cache (Redis with Fernet encryption), email, rate limiter, **price scrapers**
- **`schemas/`**: Pydantic request/response validation
- **`config/`**: Settings with auto-detection of database type

### Frontend Structure (`apps/web/src/`)

- **`pages/`**: Route components (Dashboard, Consumption, Settings, etc.)
- **`components/`**: Reusable UI components (Layout, PDLCard, etc.)
- **`api/`**: Axios clients for backend endpoints
- **`stores/`**: Zustand state management (auth, theme)
- **`hooks/`**: Custom React hooks
- **`types/`**: TypeScript interfaces

### Cache Strategy

**Granular daily caching**: Each day is cached individually, not entire date ranges

- Cache key pattern: `consumption:daily:{pdl}:{date}`
- Encryption: User's `client_secret` as key (GDPR compliance)
- TTL: 24 hours
- Rate limiting: 50 req/day uncached, 1000 req/day cached per user

### Database Models

Key relationships:

- **User** → has many PDLs (cascade delete)
- **User** → has many Tokens (cascade delete)
- **PDL** → has `usage_point_id` (14-digit Enedis identifier)
- **Token** → stores Enedis OAuth tokens (per PDL or global)
- **EnergyProvider** → has many EnergyOffers (with `scraper_urls` JSON field)
- **EnergyOffer** → belongs to EnergyProvider (with `is_active` flag)

### Energy Provider Scrapers

**Automatic price scraping system** for energy providers:

- **4 providers supported**: EDF, Enercoop, TotalEnergies, Priméo Énergie
- **Dynamic URLs**: Scraper URLs stored in database (`scraper_urls` JSON field), editable via admin interface
- **Provider logos**: Via Clearbit Logo API (`https://logo.clearbit.com/{domain}`)
- **Fallback mechanism**: Manual pricing data if scraping fails
- **Preview mode**: DRY RUN to compare current vs new offers before applying
- **Admin interface**: `/admin/offers` with logo display, URL management, preview/refresh actions

**Scraper types**:
- PDF parsing (EDF, Enercoop, TotalEnergies, Priméo)
- Fallback data for all providers
- ~133 total offers across 4 providers

See `docs/features-spec/energy-providers-scrapers.md` for detailed documentation.

## Design System

**Regles critiques** : `.claude/rules/design.md` (injecte automatiquement pour `apps/web/**`)

**Documentation complete** : `docs/design/`

**Pour toute modification UI** : Utiliser l'agent `frontend-specialist`

**Verification** : `/check_design` ou `docs/design/checklist.md`

## Agent System

Project uses specialized Claude Code agents defined in `.claude/agents/`:

- **`frontend-specialist.md`**: React/TypeScript, must check `@docs/design` before UI work
- **`backend-specialist.md`**: Python/FastAPI, must follow API design rules
- **`enedis-specialist.md`**: Expert API Enedis Data Connect, must check `@docs/enedis-api` before any Enedis integration
- **`devops-specialist.md`**: Kubernetes/Helm for deployment

When agents generate code:

- **Frontend**: Must pass `npm run lint` (ESLint + TypeScript)
- **Backend**: Must follow PEP 8, include type hints

## Testing Strategy

**Coverage Targets** (from `docs/features-spec/rules/testing.md`):

- Backend business logic: ≥80%
- API endpoints: ≥75%
- Frontend components: ≥65%
- E2E critical flows: Mandatory (signup → consent → API keys)

**Backend Tests**:

- Mock Enedis API calls except for contract tests
- Validate request/response schemas match `docs/features-spec/rules/api-design.json`
- Test cache hit/miss, encryption, quota enforcement
- Test cascade delete (account → PDLs, tokens, cache)

**Frontend Tests**:

- User interactions (forms, consent flow, CRUD PDL)
- Loading/error states on all views
- Dark mode persistence and contrast
- Responsive snapshots at key breakpoints

## Environment Configuration

**Backend** (`.env.api`):

```bash
DATABASE_URL=sqlite+aiosqlite:///./data/myelectricaldata.db  # or postgresql+asyncpg://...
REDIS_URL=redis://redis:6379/0
ENEDIS_CLIENT_ID=your-client-id
ENEDIS_CLIENT_SECRET=your-secret
ENEDIS_ENVIRONMENT=sandbox  # or production
SECRET_KEY=your-jwt-secret
ADMIN_EMAILS=admin@example.com  # Comma-separated
```

**Frontend** (`.env`):

```bash
VITE_API_BASE_URL=/api  # In Docker, or http://localhost:8081 for local
```

## Common Workflows

### Adding a New API Endpoint

1. Define Pydantic schemas in `apps/api/src/schemas/`
2. Create/extend router in `apps/api/src/routers/`
3. Add business logic in services if needed
4. Update OpenAPI schema reference if applicable
5. Write integration tests
6. Update frontend TypeScript types in `apps/web/src/types/api.ts`
7. Create API client method in `apps/web/src/api/`

### Adding a New Page

1. Create component in `apps/web/src/pages/`
2. Follow design checklist: `docs/design/checklist.md`
3. Add route in `apps/web/src/App.tsx`
4. Add navigation link in `apps/web/src/components/Layout.tsx` if needed
5. Ensure `pt-6` on root container and H1 icon pattern
6. Implement dark mode variants

### Creating Demo Account

```bash
docker compose exec backend python scripts/create_demo_account.py
# Creates: demo@myelectricaldata.fr / DemoPassword123!
# With 2 PDLs and 365 days of mock consumption/production data
```

See `docs/demo/` for detailed implementation guide.

## Production Deployment

- Uses Caddy reverse proxy (automatic HTTPS)
- Frontend served as static files from Nginx
- Backend runs with Uvicorn
- PostgreSQL recommended over SQLite
- Redis required for caching

Deployment docs: `docs/setup/docker.md`

## Documentation Structure

All docs now in `docs/`:

- `docs/setup/`: Installation, Docker, database, dev-mode
- `docs/features-spec/`: Functional specifications
- `docs/design/`: UI design system with component guidelines
- `docs/demo/`: Demo account implementation
- `docs/architecture/`: System architecture overview
- `docs/enedis-api/`: Enedis API reference

## Security Considerations

- User data isolation: Every endpoint verifies PDL ownership
- Cache encryption: Fernet with user's `client_secret`
- OAuth tokens: Automatic refresh before expiration
- Cascade delete: Account deletion purges all user data
- Rate limiting: Adapter-level (5 req/s) + user quotas

See `apps/api/SECURITY.md` for detailed security model.

## Key Files to Reference

- `docs/features-spec/rules/api-design.json`: API response format standard
- `docs/features-spec/rules/testing.md`: Testing requirements
- `docs/design/checklist.md`: UI compliance checklist
- `.claude/agents/*.md`: Agent-specific instructions
