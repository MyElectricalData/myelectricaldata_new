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
      type: "doc",
      id: "local-client/installation",
      label: "Installation",
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
        "local-client/integrations/jeedom",
        "local-client/integrations/autres",
      ],
    },
  ],

  // Sidebar Installation
  setupSidebar: [
    {
      type: "category",
      label: "Installation",
      collapsed: false,
      items: [
        "setup/docker",
        "setup/database",
        "setup/authentication",
        "setup/admin",
        "setup/dev-mode",
      ],
    },
    {
      type: "category",
      label: "Compte démo",
      items: ["demo/README", "demo/architecture", "demo/implementation"],
    },
    {
      type: "category",
      label: "Troubleshooting",
      items: [
        "troubleshooting/README",
        "troubleshooting/debug-cache-vide",
        "troubleshooting/comment-detecter-doublons",
        "troubleshooting/simulator-duplicates-fix",
        "troubleshooting/simulator-consumption-calculation",
        "troubleshooting/react-query-persist-readonly-queries",
      ],
    },
  ],

  // Sidebar Fonctionnalités
  featuresSidebar: [
    {
      type: "category",
      label: "Spécifications",
      collapsed: false,
      items: [
        "features-spec/simulator",
        "features-spec/energy-providers-scrapers",
        "features-spec/gateway",
        "features-spec/account",
        "features-spec/cache",
        "features-spec/database",
        "features-spec/front",
        "features-spec/price-comparison",
      ],
    },
    {
      type: "category",
      label: "Pages de l'application",
      collapsed: false,
      items: [
        {
          type: "category",
          label: "Tableau de bord",
          items: ["pages/dashboard", "pages/root-v2"],
        },
        {
          type: "category",
          label: "Données énergie",
          items: [
            "pages/consumption",
            "pages/production",
            "pages/simulator",
            "pages/tempo",
            "pages/ecowatt",
          ],
        },
        {
          type: "category",
          label: "Administration",
          items: [
            "pages/admin",
            "pages/admin-users",
            "pages/admin-offers",
            "pages/admin-offers-guide",
            "pages/admin-add-pdl",
            "pages/admin-tempo",
            "pages/admin-ecowatt",
            "pages/admin-contributions",
            "pages/admin-roles",
            "pages/admin-logs",
          ],
        },
        {
          type: "category",
          label: "Autres pages",
          items: [
            "pages/settings",
            "pages/signup",
            "pages/api-docs",
            "pages/faq",
            "pages/contribute",
          ],
        },
      ],
    },
    {
      type: "category",
      label: "Fournisseurs d'énergie",
      items: [
        "fournisseurs/README",
        "fournisseurs/edf",
        "fournisseurs/enercoop",
        "fournisseurs/totalenergies",
      ],
    },
  ],

  // Sidebar Design System
  designSidebar: [
    {
      type: "doc",
      id: "design/README",
      label: "Introduction",
    },
    {
      type: "doc",
      id: "design/checklist",
      label: "Checklist",
    },
    {
      type: "doc",
      id: "design/examples",
      label: "Exemples",
    },
    {
      type: "category",
      label: "Composants",
      collapsed: false,
      items: [
        "design/components/README",
        "design/components/container",
        "design/components/header",
        "design/components/sections",
        "design/components/colors",
        "design/components/typography",
        "design/components/spacing",
        "design/components/buttons",
        "design/components/cards",
        "design/components/forms",
        "design/components/icons",
        "design/components/states",
        "design/components/filters",
        "design/components/loading",
        "design/components/dark-mode",
        "design/components/responsive",
      ],
    },
  ],

  // Sidebar API
  apiSidebar: [
    {
      type: "category",
      label: "API Enedis",
      collapsed: false,
      items: [
        "enedis-api/endpoint",
        "enedis-api/data-catalogues",
        "enedis-api/enedis-api-error",
      ],
    },
    {
      type: "category",
      label: "API RTE",
      collapsed: false,
      items: [
        "rte-api/README",
        {
          type: "category",
          label: "TEMPO",
          items: [
            "rte-api/tempo/README",
            "rte-api/tempo/tempo-api",
            "rte-api/tempo/tempo-integration-example",
          ],
        },
        {
          type: "category",
          label: "Ecowatt",
          items: [
            "rte-api/ecowatt/README",
            "rte-api/ecowatt/ecowatt-api",
            "rte-api/ecowatt/ecowatt-integration-example",
          ],
        },
      ],
    },
    {
      type: "category",
      label: "Architecture",
      items: ["architecture/summary", "architecture/encryption"],
    },
  ],
};

export default sidebars;
