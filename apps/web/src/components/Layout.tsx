import { Link, useLocation } from 'react-router-dom'
import { Home, LogOut, Moon, Sun, Heart, Shield, BookOpen, Calculator, Users, Menu, X, Calendar, ChevronLeft, ChevronRight, HelpCircle, UserCircle, Zap, TrendingUp, Trash2, Scale, ChevronDown, Euro } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useThemeStore } from '@/stores/themeStore'
import { useState, useEffect } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import AdminTabs from './AdminTabs'
import ApiDocsTabs from './ApiDocsTabs'
import ConsumptionTabs from './ConsumptionTabs'
import PageHeader from './PageHeader'
import { PageTransition } from './PageTransition'
import { SEO } from './SEO'
import { useSEO } from '@/hooks/useSEO'
import { useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { canAccessAdmin } = usePermissions()
  const { isDark, toggleTheme } = useThemeStore()
  const location = useLocation()
  const seoProps = useSEO()
  const isAdminLogsPage = location.pathname === '/admin/logs'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed')
    return saved ? JSON.parse(saved) : false
  })
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [consumptionMenuOpen, setConsumptionMenuOpen] = useState(false)
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)
  const queryClient = useQueryClient()

  // Persist sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed))
  }, [sidebarCollapsed])

  // Auto-open submenus when on relevant pages
  useEffect(() => {
    if (location.pathname.startsWith('/consumption')) {
      setConsumptionMenuOpen(true)
    }
    if (location.pathname.startsWith('/admin')) {
      setAdminMenuOpen(true)
    }
  }, [location.pathname])

  // Menu items
  const menuItems = [
    { to: '/dashboard', icon: Home, label: 'Tableau de bord' },
    { to: '/production', icon: Sun, label: 'Production' },
    { to: '/balance', icon: Scale, label: 'Bilan' },
    { to: '/simulator', icon: Calculator, label: 'Simulateur' },
    { to: '/contribute', icon: Users, label: 'Contribuer' },
    { to: '/tempo', icon: Calendar, label: 'Tempo' },
    { to: '/ecowatt', icon: Zap, label: 'EcoWatt' },
  ]

  // Consumption submenu items
  const consumptionSubItems = [
    { to: '/consumption_kwh', icon: TrendingUp, label: 'En kWh' },
    { to: '/consumption_euro', icon: Euro, label: 'En €' },
  ]

  // Admin submenu items
  const adminSubItems = [
    { to: '/admin', label: 'Tableau de bord' },
    { to: '/admin/users', label: 'Utilisateurs' },
    { to: '/admin/tempo', label: 'Tempo' },
    { to: '/admin/ecowatt', label: 'EcoWatt' },
    { to: '/admin/contributions', label: 'Contributions' },
    { to: '/admin/offers', label: 'Offres' },
    { to: '/admin/roles', label: 'Rôles' },
    { to: '/admin/logs', label: 'Logs' },
  ]

  // Check if we're on a consumption page (for active state and tabs)
  const isConsumptionPage = location.pathname.startsWith('/consumption')

  // Clear cache function (admin only)
  const handleClearCache = async () => {
    if (!user?.is_admin) {
      toast.error('Accès non autorisé')
      return
    }

    const confirmClear = window.confirm(
      'Êtes-vous sûr de vouloir vider tout le cache (Navigateur + Redis) ?\n\n' +
      'Cette action supprimera toutes les données en cache pour TOUS les utilisateurs et ne peut pas être annulée.'
    )

    if (!confirmClear) return

    setIsClearingCache(true)

    try {
      // 1. Clear React Query cache
      queryClient.removeQueries({ queryKey: ['consumptionDetail'] })
      queryClient.removeQueries({ queryKey: ['consumption'] })
      queryClient.removeQueries({ queryKey: ['maxPower'] })

      // 2. Clear localStorage
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (
          key.includes('consumptionDetail') ||
          key.includes('consumption') ||
          key.includes('maxPower') ||
          key.includes('REACT_QUERY_OFFLINE_CACHE')
        )) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))

      // 3. Clear IndexedDB
      const databases = await indexedDB.databases()
      for (const db of databases) {
        if (db.name?.includes('react-query') || db.name?.includes('myelectricaldata')) {
          indexedDB.deleteDatabase(db.name)
        }
      }

      // 4. Clear Redis cache via API (for all users)
      const response = await adminApi.clearAllConsumptionCache()
      if (!response.success) {
        const errorMessage = typeof response.error === 'string' ? response.error : 'Échec du vidage du cache Redis'
        throw new Error(errorMessage)
      }

      toast.success('Cache vidé avec succès (Navigateur + Redis)')

    } catch (error) {
      console.error('Error clearing cache:', error)
      toast.error('Erreur lors du vidage du cache')
    } finally {
      setIsClearingCache(false)
    }
  }

  // Add click handler to dismiss toasts on click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // Try multiple selectors to find the toast element
      const isToast = target.closest('[role="status"]') ||
                     target.closest('[data-sonner-toast]') ||
                     target.closest('div[style*="gradient"]')

      if (isToast) {
        toast.dismiss()
      }
    }

    // Attach to document body
    document.body.addEventListener('click', handleClick, { capture: true })

    return () => {
      document.body.removeEventListener('click', handleClick, { capture: true })
    }
  }, [])

  return (
    <div className="min-h-screen flex">
      {/* Dynamic SEO meta tags */}
      <SEO {...seoProps} />

      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col bg-white dark:bg-gray-800 border-r border-gray-300 dark:border-gray-700 transition-all duration-300 fixed left-0 top-0 h-screen z-40 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-gray-300 dark:border-gray-700">
          <Link to="/" className="flex items-center">
            {!sidebarCollapsed ? (
              <img src="/logo-full.png" alt="MyElectricalData" className="h-10 w-auto" />
            ) : (
              <img src="/logo.png" alt="MyElectricalData" className="h-8 w-8" />
            )}
          </Link>
        </div>

        {/* Toggle Button - Floating on the edge */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`absolute top-[65px] -right-4 z-50 p-2 rounded-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all hover:scale-110`}
          aria-label={sidebarCollapsed ? 'Agrandir le menu' : 'Réduire le menu'}
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="space-y-1 px-2">
            {/* Dashboard */}
            <Link
              to="/dashboard"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                location.pathname === '/dashboard'
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={sidebarCollapsed ? 'Tableau de bord' : ''}
            >
              <Home size={20} className="flex-shrink-0" />
              {!sidebarCollapsed && <span className="font-medium">Tableau de bord</span>}
            </Link>

            {/* Consumption Menu with Dropdown */}
            <div className="relative">
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                  isConsumptionPage
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                data-tour="nav-consumption"
              >
                <Link
                  to="/consumption_kwh"
                  className="flex items-center gap-3 flex-1"
                  title={sidebarCollapsed ? 'Consommation' : ''}
                >
                  <TrendingUp size={20} className="flex-shrink-0" />
                  {!sidebarCollapsed && <span className="font-medium">Consommation</span>}
                </Link>
                {!sidebarCollapsed && (
                  <button
                    onClick={() => setConsumptionMenuOpen(!consumptionMenuOpen)}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                    aria-label="Ouvrir le sous-menu"
                  >
                    <ChevronDown
                      size={16}
                      className={`transition-transform duration-200 ${consumptionMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                )}
              </div>
              {/* Submenu */}
              {(consumptionMenuOpen || sidebarCollapsed) && (
                <div className={`${sidebarCollapsed ? 'absolute left-full top-0 ml-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[140px]' : 'ml-4 mt-1 space-y-1'}`}>
                  {consumptionSubItems.map((subItem) => (
                    <Link
                      key={subItem.to}
                      to={subItem.to}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                        location.pathname === subItem.to
                          ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <subItem.icon size={16} className="flex-shrink-0" />
                      <span className="font-medium text-sm">{subItem.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Other menu items */}
            {menuItems.filter(item => item.to !== '/dashboard').map((item) => {
              const isActive = location.pathname === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                    isActive
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title={sidebarCollapsed ? item.label : ''}
                  data-tour={item.to === '/simulator' ? 'nav-simulator' :
                            item.to === '/contribute' ? 'nav-contribute' : undefined}
                >
                  <item.icon size={20} className="flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="font-medium">{item.label}</span>
                  )}
                </Link>
              )
            })}

            {/* Admin Link */}
            {canAccessAdmin() && (
              <>
                <div className="border-t border-gray-300 dark:border-gray-600 my-2" />
                <div className="relative">
                  <div
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                      location.pathname.startsWith('/admin')
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Link
                      to="/admin"
                      className="flex items-center gap-3 flex-1"
                      title={sidebarCollapsed ? 'Administration' : ''}
                    >
                      <Shield size={20} className="flex-shrink-0" />
                      {!sidebarCollapsed && <span className="font-medium">Administration</span>}
                    </Link>
                    {!sidebarCollapsed && (
                      <button
                        onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                        aria-label="Ouvrir le sous-menu"
                      >
                        <ChevronDown
                          size={16}
                          className={`transition-transform duration-200 ${adminMenuOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                    )}
                  </div>
                  {/* Submenu */}
                  {(adminMenuOpen || sidebarCollapsed) && (
                    <div className={`${sidebarCollapsed ? 'absolute left-full top-0 ml-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[160px]' : 'ml-4 mt-1 space-y-1'}`}>
                      {adminSubItems.map((subItem) => (
                        <Link
                          key={subItem.to}
                          to={subItem.to}
                          className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                            location.pathname === subItem.to
                              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          <span className="font-medium text-sm">{subItem.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Clear Cache Button (Admin only) */}
                <button
                  onClick={handleClearCache}
                  disabled={isClearingCache}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={sidebarCollapsed ? 'Vider le cache' : ''}
                >
                  <Trash2 size={20} className="flex-shrink-0" />
                  {!sidebarCollapsed && <span className="font-medium">Vider le cache</span>}
                </button>
              </>
            )}
          </div>
        </nav>

        {/* Bottom Actions */}
        <div className="border-t border-gray-300 dark:border-gray-700 p-2 space-y-1">
          {/* Donation Button */}
          <a
            href="https://www.paypal.com/donate/?business=FY25JLXDYLXAJ&no_recurring=0&currency_code=EUR"
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

            <Link
              to="/api-docs"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                location.pathname === '/api-docs'
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={sidebarCollapsed ? 'Documentation API' : ''}
              data-tour="nav-api-docs"
            >
              <BookOpen size={20} className="flex-shrink-0" />
              {!sidebarCollapsed && <span className="font-medium">Documentation API</span>}
            </Link>
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
              data-tour="nav-settings"
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
        className="md:hidden fixed top-[12px] left-4 z-50 p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 shadow-lg"
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
            {/* Dashboard */}
            <Link
              to="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                location.pathname === '/dashboard'
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Home size={20} />
              <span className="font-medium">Tableau de bord</span>
            </Link>

            {/* Consumption Menu with Dropdown - Mobile */}
            <div>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                  isConsumptionPage
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Link
                  to="/consumption_kwh"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 flex-1"
                >
                  <TrendingUp size={20} />
                  <span className="font-medium">Consommation</span>
                </Link>
                <button
                  onClick={() => setConsumptionMenuOpen(!consumptionMenuOpen)}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                  aria-label="Ouvrir le sous-menu"
                >
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${consumptionMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>
              {/* Submenu */}
              {consumptionMenuOpen && (
                <div className="ml-4 mt-1 space-y-1">
                  {consumptionSubItems.map((subItem) => (
                    <Link
                      key={subItem.to}
                      to={subItem.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                        location.pathname === subItem.to
                          ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <subItem.icon size={16} />
                      <span className="font-medium text-sm">{subItem.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Other menu items */}
            {menuItems.filter(item => item.to !== '/dashboard').map((item) => {
              const isActive = location.pathname === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                    isActive
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <item.icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </Link>
              )
            })}

            {canAccessAdmin() && (
              <>
                <div className="border-t border-gray-300 dark:border-gray-600 my-2" />
                <div>
                  <div
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                      location.pathname.startsWith('/admin')
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Link
                      to="/admin"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 flex-1"
                    >
                      <Shield size={20} />
                      <span className="font-medium">Administration</span>
                    </Link>
                    <button
                      onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                      aria-label="Ouvrir le sous-menu"
                    >
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-200 ${adminMenuOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                  {/* Submenu */}
                  {adminMenuOpen && (
                    <div className="ml-4 mt-1 space-y-1">
                      {adminSubItems.map((subItem) => (
                        <Link
                          key={subItem.to}
                          to={subItem.to}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                            location.pathname === subItem.to
                              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          <span className="font-medium text-sm">{subItem.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Clear Cache Button (Admin only) */}
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    handleClearCache()
                  }}
                  disabled={isClearingCache}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 size={20} />
                  <span className="font-medium">Vider le cache</span>
                </button>
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

            <Link
              to="/api-docs"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                location.pathname === '/api-docs'
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <BookOpen size={20} />
              <span className="font-medium">Documentation API</span>
            </Link>
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
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-56'}`}>
        {/* Header sticky : PageHeader + Tabs (si présents) */}
        <div className="sticky top-0 z-20 flex-shrink-0">
          <PageHeader />
          {location.pathname.startsWith('/admin') && <AdminTabs />}
          {location.pathname.startsWith('/api-docs') && <ApiDocsTabs />}
          {isConsumptionPage && <ConsumptionTabs />}
        </div>

        {/* Main Content */}
        <main className={`flex-1 bg-gray-50 dark:bg-gray-900 ${isAdminLogsPage ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={`container mx-auto px-3 sm:px-4 lg:px-6 max-w-[1920px] ${isAdminLogsPage ? 'h-full pb-0' : 'pb-6'} pt-4`}>
            <PageTransition key={location.pathname}>
              {children}
            </PageTransition>

            {/* Spacer to push footer down - only on desktop */}
            {!isAdminLogsPage && <div className="hidden md:block pb-20"></div>}
          </div>
        </main>

        {/* Footer - Fixed at bottom - Hidden on mobile */}
        <footer className={`hidden md:fixed bottom-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700 z-30 transition-all duration-300 ${sidebarCollapsed ? 'left-0 md:left-16' : 'left-0 md:left-56'}`}>
          <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 max-w-[1920px]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                © 2025 MyElectricalData - Passerelle API Enedis
              </p>
              <a
                href="https://www.paypal.com/donate/?business=FY25JLXDYLXAJ&no_recurring=0&currency_code=EUR"
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

      {/* Global Toaster */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 5000,
          style: {
            background: 'linear-gradient(135deg, #4338ca 0%, #3730a3 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: '0.75rem',
            padding: '1rem 1.5rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: 'pointer',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
            minWidth: '400px',
            maxWidth: '600px',
          },
          success: {
            iconTheme: {
              primary: '#fff',
              secondary: '#10b981',
            },
            style: {
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              minWidth: '400px',
              maxWidth: '600px',
            },
          },
          error: {
            iconTheme: {
              primary: '#fff',
              secondary: '#ef4444',
            },
            style: {
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              minWidth: '400px',
              maxWidth: '600px',
            },
          },
        }}
        containerStyle={{
          top: 10,
          left: '50%',
          right: 'auto',
          transform: sidebarCollapsed ? 'translateX(calc(-50% + 2rem))' : 'translateX(calc(-50% + 7rem))',
        }}
      />
    </div>
  )
}
