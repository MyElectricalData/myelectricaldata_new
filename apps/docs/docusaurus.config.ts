import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

// Support GitHub Pages via environment variables
const isGitHubPages = process.env.DEPLOY_TARGET === 'github-pages';

const config: Config = {
  title: "MyElectricalData",
  tagline: "Accédez à vos données Linky en toute simplicité",
  favicon: "img/favicon.ico",

  future: {
    v4: true,
  },

  // URL et baseUrl configurables pour GitHub Pages ou domaine personnalisé
  url: isGitHubPages
    ? "https://myelectricaldata.github.io"
    : "https://docs.myelectricaldata.fr",
  baseUrl: isGitHubPages
    ? "/myelectricaldata_new/"
    : "/",

  organizationName: "MyElectricalData",
  projectName: "myelectricaldata_new",

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  markdown: {
    format: "detect",
  },

  i18n: {
    defaultLocale: "fr",
    locales: ["fr"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          path: "../../docs",
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/MyElectricalData/myelectricaldata_new/tree/main/docs/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/social-card.png",
    colorMode: {
      defaultMode: "light",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "MyElectricalData",
      logo: {
        alt: "MyElectricalData Logo",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "setupSidebar",
          position: "left",
          label: "Installation",
        },
        {
          type: "docSidebar",
          sidebarId: "featuresSidebar",
          position: "left",
          label: "Fonctionnalités",
        },
        {
          type: "docSidebar",
          sidebarId: "designSidebar",
          position: "left",
          label: "Design System",
        },
        {
          type: "docSidebar",
          sidebarId: "apiSidebar",
          position: "left",
          label: "API",
        },
        {
          href: "https://github.com/MyElectricalData/myelectricaldata_new",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Documentation",
          items: [
            {
              label: "Installation",
              to: "/setup/docker",
            },
            {
              label: "Design System",
              to: "/design",
            },
            {
              label: "API Enedis",
              to: "/enedis-api/endpoint",
            },
          ],
        },
        {
          title: "Ressources",
          items: [
            {
              label: "Fonctionnalités",
              to: "/features-spec/simulator",
            },
            {
              label: "Troubleshooting",
              to: "/troubleshooting",
            },
            {
              label: "FAQ",
              to: "/pages/faq",
            },
          ],
        },
        {
          title: "Liens",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/MyElectricalData/myelectricaldata_new",
            },
            {
              label: "API Enedis",
              href: "https://datahub-enedis.fr/",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} MyElectricalData. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json", "python", "typescript", "tsx"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
