import { Link, useLocation } from 'react-router-dom'
import { Home, Settings, LogOut, Moon, Sun, Heart, Shield, BookOpen, Calculator, Users, Menu, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useThemeStore } from '@/stores/themeStore'
import { useState } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { isDark, toggleTheme } = useThemeStore()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-3 flex-shrink-0 mr-8">
              <img src="/logo.svg" alt="MyElectricalData" className="h-10 w-10" />
              <span className="text-xl font-bold text-primary-600 dark:text-primary-400 hidden sm:inline">
                MyElectricalData
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center flex-1 justify-between">
              {/* Left: Main Actions */}
              <div className="flex items-center space-x-1 relative">
                <Link
                  to="/dashboard"
                  className={`relative group p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    location.pathname === '/dashboard' ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                  aria-label="Tableau de bord"
                  title="Tableau de bord"
                >
                  <Home size={20} />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-700 dark:to-gray-600 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-75 pointer-events-none z-[60] shadow-xl border border-gray-700 dark:border-gray-500">
                    Tableau de bord
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></span>
                  </span>
                </Link>

                <Link
                  to="/simulator"
                  className={`relative group p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    location.pathname === '/simulator' ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                  aria-label="Simulateur"
                  title="Simulateur"
                >
                  <Calculator size={20} />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-700 dark:to-gray-600 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-75 pointer-events-none z-[60] shadow-xl border border-gray-700 dark:border-gray-500">
                    Simulateur
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></span>
                  </span>
                </Link>

                <Link
                  to="/contribute"
                  className={`relative group p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    location.pathname === '/contribute' ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                  aria-label="Contribuer"
                  title="Contribuer"
                >
                  <Users size={20} />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-700 dark:to-gray-600 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-75 pointer-events-none z-[60] shadow-xl border border-gray-700 dark:border-gray-500">
                    Contribuer
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></span>
                  </span>
                </Link>

                <a
                  href={`${import.meta.env.VITE_API_BASE_URL}/docs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative group p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Documentation API"
                  title="Documentation API"
                >
                  <BookOpen size={20} />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-700 dark:to-gray-600 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-75 pointer-events-none z-[60] shadow-xl border border-gray-700 dark:border-gray-500">
                    Documentation API
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></span>
                  </span>
                </a>
              </div>

              {/* Center: Donation Button */}
              <a
                href="https://www.paypal.com/donate?token=YS8EyJdh1jxVY3jqnIQu_YUPEyqp6buLbtfT7aDF8iPI78NF8ajvCUrmXtE4KJjbVjrB5_RfWwtaG2gR"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-medium shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
              >
                <Heart size={20} className="fill-current" />
                <span>Faire un don</span>
              </a>

              {/* Right: User Actions */}
              <div className="flex items-center space-x-1 relative">
                <Link
                  to="/settings"
                  className={`relative group p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    location.pathname === '/settings' ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                  aria-label="Paramètres"
                  title="Paramètres"
                >
                  <Settings size={20} />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-700 dark:to-gray-600 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-75 pointer-events-none z-[60] shadow-xl border border-gray-700 dark:border-gray-500">
                    Paramètres
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></span>
                  </span>
                </Link>

                {user?.is_admin && (
                  <Link
                    to="/admin"
                    className={`relative group p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                      location.pathname.startsWith('/admin') ? 'bg-gray-100 dark:bg-gray-700' : ''
                    }`}
                    aria-label="Administration"
                    title="Administration"
                  >
                    <Shield size={20} />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-700 dark:to-gray-600 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-75 pointer-events-none z-[60] shadow-xl border border-gray-700 dark:border-gray-500">
                      Administration
                      <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></span>
                    </span>
                  </Link>
                )}

                <button
                  onClick={toggleTheme}
                  className="relative group p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Changer de thème"
                  title="Changer de thème"
                >
                  {isDark ? <Sun size={20} /> : <Moon size={20} />}
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-700 dark:to-gray-600 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-75 pointer-events-none z-[60] shadow-xl border border-gray-700 dark:border-gray-500">
                    Changer de thème
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></span>
                  </span>
                </button>

                <button
                  onClick={logout}
                  className="relative group p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 transition-colors"
                  aria-label="Déconnexion"
                  title="Déconnexion"
                >
                  <LogOut size={20} />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-700 dark:to-gray-600 rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-75 pointer-events-none z-[60] shadow-xl border border-gray-700 dark:border-gray-500">
                    Déconnexion
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></span>
                  </span>
                </button>
              </div>
            </nav>

            {/* Mobile Menu Button */}
            <div className="flex items-center space-x-2 md:hidden">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Toggle theme"
              >
                {isDark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-300 dark:border-gray-700">
              <nav className="flex flex-col space-y-1">
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    location.pathname === '/dashboard' ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                >
                  <Home size={20} />
                  <span>Tableau de bord</span>
                </Link>

                <Link
                  to="/simulator"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    location.pathname === '/simulator' ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                >
                  <Calculator size={20} />
                  <span>Simulateur</span>
                </Link>

                <Link
                  to="/contribute"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    location.pathname === '/contribute' ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                >
                  <Users size={20} />
                  <span>Contribuer</span>
                </Link>

                <div className="border-t border-gray-300 dark:border-gray-600 my-2" />

                <a
                  href={`${import.meta.env.VITE_API_BASE_URL}/docs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-3 px-3 py-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <BookOpen size={20} />
                  <span>Documentation API</span>
                </a>

                <a
                  href="https://www.paypal.com/donate?token=YS8EyJdh1jxVY3jqnIQu_YUPEyqp6buLbtfT7aDF8iPI78NF8ajvCUrmXtE4KJjbVjrB5_RfWwtaG2gR"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-3 px-3 py-3 rounded-md bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400"
                >
                  <Heart size={20} />
                  <span>Faire un don</span>
                </a>

                <div className="border-t border-gray-300 dark:border-gray-600 my-2" />

                <Link
                  to="/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    location.pathname === '/settings' ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                >
                  <Settings size={20} />
                  <span>Paramètres</span>
                </Link>

                {user?.is_admin && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center space-x-3 px-3 py-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      location.pathname.startsWith('/admin') ? 'bg-gray-100 dark:bg-gray-700' : ''
                    }`}
                  >
                    <Shield size={20} />
                    <span>Administration</span>
                  </Link>
                )}

                <button
                  onClick={() => {
                    logout()
                    setMobileMenuOpen(false)
                  }}
                  className="flex items-center space-x-3 px-3 py-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400"
                >
                  <LogOut size={20} />
                  <span>Déconnexion</span>
                </button>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {user && (
          <div className="mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Connecté en tant que <span className="font-medium">{user.email}</span>
            </p>
          </div>
        )}
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            © 2025 MyElectricalData - Passerelle API Enedis
          </p>
        </div>
      </footer>
    </div>
  )
}
