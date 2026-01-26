---
globs: apps/web/**/*
---

# Design System

**IMPORTANT : Pour toute modification UI, utiliser l'agent `frontend-specialist`.**

## ⚠️ VALIDATION OBLIGATOIRE

**Avant toute modification de design ou creation de composant UI :**

1. **Lire OBLIGATOIREMENT** : `docs/specs/design/` (documentation complete du design system)
2. **Verifier la conformite** avec `docs/specs/design/checklist.md`
3. **Consulter les exemples** : `docs/specs/design/examples.md`
4. **Page de reference** : `apps/web/src/pages/Consumption/index.tsx`

**NE JAMAIS improviser le design. Toujours se baser sur `docs/specs/design/`.**

## 🎯 Header Centralise

**Le header H1 est gere de maniere centralisee** via `PageHeader.tsx`.

**NE PAS ajouter de header H1 dans les composants de page** sauf si la page n'est pas configuree dans `PAGE_CONFIG` de `PageHeader.tsx`.

**Structure correcte** : Composant de page doit commencer par `<div className="w-full">` sans header duplique.

## Documentation

Toute la documentation de design se trouve dans `docs/specs/design/` :

- **Regles generales** : `docs/specs/design/README.md`
- **Checklist** : `docs/specs/design/checklist.md`
- **Composants** : `docs/specs/design/components/`
- **Exemples** : `docs/specs/design/examples.md`
