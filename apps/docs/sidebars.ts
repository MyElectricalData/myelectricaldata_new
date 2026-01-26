import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  // Sidebar Client Local (Domotique)
  localClientSidebar: [
    {
      type: "doc",
      id: "local-client/index",
      label: "Introduction",
    },
    {
      type: "category",
      label: "Installation",
      collapsed: false,
      items: [
        "local-client/installation/index",
        "local-client/installation/docker",
        "local-client/installation/helm",
      ],
    },
    {
      type: "doc",
      id: "local-client/configuration",
      label: "Configuration",
    },
    {
      type: "doc",
      id: "local-client/interface",
      label: "Interface Web",
    },
    {
      type: "doc",
      id: "local-client/exporters",
      label: "Exporteurs",
    },
    {
      type: "doc",
      id: "local-client/architecture",
      label: "Architecture",
    },
    {
      type: "category",
      label: "Intégrations",
      collapsed: false,
      items: [
        "local-client/integrations/index",
        "local-client/integrations/home-assistant",
        "local-client/integrations/mqtt",
        "local-client/integrations/victoriametrics",
        "local-client/integrations/autres",
      ],
    },
  ],

  // Sidebar Mode Serveur (Gateway)
  serverModeSidebar: [
    {
      type: "doc",
      id: "server-mode/index",
      label: "Introduction",
    },
    {
      type: "doc",
      id: "server-mode/architecture",
      label: "Architecture",
    },
    {
      type: "doc",
      id: "server-mode/authentication",
      label: "Authentification OAuth2",
    },
    {
      type: "doc",
      id: "server-mode/encryption",
      label: "Chiffrement des données",
    },
    {
      type: "doc",
      id: "server-mode/data-flow",
      label: "Flux de données",
    },
    {
      type: "category",
      label: "Installation",
      collapsed: false,
      items: [
        "server-mode/installation/index",
        "server-mode/installation/docker",
        "server-mode/installation/helm",
      ],
    },
    {
      type: "category",
      label: "Administration",
      collapsed: false,
      items: [
        "server-mode/administration/users",
        "server-mode/administration/offers",
        "server-mode/administration/logs",
        "server-mode/administration/database",
        "server-mode/administration/slack",
      ],
    },
    {
      type: "category",
      label: "Fonctionnalités",
      collapsed: false,
      items: [
        "server-mode/features/frontend",
        "server-mode/features/account",
        "server-mode/features/gateway",
        "server-mode/features/cache",
        "server-mode/features/database",
        "server-mode/features/simulator",
        "server-mode/features/price-comparison",
        "server-mode/features/energy-providers-scrapers",
        "server-mode/features/slack-notifications",
      ],
    },
    {
      type: "category",
      label: "Offres & Scrapers",
      collapsed: false,
      items: [
        "server-mode/offers/README",
        "server-mode/offers/alpiq",
        "server-mode/offers/alterna",
        "server-mode/offers/edf",
        "server-mode/offers/ekwateur",
        "server-mode/offers/enercoop",
        "server-mode/offers/engie",
        "server-mode/offers/mint",
        "server-mode/offers/octopus",
        "server-mode/offers/primeo",
        "server-mode/offers/totalenergies",
        "server-mode/offers/ufc",
        "server-mode/offers/vattenfall",
      ],
    },
    {
      type: "category",
      label: "Compte de Démonstration",
      collapsed: false,
      items: [
        "server-mode/demo/README",
        "server-mode/demo/architecture",
        "server-mode/demo/implementation",
      ],
    },
  ],

  // Sidebar Pages (Guide pour Claude)
  pagesSidebar: [
    "specs/pages/root",
    "specs/pages/signup",
    "specs/pages/dashboard",
    {
      type: "category",
      label: "Consommation",
      collapsed: false,
      items: [
        "specs/pages/consumption/consumption-kwh",
        "specs/pages/consumption/consumption-euro",
      ],
    },
    "specs/pages/production",
    "specs/pages/bilan",
    "specs/pages/simulator",
    {
      type: "category",
      label: "Contribuer",
      collapsed: false,
      items: [
        "specs/pages/contributes/offers",
        "specs/pages/contributes/new-offers",
        "specs/pages/contributes/my-offers",
      ],
    },
    "specs/pages/tempo",
    "specs/pages/ecowatt",
    "specs/pages/france",
    {
      type: "category",
      label: "Administration",
      collapsed: false,
      items: [
        "specs/pages/admin/dashboard",
        "specs/pages/admin/users",
        "specs/pages/admin/rte",
        "specs/pages/admin/tempo",
        "specs/pages/admin/ecowatt",
        "specs/pages/admin/contributions",
        "specs/pages/admin/offers",
        "specs/pages/admin/roles",
        "specs/pages/admin/logs",
      ],
    },
    "specs/pages/settings",
    "specs/pages/api-docs",
    "specs/pages/faq",
  ],

  // Sidebar Design System
  designSidebar: [
    {
      type: "doc",
      id: "specs/design/README",
      label: "Introduction",
    },
    {
      type: "doc",
      id: "specs/design/checklist",
      label: "Checklist",
    },
    {
      type: "doc",
      id: "specs/design/examples",
      label: "Exemples",
    },
    {
      type: "category",
      label: "Composants",
      collapsed: false,
      items: [
        "specs/design/components/README",
        "specs/design/components/container",
        "specs/design/components/header",
        "specs/design/components/sections",
        "specs/design/components/colors",
        "specs/design/components/typography",
        "specs/design/components/spacing",
        "specs/design/components/buttons",
        "specs/design/components/cards",
        "specs/design/components/forms",
        "specs/design/components/icons",
        "specs/design/components/states",
        "specs/design/components/filters",
        "specs/design/components/loading",
        "specs/design/components/dark-mode",
        "specs/design/components/responsive",
      ],
    },
  ],

  // Sidebar APIs Externes
  externalApisSidebar: [
    {
      type: "doc",
      id: "external-apis/index",
      label: "Introduction",
    },
    {
      type: "category",
      label: "API Enedis DataHub",
      collapsed: false,
      items: [
        "external-apis/enedis-api/endpoint",
        "external-apis/enedis-api/data-catalogues",
        "external-apis/enedis-api/enedis-api-error",
      ],
    },
    {
      type: "category",
      label: "API RTE",
      collapsed: false,
      items: [
        "external-apis/rte-api/README",
        {
          type: "category",
          label: "TEMPO",
          items: [
            "external-apis/rte-api/tempo/README",
            "external-apis/rte-api/tempo/tempo-api",
            "external-apis/rte-api/tempo/tempo-integration-example",
          ],
        },
        {
          type: "category",
          label: "EcoWatt",
          items: [
            "external-apis/rte-api/ecowatt/README",
            "external-apis/rte-api/ecowatt/ecowatt-api",
            "external-apis/rte-api/ecowatt/ecowatt-integration-example",
          ],
        },
        {
          type: "doc",
          id: "external-apis/rte-api/consumption/README",
          label: "Consumption",
        },
        {
          type: "doc",
          id: "external-apis/rte-api/generation-forecast/README",
          label: "Generation Forecast",
        },
      ],
    },
  ],
};

export default sidebars;
