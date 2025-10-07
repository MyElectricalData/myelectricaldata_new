import { Link, useLocation } from 'react-router-dom'
import { Home, LogOut, Moon, Sun, Heart, Shield, BookOpen, Calculator, Users, Menu, X, Calendar, ChevronLeft, ChevronRight, HelpCircle, UserCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useThemeStore } from '@/stores/themeStore'
import { useState } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { canAccessAdmin, hasPermission } = usePermissions()
  const { isDark, toggleTheme } = useThemeStore()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Menu items
  const menuItems = [
    { to: '/dashboard', icon: Home, label: 'Tableau de bord' },
    { to: '/simulator', icon: Calculator, label: 'Simulateur' },
    { to: '/contribute', icon: Users, label: 'Contribuer' },
    { to: '/tempo', icon: Calendar, label: 'Tempo' },
  ]

  return (
    <div className="min-h-screen flex">
      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col bg-white dark:bg-gray-800 border-r border-gray-300 dark:border-gray-700 transition-all duration-300 fixed left-0 top-0 h-screen z-40 ${sidebarCollapsed ? 'w-16' : 'w-64'}`}>
        {/* Logo + Toggle */}
        {!sidebarCollapsed ? (
          <div className="h-16 flex items-center justify-center px-2 border-b border-gray-300 dark:border-gray-700 relative">
            <Link to="/" className="flex items-center flex-1">
              <img src="/logo-full.png" alt="MyElectricalData" className="h-10 w-auto" />
            </Link>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
              aria-label="Réduire le menu"
            >
              <ChevronLeft size={20} />
            </button>
          </div>
        ) : (
          <div className="border-b border-gray-300 dark:border-gray-700">
            <div className="flex items-center justify-center py-3">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Agrandir le menu"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <div className="border-t border-gray-300 dark:border-gray-700 py-3 flex items-center justify-center">
              <Link to="/" className="flex items-center justify-center">
                <img src="/logo.png" alt="MyElectricalData" className="h-8 w-8" />
              </Link>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="space-y-1 px-2">
            {menuItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                  location.pathname === item.to
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? item.label : ''}
              >
                <item.icon size={20} className="flex-shrink-0" />
                {!sidebarCollapsed && <span className="font-medium">{item.label}</span>}
              </Link>
            ))}

            {/* Admin Link */}
            {canAccessAdmin() && (
              <>
                <div className="border-t border-gray-300 dark:border-gray-600 my-2" />
                <Link
                  to="/admin"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                    location.pathname.startsWith('/admin')
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title={sidebarCollapsed ? 'Administration' : ''}
                >
                  <Shield size={20} className="flex-shrink-0" />
                  {!sidebarCollapsed && <span className="font-medium">Administration</span>}
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* Bottom Actions */}
        <div className="border-t border-gray-300 dark:border-gray-700 p-2 space-y-1">
          {/* Donation Button */}
          <a
            href="https://www.paypal.com/donate?token=YS8EyJdh1jxVY3jqnIQu_YUPEyqp6buLbtfT7aDF8iPI78NF8ajvCUrmXtE4KJjbVjrB5_RfWwtaG2gR"
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white transition-all ${sidebarCollapsed ? 'justify-center' : ''}`}
            title={sidebarCollapsed ? 'Faire un don' : ''}
          >
            <Heart size={20} className="flex-shrink-0 fill-current" />
            {!sidebarCollapsed && <span className="font-medium">Faire un don</span>}
          </a>

          {/* FAQ and Documentation with separator */}
          <div className="border-t border-gray-300 dark:border-gray-600 pt-1 mt-1">
            <Link
              to="/faq"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                location.pathname === '/faq'
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={sidebarCollapsed ? 'FAQ Enedis' : ''}
            >
              <HelpCircle size={20} className="flex-shrink-0" />
              {!sidebarCollapsed && <span className="font-medium">FAQ Enedis</span>}
            </Link>

            <a
              href={`${import.meta.env.VITE_API_BASE_URL}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={sidebarCollapsed ? 'Documentation API' : ''}
            >
              <BookOpen size={20} className="flex-shrink-0" />
              {!sidebarCollapsed && <span className="font-medium">Documentation API</span>}
            </a>
          </div>

          {/* User Actions with separator */}
          <div className="border-t border-gray-300 dark:border-gray-600 pt-1 mt-1">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={sidebarCollapsed ? (isDark ? 'Mode clair' : 'Mode sombre') : ''}
            >
              {isDark ? <Sun size={20} className="flex-shrink-0" /> : <Moon size={20} className="flex-shrink-0" />}
              {!sidebarCollapsed && <span className="font-medium">{isDark ? 'Mode clair' : 'Mode sombre'}</span>}
            </button>

            <Link
              to="/settings"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                location.pathname === '/settings'
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={sidebarCollapsed ? 'Mon compte' : ''}
            >
              <UserCircle size={20} className="flex-shrink-0" />
              {!sidebarCollapsed && <span className="font-medium">Mon compte</span>}
            </Link>

            {user && (
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                title={sidebarCollapsed ? 'Déconnexion' : ''}
              >
                <LogOut size={20} className="flex-shrink-0" />
                {!sidebarCollapsed && <span className="font-medium">Déconnexion</span>}
              </button>
            )}
          </div>

          {/* User info at the very bottom */}
          {user && !sidebarCollapsed && (
            <div className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-300 dark:border-gray-600 mt-2 pt-2">
              <p className="font-medium truncate">{user.email}</p>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 shadow-lg"
        aria-label="Menu"
      >
        {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      <aside className={`md:hidden fixed top-0 left-0 bottom-0 w-64 bg-white dark:bg-gray-800 border-r border-gray-300 dark:border-gray-700 z-50 transform transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-gray-300 dark:border-gray-700">
          <Link to="/" onClick={() => setMobileMenuOpen(false)}>
            <img src="/logo-full.png" alt="MyElectricalData" className="h-10 w-auto" />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="space-y-1 px-2">
            {menuItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                  location.pathname === item.to
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            ))}

            {canAccessAdmin() && (
              <>
                <div className="border-t border-gray-300 dark:border-gray-600 my-2" />
                <Link
                  to="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                    location.pathname.startsWith('/admin')
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Shield size={20} />
                  <span className="font-medium">Administration</span>
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* Bottom Actions */}
        <div className="border-t border-gray-300 dark:border-gray-700 p-2 space-y-1">
          {/* User info */}
          {user && (
            <div className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 border-b border-gray-300 dark:border-gray-600 mb-2 pb-2">
              <p className="font-medium truncate">{user.email}</p>
            </div>
          )}

          <Link
            to="/settings"
            onClick={() => setMobileMenuOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
              location.pathname === '/settings'
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <UserCircle size={20} />
            <span className="font-medium">Mon compte</span>
          </Link>

          <button
            onClick={() => {
              toggleTheme()
              setMobileMenuOpen(false)
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
            <span className="font-medium">{isDark ? 'Mode clair' : 'Mode sombre'}</span>
          </button>

          {/* FAQ and Documentation with separator */}
          <div className="border-t border-gray-300 dark:border-gray-600 pt-1 mt-1">
            <Link
              to="/faq"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                location.pathname === '/faq'
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <HelpCircle size={20} />
              <span className="font-medium">FAQ Enedis</span>
            </Link>

            <a
              href={`${import.meta.env.VITE_API_BASE_URL}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <BookOpen size={20} />
              <span className="font-medium">Documentation API</span>
            </a>
          </div>

          {user && (
            <button
              onClick={() => {
                logout()
                setMobileMenuOpen(false)
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
            >
              <LogOut size={20} />
              <span className="font-medium">Déconnexion</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'}`}>
        {/* Top Bar for Admin Menu (if on admin pages) */}
        {location.pathname.startsWith('/admin') && (
          <header className="bg-white dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 shadow-sm sticky top-0 z-30">
            <div className="px-4 sm:px-6 lg:px-8">
              <nav className="flex space-x-8 overflow-x-auto">
                <Link
                  to="/admin"
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                    location.pathname === '/admin'
                      ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  Tableau de bord
                </Link>
                {hasPermission('users') && (
                  <Link
                    to="/admin/users"
                    className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                      location.pathname === '/admin/users'
                        ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Gestion des utilisateurs
                  </Link>
                )}
                {hasPermission('tempo') && (
                  <Link
                    to="/admin/tempo"
                    className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                      location.pathname === '/admin/tempo'
                        ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Gestion Tempo
                  </Link>
                )}
                {hasPermission('contributions') && (
                  <Link
                    to="/admin/contributions"
                    className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                      location.pathname === '/admin/contributions'
                        ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Gestion des contributions
                  </Link>
                )}
                {hasPermission('offers') && (
                  <Link
                    to="/admin/offers"
                    className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                      location.pathname === '/admin/offers'
                        ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Gestion des offres
                  </Link>
                )}
                {hasPermission('roles') && (
                  <Link
                    to="/admin/roles"
                    className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                      location.pathname === '/admin/roles'
                        ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Gestion des rôles
                  </Link>
                )}
              </nav>
            </div>
          </header>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {user && (
              <div className="mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connecté en tant que <span className="font-medium">{user.email}</span>
                </p>
              </div>
            )}
            {children}

            {/* Spacer to push footer down */}
            <div className="pb-20"></div>
          </div>
        </main>

        {/* Footer - Fixed at bottom */}
        <footer className={`fixed bottom-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700 z-30 transition-all duration-300 ${sidebarCollapsed ? 'left-0 md:left-16' : 'left-0 md:left-64'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                © 2025 MyElectricalData - Passerelle API Enedis
              </p>
              <a
                href="https://www.paypal.com/donate?token=YS8EyJdh1jxVY3jqnIQu_YUPEyqp6buLbtfT7aDF8iPI78NF8ajvCUrmXtE4KJjbVjrB5_RfWwtaG2gR"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-medium shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
              >
                <Heart size={18} className="fill-current" />
                <span>Faire un don</span>
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
