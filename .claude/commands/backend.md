---
description: Create API with Enedis provider adapter
allowed-tools: Bash(npm:*), Bash(pip:*), Bash(sbt:*), Bash(npx:*), Bash(mkdir:*), Bash(cat:*)
---

# Create Backend

## Lire avant de commencer

- `@docs/features-spec/05-gateway.md`
- `@docs/features-spec/02-account.md`
- `@docs/features-spec/10-cache.md`
- `@docs/features-spec/rules/api-design.json`
- `@docs/enedis-api/endpoint.md`

Ces documents remplacent les informations precedemment integrees ici. Respecte leurs exigences fonctionnelles, de securite et de presentation des erreurs.

## Structure attendue (`apps/api`)

- Serveur FastAPI expose les endpoints miroir des APIs Enedis
- Architecture orientee adapter/facade pour isoler les appels externes
- Respect du schema de reponse definis dans `@docs/features-spec/rules/api-design.json`
- Gestion explicite des erreurs Enedis via `@docs/features-spec/rules/enedis-api-error.md`

## Provider Enedis

- Generer les clients a partir des fichiers OpenAPI disponibles dans `@docs/enedis-api/openapi` (01-authorize.json, 02-token.json, etc.)
- Centraliser les URL, scopes OAuth et versions d'API selon `@docs/enedis-api/endpoint.md`
- Ajouter une couche de journalisation et de retries (limite 5 requetes/seconde)

## Gestion des comptes et de l'authentification

- Suivre la spec `@docs/features-spec/02-account.md`
- Creer les endpoints pour : inscription, authentification, gestion des PDL, consultation des credentials
- Stocker `client_id` fixe et `client_secret` non rotatif (mais consultable de facon securisee)

## Flux OAuth Enedis

- Mettre a disposition l'URL d'autorisation (redirection front) et l'endpoint backend d'echange de code via `@docs/enedis-api/openapi/01-authorize.json` et `02-token.json`
- Persister les tokens et leur metadonnee (expiration, scopes, status consentement)
- Prevoir les mecanismes de refresh et de revocation

## Cache et quotas

- Implementer le cache conforme a `@docs/features-spec/10-cache.md`
- TTL configurable via variable d'environnement (`CACHE_TTL_SECONDS`, default 86400)
- Chiffrer les donnees en cache avec la cle API utilisateur (`client_secret`) ou un derive equivalent
- Throttler les appels sortants a 5 req/sec maximum

## Tests et qualite

- Tests unitaires sur les adapters Enedis et la logique de cache
- Tests d'integration couvrant le flux consentement + appel metering
- Tests de charge leger pour valider le throttling
- Respect des standards `@docs/features-spec/rules/testing.md`

## Notes supplementaires

- Fournir des scripts ou commandes make pour lancer `apps/api`
- Exposer la configuration dans `.env.example`
- Documenter les dependances (Redis, DB) necessaires au cache et a la persistance
