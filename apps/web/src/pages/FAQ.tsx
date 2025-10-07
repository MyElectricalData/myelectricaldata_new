import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

interface FAQItem {
  question: string
  answer: string
  code?: string
}

export default function FAQ() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  const faqItems: FAQItem[] = [
    {
      question: "Erreur ADAM_ERROR - Erreur technique",
      code: "ADAM_ERROR",
      answer: "Cette erreur indique un problème technique côté Enedis. Il s'agit généralement d'une erreur temporaire. Veuillez réessayer dans quelques instants. Si l'erreur persiste après plusieurs tentatives, contactez le support Enedis."
    },
    {
      question: "Erreur ADAM_INTERNE - Erreur interne",
      code: "ADAM_INTERNE",
      answer: "Erreur interne du système Enedis. Cette erreur est généralement temporaire et liée à une maintenance ou une surcharge des serveurs. Attendez quelques minutes avant de réessayer votre requête."
    },
    {
      question: "Erreur UNPROCESSABLE_ENTITY - Données non traitables",
      code: "UNPROCESSABLE_ENTITY",
      answer: "Les données envoyées ne peuvent pas être traitées par Enedis. Vérifiez que votre PDL est correct (14 chiffres), que les dates sont au bon format (YYYY-MM-DD), et que la période demandée est valide (pas trop ancienne, pas dans le futur)."
    },
    {
      question: "Erreur NOT_FOUND - PDL non trouvé",
      code: "NOT_FOUND",
      answer: "Le Point de Livraison (PDL) n'a pas été trouvé dans la base Enedis. Vérifiez que vous avez bien saisi les 14 chiffres de votre PDL. Vous pouvez le trouver sur votre facture d'électricité ou votre espace client."
    },
    {
      question: "Erreur ADAM_CONSENT_MISSING - Consentement manquant",
      code: "ADAM_CONSENT_MISSING",
      answer: "Vous n'avez pas donné votre consentement pour accéder à vos données. Vous devez d'abord autoriser l'accès via le portail Enedis : connectez-vous sur le site Enedis, allez dans 'Mes données' puis 'Gérer mes autorisations' et autorisez MyElectricalData."
    },
    {
      question: "Erreur ADAM_CONSENT_EXPIRED - Consentement expiré",
      code: "ADAM_CONSENT_EXPIRED",
      answer: "Votre consentement a expiré. Les autorisations Enedis ont une durée de validité limitée (généralement 3 ans). Vous devez renouveler votre autorisation sur le portail Enedis."
    },
    {
      question: "Erreur ADAM_CONSENT_REVOKED - Consentement révoqué",
      code: "ADAM_CONSENT_REVOKED",
      answer: "Vous avez révoqué votre consentement pour accéder à vos données. Si c'était une erreur, vous devez à nouveau autoriser l'accès via le portail Enedis."
    },
    {
      question: "Erreur ADAM_PDL_NOT_ACTIVATED - PDL non activé",
      code: "ADAM_PDL_NOT_ACTIVATED",
      answer: "Ce Point de Livraison n'est pas encore activé ou a été désactivé. Cela peut arriver lors d'un déménagement, d'une construction neuve ou d'une résiliation de contrat. Contactez votre fournisseur d'électricité pour vérifier l'état de votre compteur."
    },
    {
      question: "Erreur ADAM_NO_DATA_AVAILABLE - Aucune donnée disponible",
      code: "ADAM_NO_DATA_AVAILABLE",
      answer: "Aucune donnée n'est disponible pour la période demandée. Cela peut signifier que votre compteur Linky n'était pas encore installé à cette date, ou que les données n'ont pas encore été collectées. Les données sont généralement disponibles avec 1 à 2 jours de retard."
    },
    {
      question: "Erreur INVALID_DATE_RANGE - Période invalide",
      code: "INVALID_DATE_RANGE",
      answer: "La période demandée est invalide. Vérifiez que la date de début est avant la date de fin, que vous ne demandez pas des données trop anciennes (limite généralement à 3 ans) ou futures, et que le format des dates est correct (YYYY-MM-DD)."
    },
    {
      question: "Erreur TOO_MANY_REQUESTS - Trop de requêtes",
      code: "TOO_MANY_REQUESTS",
      answer: "Vous avez effectué trop de requêtes dans un court laps de temps. Les API Enedis ont des limites de débit pour éviter les abus. Attendez quelques minutes avant de réessayer. MyElectricalData implémente automatiquement un système de cache pour limiter les appels."
    },
    {
      question: "Erreur SERVICE_UNAVAILABLE - Service indisponible",
      code: "SERVICE_UNAVAILABLE",
      answer: "Le service Enedis est temporairement indisponible. Cela peut être dû à une maintenance planifiée ou à un problème technique. Consultez le site Enedis pour vérifier l'état des services et réessayez plus tard."
    },
    {
      question: "Erreur GATEWAY_TIMEOUT - Délai d'attente dépassé",
      code: "GATEWAY_TIMEOUT",
      answer: "Le serveur Enedis met trop de temps à répondre. Cela arrive souvent lors de pics de charge. Réessayez dans quelques instants. Si le problème persiste, le service Enedis peut être en difficulté."
    },
    {
      question: "Erreur UNAUTHORIZED - Non autorisé",
      code: "UNAUTHORIZED",
      answer: "L'authentification avec Enedis a échoué. Vérifiez vos identifiants Enedis et assurez-vous que votre compte est actif. Vous devrez peut-être vous reconnecter à votre espace MyElectricalData."
    },
    {
      question: "Erreur FORBIDDEN - Accès interdit",
      code: "FORBIDDEN",
      answer: "Vous n'avez pas les droits d'accès nécessaires pour cette ressource. Assurez-vous d'avoir bien autorisé tous les types de données (consommation, production, etc.) dans vos consentements Enedis."
    },
    {
      question: "Pourquoi mes données ont-elles 1-2 jours de retard ?",
      answer: "C'est normal ! Enedis collecte les données de votre compteur Linky une fois par jour, généralement la nuit. Les données sont ensuite traitées et mises à disposition avec un délai d'environ 24 à 48 heures. Ce n'est pas un problème de MyElectricalData, mais le fonctionnement normal du système Enedis."
    },
    {
      question: "Comment renouveler mon consentement Enedis ?",
      answer: "1. Connectez-vous sur votre espace client Enedis (mon-compte-particulier.enedis.fr)\n2. Allez dans 'Mes données' puis 'Gérer mes autorisations'\n3. Recherchez 'MyElectricalData' dans la liste des applications autorisées\n4. Cliquez sur 'Renouveler' ou 'Autoriser' si l'application n'apparaît plus\n5. Validez pour les 3 prochaines années"
    },
    {
      question: "Où trouver mon numéro PDL ?",
      answer: "Votre numéro PDL (Point De Livraison) est un identifiant à 14 chiffres que vous pouvez trouver :\n- Sur vos factures d'électricité (généralement en haut)\n- Sur votre espace client fournisseur d'électricité\n- Sur votre compteur Linky directement (en appuyant sur le bouton +)\n- En contactant votre fournisseur d'électricité"
    },
    {
      question: "Pourquoi je n'ai pas de données pour certains jours ?",
      answer: "Plusieurs raisons possibles :\n- Coupure électrique : pas de données collectées ce jour-là\n- Problème de communication du compteur : le Linky n'a pas pu transmettre les données\n- Maintenance Enedis : les données n'ont pas été traitées\n- Compteur récemment installé : délai initial avant la première collecte\n\nSi le problème persiste plusieurs jours, contactez Enedis."
    },
    {
      question: "Les données sont-elles en temps réel ?",
      answer: "Non, les données ne sont jamais en temps réel. Les compteurs Linky transmettent leurs données une fois par jour à Enedis, qui les traite et les met à disposition 24-48h plus tard. Pour un suivi en temps réel, vous devriez consulter directement votre compteur Linky ou utiliser un dispositif de monitoring local."
    },
    {
      question: "Comment révoquer l'accès de MyElectricalData ?",
      answer: "Pour révoquer l'accès :\n1. Allez dans votre espace client Enedis\n2. Section 'Mes données' > 'Gérer mes autorisations'\n3. Trouvez 'MyElectricalData' dans la liste\n4. Cliquez sur 'Révoquer l'autorisation'\n5. Confirmez\n\nVous pouvez également supprimer votre compte directement dans les paramètres de MyElectricalData."
    }
  ]

  const toggleItem = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index)
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <AlertCircle className="text-primary-600 dark:text-primary-400" size={32} />
          FAQ - Questions fréquentes Enedis
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Retrouvez ici les réponses aux questions les plus fréquentes et les solutions aux erreurs courantes de l'API Enedis.
        </p>
      </div>

      <div className="card">
        <div className="space-y-2">
          {faqItems.map((item, index) => (
            <div
              key={index}
              className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => toggleItem(index)}
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
              >
                <div className="flex-shrink-0 mt-1">
                  {expandedIndex === index ? (
                    <ChevronDown size={20} className="text-primary-600 dark:text-primary-400" />
                  ) : (
                    <ChevronRight size={20} className="text-gray-400" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {item.question}
                  </h3>
                  {item.code && (
                    <span className="inline-block mt-1 px-2 py-0.5 text-xs font-mono bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded">
                      {item.code}
                    </span>
                  )}
                </div>
              </button>

              {expandedIndex === index && (
                <div className="px-4 pb-4 pl-11">
                  <div className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                    {item.answer}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 card bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <h2 className="text-lg font-semibold mb-3 text-blue-900 dark:text-blue-100">
          Besoin d'aide supplémentaire ?
        </h2>
        <p className="text-blue-800 dark:text-blue-200 mb-4">
          Si votre problème persiste ou si vous ne trouvez pas de réponse à votre question, voici quelques ressources :
        </p>
        <ul className="space-y-2 text-blue-800 dark:text-blue-200">
          <li className="flex items-start gap-2">
            <span className="font-semibold">•</span>
            <span>
              <strong>Documentation API Enedis :</strong>{' '}
              <a
                href="https://datahub-enedis.fr/data-connect/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-blue-600 dark:hover:text-blue-300"
              >
                datahub-enedis.fr/data-connect
              </a>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-semibold">•</span>
            <span>
              <strong>Support Enedis :</strong> 09 72 67 50 XX (XX = numéro de votre département)
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-semibold">•</span>
            <span>
              <strong>État des services Enedis :</strong> Consultez la page de statut Enedis pour vérifier si une maintenance est en cours
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
