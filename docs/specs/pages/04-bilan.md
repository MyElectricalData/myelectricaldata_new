---
name: bilan
id: bilan
path: /balance
description: Page de bilan energetique entre consommation et production
mode_client: true
mode_server: true
menu: Bilan
---

# Page Bilan Energetique

Page permettant de visualiser le **bilan énergétique** entre consommation et production.

## Features

| Feature                       | Statut |
| ----------------------------- | ------ |
| Cartes resume (4 indicateurs) | FAIT   |
| Selecteur d'annees            | FAIT   |
| Comparaison mensuelle         | FAIT   |
| Courbe de bilan net           | FAIT   |
| Tableau annuel                | FAIT   |
| Bloc d'informations           | FAIT   |

## Fichiers

| Type       | Fichier                                  |
| ---------- | ---------------------------------------- |
| Page       | `apps/web/src/pages/Balance/index.tsx`   |
| Composants | `apps/web/src/pages/Balance/components/` |
| Hooks      | `apps/web/src/pages/Balance/hooks/`      |
| Types      | `apps/web/src/pages/Balance/types/`      |

## Details implementation

### Prerequis

- Au moins un PDL avec des données de **production** (directement ou via PDL lié)
- Données de consommation et de production chargées en cache

### Cartes de resume (FAIT)

4 métriques clés sur la période (3 ans par défaut) :

| Carte                | Icône                 | Description                          |
| -------------------- | --------------------- | ------------------------------------ |
| **Consommation**     | Maison (bleu)         | Total énergie consommée (kWh)        |
| **Production**       | Soleil (jaune)        | Total énergie produite (kWh)         |
| **Bilan Net**        | Tendance (vert/rouge) | Différence production - consommation |
| **Autoconsommation** | % (violet)            | Taux d'autoconsommation              |

### Selecteur d'annees (FAIT)

- Boutons colorés pour chaque année disponible
- Sélection/désélection pour comparer
- Production totale affichée par année

### Comparaison mensuelle (FAIT)

Graphique en barres consommation vs production par mois.

### Courbe de bilan net (FAIT)

Graphique linéaire du bilan net journalier (surplus vert, déficit rouge).

### Tableau annuel (FAIT)

Récapitulatif par année : consommation, production, bilan net, taux autoconsommation.

### Bloc d'informations (FAIT)

Section dépliable avec explications sur les calculs.

## Notes

- React + TypeScript, React Query, Zustand, Recharts, Tailwind CSS + mode sombre
