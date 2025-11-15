# Commande /demo - Génération d'un compte de démonstration

Cette commande génère automatiquement un compte de démonstration avec des données fictives pour présenter les fonctionnalités de l'application MyElectricalData.

## Objectif

Créer un compte de démonstration avec :
- **Identifiants** : login `demo` / mot de passe `demo`
- **Données fictives** : 3 ans de données de consommation et production
- **Mocks Enedis** : Tous les appels API Enedis sont mockés
- **PDLs de démonstration** : Plusieurs compteurs avec différents profils
- **Restrictions** : Récupération de données et simulations bloquées

## Fonctionnalités à implémenter

### 1. Création du compte demo

Créer un utilisateur avec :
- Username: `demo`
- Password: `demo` (hashé avec bcrypt)
- Email: `demo@myelectricaldata.fr`
- Rôle: utilisateur standard (non-admin)
- Client ID et Client Secret générés automatiquement

### 2. Génération des PDLs de démonstration

Créer 2-3 PDLs avec des profils différents :

1. **PDL Résidentiel classique** (14 chiffres commençant par exemple par `04004253849200`)
   - Puissance souscrite: 6 kVA
   - Type: Consommation seule
   - Heures creuses: Oui (22h-6h)

2. **PDL avec production solaire** (14 chiffres commençant par exemple par `04004253849201`)
   - Puissance souscrite: 9 kVA
   - Type: Mixte (consommation + production)
   - Heures creuses: Oui (22h-6h)
   - Production photovoltaïque

3. **PDL Résidence secondaire** (optionnel) (14 chiffres commençant par exemple par `04004253849202`)
   - Puissance souscrite: 3 kVA
   - Type: Consommation seule
   - Heures creuses: Oui (22h-6h)
   - Consommation saisonnière (pics en été/hiver)

### 3. Génération des données fictives sur 3 ans

Pour chaque PDL, générer des données de consommation quotidienne avec :

**Données de consommation réalistes** :
- Consommation journalière variable selon la saison
- Hiver (déc-fév): 20-35 kWh/jour (chauffage)
- Été (juin-août): 10-18 kWh/jour (climatisation)
- Mi-saison: 12-22 kWh/jour
- Variation aléatoire jour/jour (±15%)
- Pics de consommation certains jours (±30%)

**Données de production (PDL avec solaire)** :
- Production variable selon la saison et l'ensoleillement
- Été: 15-25 kWh/jour
- Hiver: 5-10 kWh/jour
- Jours sans soleil: 0-3 kWh/jour
- Pic de production en journée (pas la nuit)

**Format des données** :
```json
{
  "date": "YYYY-MM-DD",
  "value": 15.5,
  "quality": "CORRIGE",
  "type": "daily"
}
```

### 4. Mocking des appels Enedis

Créer un système de mock pour intercepter tous les appels à l'API Enedis quand l'utilisateur est `demo` :

**Endpoints à mocker** :
- `/consumption/daily/{pdl}` - Retourner les données de consommation générées
- `/consumption/detail/{pdl}` - Retourner les données en détail (30 min)
- `/production/daily/{pdl}` - Retourner les données de production
- `/production/detail/{pdl}` - Retourner les données de production en détail
- `/contracts/{pdl}` - Retourner un contrat fictif
- `/address/{pdl}` - Retourner une adresse fictive
- `/customer` - Retourner les informations client fictives
- `/contact` - Retourner les informations de contact fictives

**Stratégie de mock** :
- Détecter si l'utilisateur connecté est le compte `demo`
- Si oui, court-circuiter l'appel Enedis et retourner les données mockées depuis Redis cache
- Si non, effectuer l'appel Enedis normal

### 5. Mise en cache Redis

Stocker toutes les données fictives dans Redis avec la même structure que les vraies données :
- Clés de cache identiques au fonctionnement normal
- TTL adaptés pour persistance
- Chiffrement avec le client_secret du compte demo
- Format identique aux vraies données Enedis

### 6. Script de génération

Créer un script Python qui :
1. Vérifie si le compte demo existe déjà
2. Si oui, propose de le supprimer et recréer
3. Si non, crée le compte avec les PDLs
4. Génère 3 ans de données (environ 1095 jours par PDL)
5. Met en cache toutes les données dans Redis
6. Affiche les credentials du compte (client_id, client_secret)

## Structure des fichiers

### Script de génération
`apps/api/scripts/generate_demo_account.py`

### Middleware de mock
`apps/api/src/middleware/demo_mock.py`

### Adaptateur Enedis modifié
`apps/api/src/adapters/enedis.py` - Ajouter la détection du compte demo

### Configuration
`apps/api/src/config/demo_config.py` - Configuration des paramètres de génération

## Utilisation

### Générer le compte demo
```bash
cd apps/api
python scripts/generate_demo_account.py
```

### Se connecter avec le compte demo
- Frontend: Login avec `demo` / `demo`
- API: Utiliser le client_id et client_secret retournés par le script

### Vérifier les données
```bash
# Afficher les PDLs du compte demo
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/pdl

# Afficher les données de consommation
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/consumption/daily/<pdl>?start=2019-01-01&end=2024-12-31
```

## Notes techniques

- Les données sont générées de manière déterministe (même seed) pour reproductibilité
- Le compte demo ne peut pas modifier ses données
- Les appels mockés sont loggés avec le tag `[DEMO]` pour traçabilité
- Le cache Redis utilise un préfixe `demo:` pour isoler les données
- Les données sont régénérées si le cache expire

## Sécurité

- Le mot de passe `demo` est bien hashé avec bcrypt
- Le compte ne peut pas accéder aux fonctions d'administration
- Les données sont isolées des vraies données utilisateurs
- Le compte peut être désactivé facilement via une variable d'environnement

## Cas d'usage

- Démo commerciale
- Tests fonctionnels
- Formation utilisateurs
- Captures d'écran pour la documentation
- Tests de performance avec données réalistes

## Commande Claude

Lorsque tu travailles avec cette commande :
1. Analyse l'architecture existante (authentification, modèles, cache)
2. Crée le script de génération des données
3. Implémente le système de mock des appels Enedis
4. Teste la création du compte et la génération des données
5. Vérifie que les appels API retournent bien les données mockées
6. Documente les credentials générés
