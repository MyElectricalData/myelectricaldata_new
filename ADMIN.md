# Panel Administrateur

MyElectricalData inclut un panel d'administration pour gérer les utilisateurs et surveiller l'utilisation de la plateforme.

## 🔐 Configuration des administrateurs

Les administrateurs sont définis via la variable d'environnement `ADMIN_EMAILS` dans `.env.api` :

```bash
ADMIN_EMAILS=admin@example.com,another.admin@example.com
```

**Caractéristiques** :
- Support de plusieurs administrateurs (séparés par des virgules)
- Vérification insensible à la casse
- Un utilisateur doit avoir un compte pour accéder au panel admin

## 📊 Accès au panel

Une fois connecté avec un compte administrateur, un lien **Admin** (icône bouclier 🛡️) apparaît dans le menu de navigation.

Le panel admin est accessible à : `https://myelectricaldata.fr/admin`

## ✨ Fonctionnalités

### 1. Statistiques globales

Affichage en temps réel :
- **Nombre total d'utilisateurs**
- **Nombre total de PDL** (Points De Livraison)
- **Total d'appels API** effectués

### 2. Liste des utilisateurs

Tableau détaillé avec :
- **Email** de l'utilisateur
- **Client ID** pour identification
- **Nombre de PDL** associés
- **Quota utilisé sans cache** (requêtes vers Enedis)
- **Quota utilisé avec cache** (requêtes servies par le cache)
- **Date de création** du compte

### 3. Gestion des quotas

Chaque utilisateur dispose d'un bouton **"Reset Quota"** permettant de :
- Réinitialiser le compteur de requêtes sans cache
- Réinitialiser le compteur de requêtes avec cache
- Donner immédiatement accès aux quotas complets

**Utilisation** : Utile pour les utilisateurs ayant des besoins ponctuels ou en cas d'erreur.

### 4. Auto-refresh

Le panel se rafraîchit automatiquement toutes les **30 secondes** pour afficher les statistiques en temps réel.

## 🔒 Sécurité

- **Authentification requise** : Seuls les utilisateurs authentifiés peuvent accéder
- **Vérification admin** : Middleware vérifie que l'email est dans `ADMIN_EMAILS`
- **Erreur 403** : Retournée si un non-admin tente d'accéder aux endpoints
- **Isolation des données** : Les admins voient tous les utilisateurs mais ne peuvent pas accéder à leurs données Enedis

## 🛠️ API Endpoints

### GET `/api/admin/users`

Liste tous les utilisateurs avec leurs statistiques.

**Réponse** :
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user-uuid",
        "email": "user@example.com",
        "client_id": "abc123",
        "pdl_count": 2,
        "created_at": "2024-01-15T10:30:00",
        "usage_stats": {
          "no_cache": 45,
          "with_cache": 230
        }
      }
    ]
  }
}
```

### POST `/api/admin/users/{user_id}/reset-quota`

Réinitialise les quotas journaliers d'un utilisateur.

**Réponse** :
```json
{
  "success": true,
  "message": "User quota reset successfully"
}
```

### GET `/api/admin/stats`

Retourne les statistiques globales de la plateforme.

**Réponse** :
```json
{
  "success": true,
  "data": {
    "total_users": 150,
    "total_pdls": 320,
    "total_api_calls": 45230
  }
}
```

## 🔧 Implémentation technique

### Backend

- **Middleware** : `apps/api/src/middleware/admin.py` - Vérification des droits admin
- **Router** : `apps/api/src/routers/admin.py` - Endpoints admin
- **Settings** : Méthode `is_admin()` dans `apps/api/src/config/settings.py`

### Frontend

- **Page** : `apps/web/src/pages/Admin.tsx` - Interface du panel
- **API Client** : `apps/web/src/api/admin.ts` - Requêtes vers le backend
- **Navigation** : Lien conditionnel dans `apps/web/src/components/Layout.tsx`

## 📝 Notes

- Le reset de quota supprime les clés Redis `user:{user_id}:daily_no_cache` et `user:{user_id}:daily_with_cache`
- Les statistiques de quotas sont calculées en temps réel depuis Redis
- Si Redis est vidé, les compteurs sont réinitialisés pour tous les utilisateurs
