# Documentation RTE APIs

Ce dossier contient la documentation des APIs RTE (Réseau de Transport d'Électricité) utilisées dans MyElectricalData.

## Vue d'Ensemble

RTE (Réseau de Transport d'Électricité) est le gestionnaire du réseau de transport d'électricité français. RTE met à disposition plusieurs APIs publiques permettant d'accéder à des données sur le réseau électrique, la production, la consommation et les tarifications.

## APIs Documentées

### 📊 [Tempo](./tempo/)

API de consultation des couleurs tarifaires Tempo (BLEU/BLANC/ROUGE) pour optimiser la consommation électrique.

**Documentation** :
- [Documentation complète de l'API](./tempo/tempo-api.md)
- [Exemple d'intégration dans MyElectricalData](./tempo/tempo-integration-example.md)
- [README Tempo](./tempo/README.md)

**Cas d'usage** :
- Affichage de la couleur du jour sur le dashboard
- Calcul des coûts selon les périodes Tempo
- Alertes avant les jours rouges
- Statistiques de consommation par couleur

### ⚡ [écowatt](./ecowatt/)

API de signaux sur l'équilibre du système électrique français avec alertes de tension réseau.

**Documentation** :
- [Documentation complète de l'API](./ecowatt/ecowatt-api.md)
- [Exemple d'intégration dans MyElectricalData](./ecowatt/ecowatt-integration-example.md)
- [README écowatt](./ecowatt/README.md)

**Cas d'usage** :
- Affichage du signal écowatt en temps réel (VERT/ORANGE/ROUGE)
- Alertes préventives avant risques de coupures
- Recommandations d'éco-gestes automatiques
- Identification des heures de pointe
- Optimisation de la consommation selon tensions réseau

## Prérequis Généraux

Pour utiliser les APIs RTE, vous devez :

1. **Créer un compte** sur [data.rte-france.com](https://data.rte-france.com)
2. **Souscrire aux APIs** souhaitées depuis le catalogue
3. **Récupérer vos identifiants OAuth 2.0** (client_id, client_secret)

## Authentification

Toutes les APIs RTE utilisent **OAuth 2.0 Client Credentials** :

```bash
# Obtenir un token d'accès
curl -X POST "https://digital.iservices.rte-france.com/token/oauth/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"

# Réponse
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 7200
}

# Utiliser le token dans les requêtes
curl -X GET "https://digital.iservices.rte-france.com/open_api/..." \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Accept: application/json"
```

**Durée de vie des tokens** : 7200 secondes (2 heures)

## Structure du Dossier

```
docs/rte-api/
├── README.md                    # Ce fichier (index général)
├── tempo/                       # Documentation API Tempo
│   ├── README.md
│   ├── tempo-api.md
│   └── tempo-integration-example.md
├── ecowatt/                     # Documentation API écowatt
│   ├── README.md
│   ├── ecowatt-api.md
│   └── ecowatt-integration-example.md
└── [futures APIs à documenter]
```

## Limites Générales

| Limite | Valeur |
|--------|--------|
| Taille maximale de réponse | 7 MB |
| Longueur maximale URI | 2048 caractères |
| Format de date | ISO 8601 avec timezone française (UTC+1/UTC+2) |
| Durée de vie token OAuth | 7200 secondes (2 heures) |

## Bonnes Pratiques

### 1. Gestion du Token OAuth

```python
class RTEClient:
    def __init__(self, client_id: str, client_secret: str):
        self.token = None
        self.token_expiry = None

    async def get_token(self):
        # Réutiliser le token s'il est encore valide
        if self.token and self.token_expiry > datetime.now() + timedelta(minutes=5):
            return self.token

        # Sinon, en obtenir un nouveau
        # ... code d'obtention du token
```

### 2. Cache des Données

Les données historiques RTE ne changent jamais. Utilisez un cache avec TTL approprié :

- **Données historiques** : TTL long (7+ jours)
- **Données du jour** : TTL court (1 heure pour Tempo, 15 minutes pour écowatt)
- **Prévisions** : TTL très court (15 minutes minimum pour respecter les limites API)

### 3. Gestion des Erreurs

Implémentez toujours une gestion robuste des erreurs avec retry :

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10)
)
async def call_rte_api():
    # ... appel API
```

### 4. Respect des Quotas

- Surveillez vos quotas de requêtes
- Implémentez un rate limiting côté client
- Mettez en cache autant que possible

## Support et Contact

### Support Technique RTE

- **Téléphone** : 0810 80 50 50
- **Email** : [rte-hotline@rte-france.com](mailto:rte-hotline@rte-france.com)
- **Documentation** : [data.rte-france.com](https://data.rte-france.com)

### En Cas d'Erreur

Conservez toujours le `transaction_id` fourni dans les réponses d'erreur pour faciliter le support.

## Roadmap

APIs RTE à documenter prochainement :

### 🟡 Priorité Moyenne
- [ ] **Actual Generation** : Production électrique en temps réel par filière
- [ ] **Consumption** : Données de consommation électrique nationale

### 🟢 Priorité Basse
- [ ] **Physical Flows** : Flux physiques d'électricité aux frontières
- [ ] **Day-ahead Generation Forecast** : Prévisions de production J+1
- [ ] **Unavailability of Production Units** : Indisponibilités des unités de production

## Intégration dans MyElectricalData

Les APIs RTE sont intégrées dans MyElectricalData pour enrichir les données Enedis avec :

### Dashboard
- Widget Tempo avec couleur du jour/demain
- Indicateur écowatt (tension du réseau)
- Alertes intelligentes

### Page Consommation
- Calcul des coûts selon Tempo
- Comparaison avec la production nationale
- Recommandations d'optimisation

### Page Prévisions
- Alertes avant jours rouges Tempo
- Prévisions de tension réseau écowatt
- Suggestions de report de consommation

## Configuration

Ajouter dans `.env.api` :

```bash
# RTE API Configuration
RTE_CLIENT_ID=your_client_id_here
RTE_CLIENT_SECRET=your_client_secret_here
RTE_BASE_URL=https://digital.iservices.rte-france.com

# Tempo Configuration
TEMPO_CACHE_TTL=3600

# écowatt Configuration
ECOWATT_CACHE_TTL=900
ECOWATT_ENABLE_NOTIFICATIONS=true
```

## Contribution

Pour ajouter de la documentation sur une nouvelle API RTE :

1. Créer un dossier `docs/rte-api/{api-name}/`
2. Créer `{api-name}-api.md` avec la documentation complète de l'API
3. Créer `{api-name}-integration-example.md` avec un exemple d'intégration
4. Créer un `README.md` spécifique à l'API
5. Mettre à jour ce README.md principal
6. Implémenter le client backend dans `apps/api/src/adapters/rte_{api_name}_client.py`
7. Ajouter les routes dans `apps/api/src/routers/{api_name}.py`
8. Créer les composants frontend nécessaires
9. Ajouter des tests dans `apps/api/tests/` et `apps/web/src/`

### Template de Documentation

Voir [tempo/](./tempo/) comme exemple de structure complète.

## Ressources Externes

- [Portail RTE Open Data](https://data.rte-france.com)
- [Catalogue des APIs RTE](https://data.rte-france.com/catalog)
- [Documentation générale RTE](https://www.rte-france.com)
- [Blog RTE Data](https://data.rte-france.com/blog)

## Licence

Les données RTE sont soumises aux conditions d'utilisation de RTE.

**Licence des données** : [Licence Open Data RTE](https://data.rte-france.com/catalog/-/api/doc/user-guide/Licences)

Les données sont généralement disponibles sous licence ouverte pour usage non commercial.
