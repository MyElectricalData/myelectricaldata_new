---
name: admin_tempo
id: tempo
path: /admin/tempo
description: Gestion des donnees TEMPO (couleurs des jours)
mode_client: false
mode_server: true
menu: Administration
subMenu: Tempo
tab: Tempo
---

# Gestion TEMPO

Fichier : `apps/web/src/pages/Admin/Tempo.tsx`

## Features

| Feature               | Statut |
| --------------------- | ------ |
| Calendrier editable   | FAIT   |
| Import de donnees     | FAIT   |
| Modification manuelle | FAIT   |
| Validation            | FAIT   |
| Statistiques          | FAIT   |
| Sauvegarde            | FAIT   |

## Details implementation

### Calendrier TEMPO editable (FAIT)

- Affichage mensuel des jours TEMPO
- Modification couleur par clic
- Couleurs : Bleu, Blanc, Rouge, Non defini
- Navigation entre mois et annees

### Import de donnees (FAIT)

- Import en masse depuis fichier JSON
- Import depuis API RTE officielle
- Format : date -> couleur

### Modification manuelle (FAIT)

- Clic sur jour pour changer couleur
- Selection multiple pour appliquer a plusieurs jours
- Annulation modifications non sauvegardees

### Validation (FAIT)

Verification limites annuelles :

- Maximum 300 jours Bleu par an
- Maximum 43 jours Blanc par an
- Maximum 22 jours Rouge par an
- Alertes si limites depassees

### Statistiques (FAIT)

- Compteur temps reel par couleur
- Jours restants pour chaque couleur
- Comparaison annees precedentes

### Sauvegarde (FAIT)

- Bouton pour enregistrer modifications
- Confirmation avant sauvegarde
- Synchronisation avec base de donnees

## Permissions requises

- **Role** : Administrateur
- **Permission** : `tempo:manage`

## Technologies

- React avec TypeScript
- React Query pour mutations et cache
- Tailwind CSS + dark mode

## API utilisee

- `GET /tempo/data` : Donnees TEMPO
- `PUT /admin/tempo` : Mise a jour TEMPO
- `POST /admin/tempo/import` : Import donnees
- `POST /admin/sync/tempo` : Sync API RTE

## Notes

- Donnees TEMPO critiques pour simulateur
- Limites annuelles a respecter (contrat EDF)
- Annee TEMPO : septembre N-1 a aout N
- Donnees futures generalement inconnues
