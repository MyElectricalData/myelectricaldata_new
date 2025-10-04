# Endpoints Enedis

## Vue generale

Toutes les integrations avec Enedis sont disponibles via deux environnements :

- Sandbox : `https://gw.ext.prod-sandbox.api.enedis.fr`
- Production : `https://gw.ext.prod.api.enedis.fr`

Le parcours OAuth (autorisation + recuperation du token) est documente dans `docs/features-spec/01-gateway.md` et detaille dans les fichiers OpenAPI du dossier `docs/enedis-api/openapi`.

## Catalogue des endpoints

| Reference                    | Description                                                     | Sandbox                                                           | Production                                                | Specification                                                  |
| ---------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| Authorize                    | Demande de consentement OAuth2 (redirige depuis le front).      | N/A (production uniquement)                                       | <https://mon-compte-particulier.enedis.fr>                | `docs/enedis-api/openapi/01-authorize.json`                    |
| Token                        | Echange du code OAuth2 contre un token.                         | `https://gw.ext.prod-sandbox.api.enedis.fr/oauth2/v3/token`       | `https://gw.ext.prod.api.enedis.fr/oauth2/v3/token`       | `docs/enedis-api/openapi/02-token.json`                        |
| Metering Consommation Daily  | Donnees de consommation quotidienne (kWh).                      | `https://gw.ext.prod-sandbox.api.enedis.fr/metering_data_dc/v5`   | `https://gw.ext.prod.api.enedis.fr/metering_data_dc/v5`   | `docs/enedis-api/openapi/03-metering-consommation-daily.json`  |
| Metering Consommation Detail | Donnees de consommation detaillees (pas horaire).               | `https://gw.ext.prod-sandbox.api.enedis.fr/metering_data_clc/v5`  | `https://gw.ext.prod.api.enedis.fr/metering_data_clc/v5`  | `docs/enedis-api/openapi/04-metering-consommation-detail.json` |
| Metering Power               | Puissance apparente maximale.                                   | `https://gw.ext.prod-sandbox.api.enedis.fr/metering_data_dcmp/v5` | `https://gw.ext.prod.api.enedis.fr/metering_data_dcmp/v5` | `docs/enedis-api/openapi/05-metering-power.json`               |
| Metering Production Daily    | Donnees de production quotidienne.                              | `https://gw.ext.prod-sandbox.api.enedis.fr/metering_data_dp/v5`   | `https://gw.ext.prod.api.enedis.fr/metering_data_dp/v5`   | `docs/enedis-api/openapi/06-metering-production-daily.json`    |
| Metering Production Detail   | Donnees de production detaillees.                               | `https://gw.ext.prod-sandbox.api.enedis.fr/metering_data_plc/v5`  | `https://gw.ext.prod.api.enedis.fr/metering_data_plc/v5`  | `docs/enedis-api/openapi/07-metering-production-detail.json`   |
| Contract                     | Informations contractuelles (offre, puissance souscrite, etc.). | `https://gw.ext.prod-sandbox.api.enedis.fr/customers_upc/v5`      | `https://gw.ext.prod.api.enedis.fr/customers_upc/v5`      | `docs/enedis-api/openapi/08-contract.json`                     |
| Address                      | Adresse du point de livraison.                                  | `https://gw.ext.prod-sandbox.api.enedis.fr/customers_upa/v5`      | `https://gw.ext.prod.api.enedis.fr/customers_upa/v5`      | `docs/enedis-api/openapi/09-address.json`                      |
| Customer                     | Informations titulaires (identite, contacts).                   | `https://gw.ext.prod-sandbox.api.enedis.fr/customers_i/v5`        | `https://gw.ext.prod.api.enedis.fr/customers_i/v5`        | `docs/enedis-api/openapi/10-customer.json`                     |
| Contact                      | Coordonnees de contact client.                                  | `https://gw.ext.prod-sandbox.api.enedis.fr/customers_cd/v5`       | `https://gw.ext.prod.api.enedis.fr/customers_cd/v5`       | `docs/enedis-api/openapi/11-contact.json`                      |

## Bonnes pratiques

- Chaque endpoint doit etre invoque via la passerelle interne (voir `docs/features-spec/05-gateway.md`).
- Respecter les quotas Enedis (5 requetes/seconde) et exploiter le cache detaille dans `docs/features-spec/10-cache.md`.
- Utiliser les schemas d'erreurs `docs/features-spec/rules/enedis-api-error.md` pour homogeeniser les retours.
- Controler les scopes OAuth requis par endpoint (voir les fichiers OpenAPI).
