# Ordre du menu latéral

Ce document définit l'ordre d'affichage des éléments dans le menu de navigation gauche.

## Structure du menu

### Section principale (Navigation)

| #   | Route               | Label           | Icône        | Mode    |
| --- | ------------------- | --------------- | ------------ | ------- |
| 1   | `/dashboard`        | Tableau de bord | `Home`       | Tous    |
| 2   | `/consumption_*`    | Consommation    | `TrendingUp` | Tous    |
| 2.1 | `/consumption_kwh`  | → En kWh        | `TrendingUp` | Tous    |
| 2.2 | `/consumption_euro` | → En €          | `Euro`       | Tous    |
| 3   | `/production`       | Production      | `Sun`        | Tous    |
| 4   | `/balance`          | Bilan           | `Scale`      | Tous    |
| 5   | `/simulator`        | Simulateur      | `Calculator` | Serveur |
| 6   | `/contribute`       | Contribuer      | `Users`      | Serveur (badge compteur) |
| 7   | `/tempo`            | Tempo           | `Calendar`   | Tous    |
| 8   | `/ecowatt`          | EcoWatt         | `Zap`        | Tous    |
| 9   | `/france`           | France          | `Activity`   | Tous    |

### Section Administration (Mode Serveur, Admin uniquement)

| #    | Route                  | Label             | Notes               |
| ---- | ---------------------- | ----------------- | ------------------- |
| 10   | `/admin`               | Administration    | `Shield`            |
| 10.1 | `/admin`               | → Tableau de bord |                     |
| 10.2 | `/admin/users`         | → Utilisateurs    |                     |
| 10.3 | `/admin/rte`           | → API RTE         |                     |
| 10.4 | `/admin/tempo`         | → Tempo           |                     |
| 10.5 | `/admin/ecowatt`       | → EcoWatt         |                     |
| 10.6 | `/admin/contributions` | → Contributions   | Badge avec compteur |
| 10.7 | `/admin/offers`        | → Offres          |                     |
| 10.8 | `/admin/roles`         | → Rôles           |                     |
| 10.9 | `/admin/logs`          | → Logs            |                     |
| 11   | -                      | Vider le cache    | `Trash2` (rouge)    |

### Section Exports (Mode Client uniquement)

| #   | Route              | Label           | Icône      |
| --- | ------------------ | --------------- | ---------- |
| 9   | `/home-assistant`  | Home Assistant  | `Home`     |
| 10  | `/mqtt`            | MQTT            | `Radio`    |
| 11  | `/victoriametrics` | VictoriaMetrics | `Database` |

### Section Bas de page

| #   | Route       | Label             | Icône            | Mode    |
| --- | ----------- | ----------------- | ---------------- | ------- |
| -   | -           | Faire un don      | `Heart` (rose)   | Serveur |
| -   | `/faq`      | FAQ Enedis        | `HelpCircle`     | Tous    |
| -   | `/api-docs` | Documentation API | `BookOpen`       | Tous    |
| -   | -           | Mode clair/sombre | `Sun`/`Moon`     | Tous    |
| -   | `/settings` | Mon compte        | `UserCircle`     | Serveur |
| -   | -           | Déconnexion       | `LogOut` (rouge) | Serveur |

## Fichier source

Le menu est implémenté dans [Layout.tsx](../../apps/web/src/components/Layout.tsx).

## Règles de modification

1. **Ordre figé** : L'ordre défini ici doit être respecté dans `Layout.tsx`
2. **Icônes** : Toutes les icônes viennent de `lucide-react`
3. **Mode** : Vérifier `isServerMode` ou `isClientMode` pour les éléments conditionnels
4. **Sous-menus** : Les sous-menus (Consommation, Admin) s'ouvrent automatiquement quand on est sur une page enfant
5. **Badges** : Les compteurs (contributions) sont mis à jour toutes les 30 secondes

## Séparateurs visuels

| Position         | Contexte                                                    |
| ---------------- | ----------------------------------------------------------- |
| Avant Admin      | Sépare les pages utilisateur de l'administration            |
| Avant Exports    | Mode client : sépare les pages de visualisation des exports |
| Avant FAQ/Docs   | Sépare la navigation de l'aide                              |
| Avant Mon compte | Sépare l'aide des actions utilisateur                       |
