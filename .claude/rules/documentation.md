# Documentation du projet

**Toute la documentation du projet se trouve dans le dossier `docs/` au format Docusaurus.**

## Format Docusaurus

La documentation utilise [Docusaurus](https://docusaurus.io/), un generateur de sites de documentation.

- **Fichiers Markdown** : `.md` ou `.mdx`
- **Frontmatter YAML** : Metadonnees en debut de fichier (title, sidebar_position, etc.)
- **Application Docusaurus** : `apps/docs/` (configuration, sidebars)

## Structure de la documentation

| Dossier                 | Contenu                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `docs/local-client/`    | Documentation du mode client (installation, exports, integrations) |
| `docs/server-mode/`     | Documentation du mode serveur (admin, architecture, features)      |
| `docs/specs/`           | Specifications techniques (pages UI, design system)                |
| `docs/external-apis/`   | Documentation des APIs externes (Enedis, RTE)                      |
| `docs/troubleshooting/` | Guides de depannage                                                |

## Regle obligatoire

**Avant de repondre a une question sur le fonctionnement du projet, consulter la documentation dans `docs/`.**

**Pour toute modification, mettre a jour la documentation correspondante.**

## Documentation par mode

- **Mode Client** : `docs/local-client/`
- **Mode Serveur** : `docs/server-mode/`

## Documentation technique

- **Pages UI** : `docs/specs/pages/`
- **Design System** : `docs/specs/design/`
- **API Enedis** : `docs/external-apis/enedis-api/`
- **API RTE** : `docs/external-apis/rte-api/`
