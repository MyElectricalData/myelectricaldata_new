import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  noIndex?: boolean;
}

// TODO: Changer en https://www.myelectricaldata.fr pour la production
const BASE_URL = 'https://www.v2.myelectricaldata.fr';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;
const SITE_NAME = 'MyElectricalData';

/**
 * SEO Component for dynamic meta tags per page
 *
 * @example
 * <SEO
 *   title="Consommation kWh"
 *   description="Visualisez votre consommation électrique en kWh"
 * />
 */
export function SEO({
  title,
  description = "Accédez à vos données de consommation Linky via les APIs professionnelles Enedis. Visualisez votre consommation électrique, comparez les offres et optimisez vos dépenses énergétiques.",
  keywords = "Linky, Enedis, consommation électrique, API, données énergie, compteur intelligent",
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  noIndex = false,
}: SEOProps) {
  const fullTitle = title
    ? `${title} | ${SITE_NAME}`
    : `${SITE_NAME} - Passerelle API Enedis pour vos données Linky`;

  const fullUrl = url ? `${BASE_URL}${url}` : BASE_URL;
  const fullImage = image.startsWith('http') ? image : `${BASE_URL}${image}`;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      <link rel="canonical" href={fullUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImage} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={fullUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImage} />
    </Helmet>
  );
}

/**
 * SEO configuration for each route
 * Used by pages to get consistent SEO metadata
 */
export const SEO_CONFIG: Record<string, SEOProps> = {
  '/': {
    description: "Passerelle API sécurisée pour accéder à vos données de consommation Linky via les APIs professionnelles Enedis. Gratuit et open-source.",
    keywords: "Linky, Enedis, API, consommation électrique, données énergie, compteur intelligent, open-source",
  },
  '/dashboard': {
    title: "Tableau de bord",
    description: "Gérez vos points de livraison (PDL) et accédez à vos données de consommation Linky.",
    noIndex: true,
  },
  '/consumption_kwh': {
    title: "Consommation en kWh",
    description: "Visualisez votre consommation électrique en kWh. Graphiques détaillés par jour, mois et année avec analyse Heures Creuses / Heures Pleines.",
    keywords: "consommation kWh, Linky, graphique électricité, heures creuses, heures pleines",
    noIndex: true,
  },
  '/consumption_euro': {
    title: "Consommation en Euros",
    description: "Suivez le coût de votre consommation électrique en euros. Simulation de facture et comparaison avec différents tarifs.",
    keywords: "coût électricité, facture EDF, prix kWh, tarif électricité, simulation facture",
    noIndex: true,
  },
  '/production': {
    title: "Production solaire",
    description: "Suivez votre production d'énergie solaire et l'injection sur le réseau Enedis.",
    keywords: "production solaire, panneaux photovoltaïques, injection réseau, autoconsommation",
    noIndex: true,
  },
  '/simulator': {
    title: "Comparateur d'offres",
    description: "Comparez automatiquement toutes les offres d'électricité disponibles selon votre consommation réelle. Trouvez le meilleur tarif.",
    keywords: "comparateur électricité, offres EDF, tarif Engie, changement fournisseur, meilleur prix kWh",
    noIndex: true,
  },
  '/faq': {
    title: "FAQ Enedis",
    description: "Questions fréquentes sur l'accès aux données Linky, le consentement Enedis et l'utilisation de l'API MyElectricalData.",
    keywords: "FAQ Linky, consentement Enedis, données compteur, questions API",
  },
  '/api-docs': {
    title: "Documentation API",
    description: "Documentation complète de l'API REST MyElectricalData pour l'intégration domotique et le développement d'applications.",
    keywords: "API REST, documentation, intégration domotique, Home Assistant, développeur",
  },
  '/login': {
    title: "Connexion",
    description: "Connectez-vous à votre compte MyElectricalData pour accéder à vos données de consommation Linky.",
  },
  '/signup': {
    title: "Créer un compte",
    description: "Créez votre compte gratuit MyElectricalData et commencez à suivre votre consommation électrique Linky.",
  },
  '/settings': {
    title: "Paramètres",
    description: "Gérez les paramètres de votre compte et vos clés API.",
    noIndex: true,
  },
};

export default SEO;
