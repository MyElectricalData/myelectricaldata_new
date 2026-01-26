---
id: tempo
---
# Tempo

**Route:** `/tempo`

## Description

Page affichant le **calendrier TEMPO** d'EDF avec les couleurs des jours et statistiques.

## Fonctionnalités principales

### 1. Calendrier TEMPO
- Affichage mensuel des jours
- Couleurs par jour :
  - 🔵 Bleu : moins chers (300 jours/an)
  - ⚪ Blanc : intermédiaires (43 jours/an)
  - 🔴 Rouge : plus chers (22 jours/an)
- Navigation mois/années
- Jour actuel mis en évidence

### 2. Statistiques
- Compteur par couleur pour l'année
- Jours restants par couleur
- Progression visuelle avec barres

### 3. Légende
- Explication des couleurs
- Nombre de jours autorisés par couleur

### 4. Informations
- Explication du tarif TEMPO
- Avantages et contraintes
- Lien vers documentation EDF

## Technologies

- React avec TypeScript
- React Query (données TEMPO)
- Tailwind CSS
- Support mode sombre

## Fichiers liés

- **Frontend** : `apps/web/src/pages/Tempo.tsx`
- **API** : `apps/web/src/api/tempo.ts`
- **Backend** : `apps/api/src/routers/tempo.py`

## Notes importantes

- Données mises à jour quotidiennement
- Couleurs futures connues veille pour lendemain
- Gestion automatique années transition (sept-août)
- Données historiques en base
