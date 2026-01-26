# Documentation RTE APIs

Ce dossier contient la documentation des APIs RTE (Réseau de Transport d'Électricité) utilisées dans MyElectricalData.

## APIs Disponibles

### RTE Tempo

L'API **Tempo Like Supply Contract** permet d'accéder aux informations sur les couleurs des jours Tempo, un système de tarification dynamique de l'électricité en France.

**Documentation complète**: [tempo-api.md](./tempo-api.md)

**Exemple d'intégration**: [tempo-integration-example.md](./tempo-integration-example.md)

#### Qu'est-ce que Tempo?

Tempo est une offre tarifaire d'électricité qui distingue trois types de jours selon la tension sur le réseau électrique :

- **Jours Bleus** (~300 jours/an) : Tarif le plus avantageux
- **Jours Blancs** (~43 jours/an) : Tarif intermédiaire
- **Jours Rouges** (~22 jours/an) : Tarif le plus élevé, principalement en hiver

#### Fonctionnalités

- ✅ Récupération de la couleur du jour actuel
- ✅ Récupération de la couleur de demain (après 10h40)
- ✅ Accès au calendrier historique (depuis septembre 2014)
- ✅ Prévisions J+1 et J+2
- ✅ Données avec timestamps de mise à jour

#### Liens Utiles

- [Documentation officielle RTE](https://data.rte-france.com/catalog/-/api/doc/user-guide/Tempo+Like+Supply+Contract/1.1)
- [Portail développeur RTE](https://data.rte-france.com)
- [Page Tempo RTE](https://www.rte-france.com/eco2mix/les-offres-tempo)

## Prérequis

Pour utiliser les APIs RTE, vous devez :

1. **Créer un compte** sur [data.rte-france.com](https://data.rte-france.com)
2. **Souscrire aux APIs** souhaitées depuis le catalogue
3. **Récupérer vos identifiants OAuth 2.0** (client_id, client_secret)

## Structure de la Documentation

```
docs/rte-api/tempo/
├── README.md                          # Ce fichier
├── tempo-api.md                       # Documentation complète API Tempo
└── tempo-integration-example.md       # Exemple d'intégration dans MyElectricalData
```

## Authentification

Toutes les APIs RTE utilisent **OAuth 2.0 Client Credentials** :

```bash
# Obtenir un token
curl -X POST "https://digital.iservices.rte-france.com/token/oauth/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"

# Utiliser le token
curl -X GET "https://digital.iservices.rte-france.com/open_api/..." \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

Les tokens ont une durée de vie de **7200 secondes (2 heures)**.

## Limites Générales

| Limite | Valeur |
|--------|--------|
| Taille maximale de réponse | 7 MB |
| Longueur maximale URI | 2048 caractères |
| Format de date | ISO 8601 avec timezone française |

## Support

Pour toute question ou problème concernant les APIs RTE :

- **Téléphone** : 0810 80 50 50
- **Email** : rte-hotline@rte-france.com
- **Documentation** : [data.rte-france.com](https://data.rte-france.com)

## Intégration dans MyElectricalData

Les données RTE sont intégrées dans MyElectricalData pour :

- **Dashboard** : Affichage de la couleur Tempo du jour
- **Consommation** : Calcul des coûts selon les périodes Tempo
- **Prévisions** : Alertes avant les jours rouges
- **Statistiques** : Analyse de la répartition de consommation par couleur

Voir [tempo-integration-example.md](./tempo-integration-example.md) pour les détails d'implémentation.

## Roadmap

APIs RTE à documenter prochainement :

- [ ] **écowatt** : Signaux de tension sur le réseau électrique
- [ ] **Actual Generation** : Production électrique en temps réel
- [ ] **Physical Flows** : Flux physiques d'électricité
- [ ] **Day-ahead Generation Forecast** : Prévisions de production J+1

## Contribution

Pour ajouter de la documentation sur une nouvelle API RTE :

1. Créer un fichier `{api-name}-api.md` avec la documentation complète
2. Créer un fichier `{api-name}-integration-example.md` avec un exemple d'intégration
3. Mettre à jour ce README.md
4. Ajouter des tests dans `apps/api/tests/`

## Licence

Les données RTE sont soumises aux conditions d'utilisation de RTE.
Voir [https://data.rte-france.com](https://data.rte-france.com) pour plus d'informations.
