---
id: ecowatt
---
# EcoWatt

**Route:** `/ecowatt`

## Description

Page affichant les **informations EcoWatt de RTE** sur l'état du réseau électrique français.

## Fonctionnalités principales

### 1. Signal EcoWatt actuel
- Indicateur visuel état réseau :
  - 🟢 Vert : Pas de tension
  - 🟠 Orange : Système tendu
  - 🔴 Rouge : Très tendu, coupures possibles
- Message explicatif selon niveau
- Heure dernière mise à jour

### 2. Prévisions sur 4 jours
- Tableau prévisions jour par jour
- État par tranche horaire (matin/après-midi/soir)
- Code couleur selon niveau tension

### 3. Statistiques
- Nombre jours vert/orange/rouge sur mois
- Nombre jours vert/orange/rouge sur année
- Graphiques de répartition

### 4. Recommandations
- Conseils EcoGestes selon niveau
- Actions en cas de tension réseau

### 5. Informations complémentaires
- Explication système EcoWatt
- Pourquoi et quand économiser
- Lien vers site officiel RTE

## Technologies

- React avec TypeScript
- React Query (données EcoWatt)
- Tailwind CSS
- Support mode sombre

## Fichiers liés

- **Frontend** : `apps/web/src/pages/EcoWatt.tsx`
- **API** : `apps/web/src/api/ecowatt.ts`
- **Backend** : `apps/api/src/routers/ecowatt.py`

## Notes importantes

- Données fournies par API RTE
- Prévisions mises à jour plusieurs fois/jour
- Signal particulièrement important en hiver
- Coupures évitées par mobilisation citoyenne
