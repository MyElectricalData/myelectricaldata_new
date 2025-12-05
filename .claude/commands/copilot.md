---
description: Lit et corrige les problèmes remontés par GitHub Copilot sur la PR en cours
allowed-tools: Bash(gh:*), Bash(git:*), Read, Edit, Write, Glob, Grep
---

# Objectif

Analyser les retours de GitHub Copilot Code Review sur la PR associée à la branche actuelle et corriger automatiquement les problèmes identifiés.

## Workflow

### 1. Identifier la PR associée à la branche courante

```bash
# Récupérer le numéro de la PR pour la branche actuelle
gh pr view --json number,title,state,url 2>/dev/null || echo "NO_PR"
```

Si aucune PR n'existe pour cette branche, informer l'utilisateur et arrêter.

### 2. Récupérer les commentaires de review de Copilot

```bash
# Lister tous les commentaires de review sur la PR (inclut Copilot)
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments --jq '.[] | select(.user.login == "copilot" or .user.login == "github-actions[bot]" or (.user.login | contains("copilot"))) | {path: .path, line: .line, body: .body, diff_hunk: .diff_hunk}'
```

Alternative si la première ne retourne rien :

```bash
# Récupérer toutes les reviews et leurs commentaires
gh pr view {pr_number} --json reviews,reviewRequests --jq '.reviews[] | select(.author.login | contains("copilot")) | {body: .body, state: .state}'
```

### 3. Récupérer les suggestions de code de Copilot

Les suggestions Copilot apparaissent souvent comme commentaires avec un bloc de code suggéré. Extraire :
- Le fichier concerné (`path`)
- La ligne concernée (`line` ou `original_line`)
- Le problème décrit dans `body`
- La suggestion de correction (bloc de code markdown dans `body`)

### 4. Pour chaque problème identifié

1. **Lire le fichier concerné** pour comprendre le contexte
2. **Analyser le problème** décrit par Copilot
3. **Appliquer la correction** appropriée :
   - Si Copilot fournit une suggestion de code : l'appliquer avec l'outil Edit
   - Sinon : analyser et corriger selon la description du problème

### 5. Types de problèmes courants détectés par Copilot

- **Sécurité** : Injection SQL, XSS, secrets hardcodés
- **Qualité du code** : Variables non utilisées, imports manquants
- **Performance** : N+1 queries, boucles inefficaces
- **Bonnes pratiques** : Typage manquant, gestion d'erreurs

### 6. Résumer les corrections

À la fin, fournir un résumé :
- Nombre de problèmes détectés
- Nombre de problèmes corrigés
- Problèmes non corrigés (avec justification)

## Commandes utiles

```bash
# Voir la branche courante
git branch --show-current

# Voir le repo distant
gh repo view --json owner,name

# Récupérer tous les commentaires de la PR
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments

# Récupérer les reviews de la PR
gh api repos/{owner}/{repo}/pulls/{pr_number}/reviews
```

## Notes importantes

- Ne corriger que les problèmes légitimes signalés par Copilot
- Préserver le style de code existant
- Si un problème n'est pas clair, le signaler à l'utilisateur plutôt que deviner
- Committer les corrections avec un message explicite mentionnant "Fix Copilot review"
