import { Outlet, Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useStore } from '../stores/useStore'
import { useQuery } from '@tanstack/react-query'
import { getPDLs } from '../api/client'
import PageHeader from './PageHeader'
import {
  Home,
  TrendingUp,
  Sun,
  Scale,
  Calendar,
  Zap,
  Calculator,
  Moon,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Settings,
} from 'lucide-react'

// Menu items - same structure as gateway
const menuItems = [
  { to: '/', icon: Home, label: 'Tableau de bord' },
  { to: '/consumption_kwh', icon: TrendingUp, label: 'Consommation' },
  { to: '/production', icon: Sun, label: 'Production' },
  { to: '/bilan', icon: Scale, label: 'Bilan' },
  { to: '/simulation', icon: Calculator, label: 'Simulateur' },
  { to: '/tempo', icon: Calendar, label: 'Tempo' },
  { to: '/ecowatt', icon: Zap, label: 'EcoWatt' },
  { to: '/exporters', icon: Settings, label: 'Exporteurs' },
]

export default function Layout() {
  const { darkMode, toggleDarkMode, selectedPdl, setSelectedPdl } = useStore()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed')
    return saved ? JSON.parse(saved) : false
  })

  // Check if we're on a consumption page (for active state)
  const isConsumptionPage = location.pathname.startsWith('/consumption')

  // Fetch PDLs to auto-select first one
  const { data: pdls = [] } = useQuery({
    queryKey: ['pdls'],
    queryFn: getPDLs,
  })

  // Auto-select first PDL if none selected
  useEffect(() => {
    if (pdls.length > 0 && !selectedPdl) {
      setSelectedPdl(pdls[0].usage_point_id)
    }
  }, [pdls, selectedPdl, setSelectedPdl])

  // Persist sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed))
  }, [sidebarCollapsed])

  return (
    <div className="min-h-screen flex">
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
            {menuItems.map((item) => {
              // Special handling for consumption - active if any consumption page
              const isActive = item.to === '/consumption_kwh'
                ? isConsumptionPage
                : location.pathname === item.to
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
                >
                  <item.icon size={20} className="flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="font-medium">{item.label}</span>
                  )}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Bottom Actions */}
        <div className="border-t border-gray-300 dark:border-gray-700 p-2 space-y-1">
          {/* Theme Toggle */}
          <button
            onClick={toggleDarkMode}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={sidebarCollapsed ? (darkMode ? 'Mode clair' : 'Mode sombre') : ''}
          >
            {darkMode ? <Sun size={20} className="flex-shrink-0" /> : <Moon size={20} className="flex-shrink-0" />}
            {!sidebarCollapsed && <span className="font-medium">{darkMode ? 'Mode clair' : 'Mode sombre'}</span>}
          </button>
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
            {menuItems.map((item) => {
              // Special handling for consumption - active if any consumption page
              const isActive = item.to === '/consumption_kwh'
                ? isConsumptionPage
                : location.pathname === item.to
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
          </div>
        </nav>

        {/* Bottom Actions */}
        <div className="border-t border-gray-300 dark:border-gray-700 p-2 space-y-1">
          <button
            onClick={() => {
              toggleDarkMode()
              setMobileMenuOpen(false)
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            <span className="font-medium">{darkMode ? 'Mode clair' : 'Mode sombre'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-56'}`}>
        {/* Header sticky : PageHeader */}
        <div className="sticky top-0 z-20 flex-shrink-0">
          <PageHeader
            selectedPdl={selectedPdl || ''}
            onPdlChange={setSelectedPdl}
          />
        </div>

        {/* Main Content */}
        <main className="flex-1 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
          <div className="container mx-auto px-3 sm:px-4 lg:px-6 max-w-[1920px] pb-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
