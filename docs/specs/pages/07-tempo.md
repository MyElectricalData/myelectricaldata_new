---
name: tempo
id: tempo
path: /tempo
description: Calendrier TEMPO EDF avec couleurs des jours et statistiques
mode_client: true
mode_server: true
menu: Tempo
---

# Tempo

Page affichant le **calendrier TEMPO** d'EDF avec les couleurs des jours et statistiques.

## Features

| Feature               | Statut |
| --------------------- | ------ |
| Calendrier mensuel    | FAIT   |
| Navigation mois/annee | FAIT   |
| Statistiques couleurs | FAIT   |
| Jours restants        | FAIT   |
| Legende               | FAIT   |
| Informations TEMPO    | FAIT   |

## Fichiers

| Type    | Fichier                            |
| ------- | ---------------------------------- |
| Page    | `apps/web/src/pages/Tempo.tsx`     |
| API     | `apps/web/src/api/tempo.ts`        |
| Backend | `apps/api/src/routers/tempo.py`    |

## Details implementation

### Calendrier TEMPO (FAIT)
- Affichage mensuel des jours
- Couleurs par jour :
  - 🔵 Bleu : moins chers (300 jours/an)
  - ⚪ Blanc : intermédiaires (43 jours/an)
  - 🔴 Rouge : plus chers (22 jours/an)
- Navigation mois/années
- Jour actuel mis en évidence

### Statistiques (FAIT)
- Compteur par couleur pour l'année
- Jours restants par couleur
- Progression visuelle avec barres

### Legende (FAIT)
- Explication des couleurs
- Nombre de jours autorisés par couleur

### Informations (FAIT)
- Explication du tarif TEMPO
- Avantages et contraintes
- Lien vers documentation EDF

## Notes importantes

- Données mises à jour quotidiennement
- Couleurs futures connues veille pour lendemain
- Gestion automatique années transition (sept-août)
- Données historiques en base
