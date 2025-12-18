---
globs:
  - apps/api/src/adapters/enedis.py
  - apps/api/src/routers/enedis.py
  - "**/enedis*.py"
---

# Integration API Enedis

**IMPORTANT : Pour toute modification liee a l'API Enedis, utiliser l'agent `enedis-specialist` qui a acces a la documentation complete.**

## Documentation

La documentation Enedis est disponible dans `docs/enedis-api/` :

- `endpoint.md` : Catalogue des endpoints et contraintes
- `enedis-api-error.md` : Codes d'erreur
- `data-catalogues.md` : Description des donnees
- `openapi/` : Specifications OpenAPI

## Rappels critiques

### Contraintes de dates

- Donnees disponibles jusqu'a **J-1** uniquement
- Courbes de charge : **7 jours max** par appel
- `start` doit etre **strictement inferieur** a `end`

### Quotas

- **5 req/s** : Rate limiting
- **10 000 req/h** : Quota horaire

### Conversion W → Wh

```text
Energie (Wh) = Puissance (W) / (60 / interval_minutes)
```

## Fichiers cles

| Fichier                           | Role                           |
| --------------------------------- | ------------------------------ |
| `apps/api/src/adapters/enedis.py` | Wrapper API avec rate limiting |
| `apps/api/src/routers/enedis.py`  | Endpoints FastAPI              |
| `apps/api/src/services/cache.py`  | Cache chiffre Valkey           |
