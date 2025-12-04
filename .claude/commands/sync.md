---
description: Synchronise le worktree avec le projet root
allowed-tools: Bash(git:*), Bash(rsync:*), Bash(ls:*), Bash(pwd:*)
---

# Objectif

Synchroniser le worktree Conductor en cours avec le projet root (`/Users/cvalentin/Git/myelectricaldata_new`) pour récupérer les dernières modifications.

## Workflow de synchronisation

### 1. Vérifier l'état du worktree actuel

```bash
git status
```

S'il y a des modifications locales non commitées, avertir l'utilisateur et demander s'il veut continuer (les modifications locales pourraient être écrasées).

### 2. Récupérer les derniers changements depuis main

```bash
# Fetch depuis origin
git fetch origin main

# Rebase sur origin/main pour récupérer les dernières modifications
git rebase origin/main
```

### 3. En cas de conflit

Si le rebase échoue à cause de conflits :
1. Lister les fichiers en conflit avec `git status`
2. Informer l'utilisateur des conflits
3. Proposer soit de résoudre les conflits, soit d'abandonner avec `git rebase --abort`

### 4. Vérification finale

Après la synchronisation :
```bash
# Afficher les derniers commits pour confirmer la sync
git log --oneline -5

# Afficher l'état actuel
git status
```

## Notes importantes

- Cette commande utilise `git rebase` pour garder un historique linéaire
- Les modifications locales non commitées peuvent être écrasées
- En cas d'erreur, utiliser `git rebase --abort` pour revenir à l'état précédent
- Le worktree reste sur sa branche actuelle, seuls les commits de main sont intégrés
