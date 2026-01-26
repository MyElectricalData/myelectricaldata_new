---
name: admin_dashboard
id: dashboard
path: /admin
description: Tableau de bord principal d'administration
mode_client: false
mode_server: true
menu: Administration
subMenu: Tableau de bord
tab: Tableau de bord
---

# Tableau de bord

Fichier : `apps/web/src/pages/Admin/Dashboard.tsx`

## Features

| Feature                  | Statut |
| ------------------------ | ------ |
| Statistiques generales   | FAIT   |
| Graphiques et tendances  | FAIT   |
| Alertes et notifications | FAIT   |
| Raccourcis admin         | FAIT   |
| Informations systeme     | FAIT   |
| Actions rapides          | FAIT   |

## Details implementation

### Statistiques generales (FAIT)

Cards affichant :

- **Utilisateurs** : Total, nouveaux ce mois, actifs (connexion < 30j), inactifs
- **PDL** : Total, actifs, crees ce mois, repartition par utilisateur
- **Donnees** : Volume stocke, requetes API Enedis, taux cache hit/miss
- **Offres** : Total, actives, fournisseurs, derniere MAJ tarifs

### Graphiques et visualisations (FAIT)

- Evolution utilisateurs (30 derniers jours)
- Repartition types d'offres
- Activite systeme (requetes/jour)
- Utilisation du cache

### Alertes et notifications (FAIT)

- Contributions en attente de validation
- Erreurs API recentes
- Espace disque faible
- Certificats SSL a renouveler

### Raccourcis vers les pages admin (FAIT)

- Gestion des utilisateurs
- Gestion des offres
- Gestion TEMPO
- Logs systeme
- Gestion EcoWatt
- Contributions
- Gestion des roles

### Informations systeme (FAIT)

- Version application (frontend + backend)
- Environnement (production/developpement)
- Base de donnees (type, taille, connexions)
- Status API externes (Enedis, RTE)

### Actions rapides (FAIT)

- Vider le cache Redis
- Forcer synchronisation TEMPO
- Forcer synchronisation EcoWatt
- Backup base de donnees

## Permissions requises

- **Role** : Administrateur
- **Permission** : `admin:view`

## Technologies

- React avec TypeScript
- React Query pour requetes temps reel
- Recharts pour graphiques
- Tailwind CSS + dark mode

## API utilisee

- `GET /admin/stats` : Statistiques generales
- `GET /admin/alerts` : Alertes en cours
- `POST /admin/cache/clear` : Vider le cache
- `POST /admin/sync/tempo` : Forcer sync TEMPO
- `POST /admin/sync/ecowatt` : Forcer sync EcoWatt

## Notes

- Rafraichissement automatique toutes les 30 secondes
- Les statistiques sont calculees en temps reel
- Les actions sensibles necessitent confirmation
