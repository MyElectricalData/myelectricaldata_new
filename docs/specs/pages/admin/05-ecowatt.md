---
name: admin_ecowatt
id: ecowatt
path: /admin/ecowatt
description: Gestion des donnees EcoWatt et synchronisation RTE
mode_client: false
mode_server: true
menu: Administration
subMenu: EcoWatt
tab: EcoWatt
---

# Gestion EcoWatt

Fichier : `apps/web/src/pages/Admin/EcoWatt.tsx`

## Features

| Feature                  | Statut |
| ------------------------ | ------ |
| Synchronisation API RTE  | FAIT   |
| Visualisation donnees    | FAIT   |
| Gestion manuelle         | FAIT   |
| Configuration API        | FAIT   |
| Statistiques             | FAIT   |
| Logs synchronisation     | FAIT   |
| Alertes et notifications | FAIT   |

## Details implementation

### Synchronisation API RTE (FAIT)

- Bouton forcer synchronisation immediate
- Configuration synchronisation automatique
- Frequence par defaut : toutes les heures
- Historique dernieres synchronisations

### Visualisation donnees (FAIT)

- Signal EcoWatt actuel (Vert/Orange/Rouge)
- Previsions 4 prochains jours
- Historique signaux EcoWatt
- Graphique tendance sur le mois

### Gestion manuelle (FAIT)

- Ajout manuel d'un signal
- Modification signal existant
- Suppression donnees erronees
- Correction anomalies

### Configuration API RTE (FAIT)

- Cle API RTE
- URL endpoint
- Timeout requete
- Retry policy
- Test de connexion

### Statistiques (FAIT)

- Jours Vert/Orange/Rouge sur le mois
- Jours Vert/Orange/Rouge sur l'annee
- Comparaison annees precedentes
- Tendance d'evolution

### Logs synchronisation (FAIT)

- Historique synchronisations
- Erreurs rencontrees
- Nombre donnees mises a jour
- Temps reponse API RTE

### Alertes et notifications (FAIT)

- Alerte si signal rouge prevu
- Notification si echec synchronisation
- Email aux utilisateurs si orange/rouge

## Permissions requises

- **Role** : Administrateur
- **Permission** : `ecowatt:manage`

## Technologies

- React avec TypeScript
- React Query pour mutations et cache
- Recharts pour graphiques
- Tailwind CSS + dark mode

## API utilisee

- `GET /ecowatt/data` : Donnees EcoWatt
- `PUT /admin/ecowatt` : Mise a jour EcoWatt
- `POST /admin/sync/ecowatt` : Sync API RTE
- `GET /admin/ecowatt/logs` : Logs synchronisation

## Notes

- Donnees fournies par RTE (Reseau Transport Electricite)
- Synchronisation reguliere necessaire
- Signaux orange/rouge a communiquer aux utilisateurs
- API RTE peut avoir limites de taux
- Donnees historiques importantes pour analyses
