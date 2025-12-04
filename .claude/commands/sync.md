---
description: Synchronise le worktree avec le projet root
allowed-tools: Bash(rsync:*), Bash(ls:*), Bash(pwd:*)
---

# Objectif

Copier les fichiers modifiés du worktree Conductor vers le projet root (`/Users/cvalentin/Git/myelectricaldata_new`) pour tester en live.

## Workflow de synchronisation

### 1. Copier les fichiers vers le projet root

Utiliser rsync pour copier les fichiers modifiés (en excluant les dossiers git, node_modules, etc.) :

```bash
rsync -av --progress \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.conductor' \
  --exclude='dist' \
  --exclude='build' \
  --exclude='.venv' \
  --exclude='__pycache__' \
  --exclude='.pytest_cache' \
  --exclude='.mypy_cache' \
  --exclude='*.pyc' \
  /Users/cvalentin/Git/myelectricaldata_new/.conductor/santo/ \
  /Users/cvalentin/Git/myelectricaldata_new/
```

### 2. Confirmer la synchronisation

Afficher les fichiers copiés et informer l'utilisateur que la synchronisation est terminée.

## Notes importantes

- Cette commande copie les fichiers du worktree vers le projet root
- Les dossiers `node_modules`, `.git`, `dist`, etc. sont exclus
- Le projet root doit avoir ses services en cours d'exécution pour voir les changements (hot-reload)
- Pour annuler, utiliser git dans le projet root : `git checkout -- .`
