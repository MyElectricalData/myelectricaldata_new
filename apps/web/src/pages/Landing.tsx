import { Link } from 'react-router-dom'
import { ArrowRight, Shield, Zap, Key, Moon, Sun, Heart } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useThemeStore } from '@/stores/themeStore'

export default function Landing() {
  const { isAuthenticated } = useAuth()
  const { isDark, toggleTheme } = useThemeStore()

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center space-x-3">
              <img src="/logo.svg" alt="MyElectricalData" className="h-10 w-10" />
              <span className="text-xl font-bold text-primary-600 dark:text-primary-400 hidden md:inline">
                MyElectricalData
              </span>
            </Link>

            <nav className="flex items-center space-x-2 sm:space-x-4">
              <a
                href="https://www.paypal.com/donate?token=YS8EyJdh1jxVY3jqnIQu_YUPEyqp6buLbtfT7aDF8iPI78NF8ajvCUrmXtE4KJjbVjrB5_RfWwtaG2gR"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 px-2 sm:px-3 py-2 rounded-md bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-900/30"
                title="Faire un don"
              >
                <Heart size={18} />
                <span className="hidden lg:inline">Donation</span>
              </a>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Toggle theme"
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              {!isAuthenticated && (
                <Link to="/login" className="btn btn-secondary text-sm sm:text-base px-3 sm:px-4">
                  <span className="hidden sm:inline">Se connecter</span>
                  <span className="sm:hidden">Connexion</span>
                </Link>
              )}
              {isAuthenticated && (
                <Link to="/dashboard" className="btn btn-primary text-sm sm:text-base px-3 sm:px-4">
                  Dashboard
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-800 py-12 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
              Accédez à vos données Linky
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-300 mb-6 sm:mb-8 max-w-3xl mx-auto">
              MyElectricalData est une passerelle qui permet à n'importe quel particulier d'accéder à ses données de consommation/production d'électricité disponibles chez Enedis.
            </p>
            {isAuthenticated ? (
              <div className="flex justify-center">
                <Link to="/dashboard" className="btn btn-primary text-base sm:text-lg px-6 sm:px-8 py-2.5 sm:py-3 inline-flex items-center">
                  Accéder au dashboard
                  <ArrowRight className="ml-2" size={20} />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
                <Link to="/signup" className="btn btn-primary text-base sm:text-lg px-6 sm:px-8 py-2.5 sm:py-3 inline-flex items-center justify-center">
                  Démarrer
                  <ArrowRight className="ml-2" size={20} />
                </Link>
                <Link to="/login" className="btn btn-secondary text-base sm:text-lg px-6 sm:px-8 py-2.5 sm:py-3">
                  Se connecter
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Pourquoi utiliser MyElectricalData */}
      <section className="bg-gray-100 dark:bg-gray-800 py-12 sm:py-20 border-y border-gray-300 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-8">Pourquoi utiliser MyElectricalData ?</h2>
          <div className="space-y-6 text-gray-600 dark:text-gray-400">
            <p>
              Depuis le renforcement du système d'authentification de la société Enedis (passage à l'OAuth2.0), il n'est plus possible pour les particuliers d'accéder à leurs données de façon automatique (via API).
            </p>
            <p>
              C'est pour cela que j'ai décidé de créer une passerelle qui va vous permettre de faire "passe-plat" entre vous et Enedis et qui prendra en charge toutes les différentes couches de sécurité.
            </p>
          </div>
        </div>
      </section>

      {/* Puis-je appeler directement Enedis */}
      <section className="py-12 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-8">Puis-je appeler directement Enedis ?</h2>
          <div className="space-y-6 text-gray-600 dark:text-gray-400">
            <p>
              <strong>Non</strong>, si vous êtes un particulier.
            </p>
            <p>
              <strong>Oui</strong>, si vous êtes une société, mais il vous faudra passer un contrat avec eux afin de créer une application (comme celle-ci) qui devra respecter leur cahier des charges.
            </p>
            <div className="card bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <p className="font-medium">
                Depuis le passage à l'OAuth2.0, il vous faut obligatoirement avoir une entité juridique afin de signer un contrat avec Enedis. Pour avoir une entité juridique, il faut obligatoirement être une société ou une association.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="bg-gray-100 dark:bg-gray-800 py-12 sm:py-20 border-y border-gray-300 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">Comment ça marche ?</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900 rounded-full mb-4">
                <Key className="text-primary-600 dark:text-primary-400" size={32} />
              </div>
              <h3 className="text-xl font-semibold mb-3">1. Création de compte</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Créez votre compte et obtenez vos identifiants API (client_id et client_secret).
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900 rounded-full mb-4">
                <Shield className="text-primary-600 dark:text-primary-400" size={32} />
              </div>
              <h3 className="text-xl font-semibold mb-3">2. Consentement Enedis</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Autorisez la passerelle à accéder à vos données via le portail officiel Enedis. Vos données restent sous votre contrôle.
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900 rounded-full mb-4">
                <Zap className="text-primary-600 dark:text-primary-400" size={32} />
              </div>
              <h3 className="text-xl font-semibold mb-3">3. Accès aux données</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Utilisez notre API pour récupérer vos consommations, productions et données contractuelles.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Données personnelles et cache */}
      <section className="py-12 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-8">Qu'en est-il de mes données personnelles ?</h2>
          <div className="space-y-6 text-gray-600 dark:text-gray-400">
            <p>
              Les API d'Enedis sont limitées en termes de nombre d'appels afin d'éviter de saturer leur service (5 appels max / seconde).
            </p>
            <p>
              Et afin d'éviter d'atteindre les limites d'Enedis, un cache local (chiffré) sur la passerelle a été mis en place afin de limiter le nombre d'appels. Libre à vous de l'utiliser ou non, mais il faut savoir que si vous ne l'utilisez pas, le nombre d'appels sera limité.
            </p>
          </div>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section className="bg-gray-100 dark:bg-gray-800 py-12 sm:py-20 border-y border-gray-300 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">Fonctionnalités</h2>
          <div className="grid sm:grid-cols-2 gap-6 sm:gap-8">
            <div className="card">
              <h3 className="text-xl font-semibold mb-3">🔒 Sécurité maximale</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Données chiffrées avec votre clé API personnelle. Impossible d'y accéder sans vos identifiants.
              </p>
            </div>
            <div className="card">
              <h3 className="text-xl font-semibold mb-3">⚡ Cache intelligent</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Système de cache pour respecter les quotas Enedis (5 requêtes/seconde) et améliorer les performances.
              </p>
            </div>
            <div className="card">
              <h3 className="text-xl font-semibold mb-3">📊 Données complètes</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Accédez à toutes vos données : consommation, production, puissance maximale, contrat, adresse, etc.
              </p>
            </div>
            <div className="card">
              <h3 className="text-xl font-semibold mb-3">🔄 Gestion OAuth2.0</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Prise en charge complète de l'authentification OAuth2.0 d'Enedis et gestion automatique des tokens.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* À propos */}
      <section className="py-12 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-8">Qui suis-je ?</h2>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
            Un simple particulier passionné par la domotique/informatique, qui aime aider la communauté et qui cherche juste à accéder à ses données de consommation chez Enedis.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-800 py-12 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Prêt à commencer ?</h2>
          <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400 mb-6 sm:mb-8">
            Créez votre compte gratuitement et obtenez vos identifiants API en quelques minutes.
          </p>
          {!isAuthenticated && (
            <Link to="/signup" className="btn btn-primary text-base sm:text-lg px-6 sm:px-8 py-2.5 sm:py-3 inline-flex items-center justify-center">
              Créer mon compte
              <ArrowRight className="ml-2" size={20} />
            </Link>
          )}
        </div>
      </section>
    </div>
  )
}
