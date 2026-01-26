---
globs:
  - apps/api/src/adapters/enedis.py
  - apps/api/src/routers/enedis.py
  - "**/enedis*.py"
---

# Integration API Enedis

**IMPORTANT : Pour toute modification liee a l'API Enedis, utiliser l'agent `enedis-specialist` qui a acces a la documentation complete.**

## Rappels critiques

- Donnees disponibles jusqu'a **J-1** uniquement
- Courbes de charge : **7 jours max** par appel
- `start` doit etre **strictement inferieur** a `end`
- **5 req/s** rate limiting, **10 000 req/h** quota

## Documentation

`docs/external-apis/enedis-api/` contient la documentation complete (endpoints, erreurs, OpenAPI).
