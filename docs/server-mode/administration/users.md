---
sidebar_position: 1
---

# Utilisateurs

## Vue d'ensemble

L'interface d'administration des utilisateurs permet de gérer les comptes, les rôles et les permissions.

**Accès** : `/admin/users` (nécessite le rôle administrateur)

---

## Liste des utilisateurs

La page affiche tous les utilisateurs avec :

| Colonne | Description |
|---------|-------------|
| Email | Adresse email (identifiant unique) |
| Statut | Actif / Inactif |
| Rôle | Admin / Utilisateur |
| PDL | Nombre de PDL associés |
| Consentement | Statut du consentement Enedis |
| Créé le | Date de création du compte |

### Filtres disponibles

- **Statut** : Tous / Actifs / Inactifs
- **Rôle** : Tous / Admin / Utilisateur
- **Consentement** : Tous / Avec / Sans
- **Recherche** : Par email

---

## Actions sur un utilisateur

### Voir les détails

Cliquer sur un utilisateur pour voir :

- Informations du compte
- Liste des PDL associés
- Historique des connexions
- Quotas d'utilisation

### Modifier le rôle

```
Utilisateur → Actions → Modifier le rôle
```

Rôles disponibles :
- **Utilisateur** : Accès standard aux fonctionnalités
- **Administrateur** : Accès complet + administration

### Désactiver / Activer

```
Utilisateur → Actions → Désactiver
```

Un utilisateur désactivé :
- Ne peut plus se connecter
- Ses données sont conservées
- Peut être réactivé à tout moment

### Supprimer

```
Utilisateur → Actions → Supprimer
```

⚠️ **Attention** : La suppression est définitive et inclut :
- Le compte utilisateur
- Tous les PDL associés
- Tous les tokens OAuth2
- Toutes les données en cache

---

## Créer un utilisateur

Les utilisateurs se créent via l'inscription publique (`/signup`).

Pour créer un administrateur :
1. L'utilisateur s'inscrit normalement
2. Un admin existant modifie son rôle

Ou via la variable d'environnement `ADMIN_EMAILS` :
```bash
ADMIN_EMAILS=admin@example.com,admin2@example.com
```

---

## Gestion des PDL

### Voir les PDL d'un utilisateur

```
Utilisateur → Détails → Onglet PDL
```

Affiche :
- Numéro PDL (14 chiffres)
- Alias (nom personnalisé)
- Production activée (oui/non)
- Statut du token Enedis

### Ajouter un PDL manuellement

```
Admin → PDL → Ajouter un PDL
```

Permet d'ajouter un PDL à un utilisateur sans consentement OAuth2.
Utile pour les cas spéciaux (migration, support).

⚠️ Un token Enedis valide sera nécessaire pour accéder aux données.

---

## Quotas et limites

### Quotas par défaut

| Métrique | Limite |
|----------|--------|
| Requêtes non-cachées/jour | 50 |
| Requêtes cachées/jour | 1000 |
| PDL maximum | 10 |

### Voir l'utilisation

```
Utilisateur → Détails → Onglet Quotas
```

Affiche :
- Requêtes du jour (cache hit / miss)
- Historique sur 7 jours
- Alertes si proche de la limite

---

## Logs d'activité

### Voir les logs d'un utilisateur

```
Utilisateur → Détails → Onglet Activité
```

Événements tracés :
- Connexions (succès/échec)
- Modifications de compte
- Consentements OAuth2
- Erreurs API

### Export des logs

```
Utilisateur → Actions → Exporter les logs
```

Format CSV avec :
- Date/heure
- Action
- IP source
- Détails
