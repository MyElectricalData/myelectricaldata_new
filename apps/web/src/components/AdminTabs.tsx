import { Link, useLocation } from 'react-router-dom'
import { usePermissions } from '@/hooks/usePermissions'

interface Tab {
  name: string
  path: string
  permission?: string
}

const tabs: Tab[] = [
  { name: 'Tableau de bord', path: '/admin' },
  { name: 'Gestion des utilisateurs', path: '/admin/users', permission: 'users' },
  { name: 'Gestion Tempo', path: '/admin/tempo' },
  { name: 'Gestion EcoWatt', path: '/admin/ecowatt' },
  { name: 'Gestion des contributions', path: '/admin/contributions', permission: 'contributions' },
  { name: 'Gestion des offres', path: '/admin/offers', permission: 'offers' },
  { name: 'Gestion des rôles', path: '/admin/roles', permission: 'roles' },
  { name: 'Logs', path: '/admin/logs', permission: 'admin_dashboard' },
]

export default function AdminTabs() {
  const location = useLocation()
  const { hasPermission } = usePermissions()

  const visibleTabs = tabs.filter(tab => !tab.permission || hasPermission(tab.permission))

  return (
    <div className="w-full border-b border-gray-200 dark:border-gray-700 mb-6 -mx-6 px-6 overflow-x-auto">
      <nav className="flex gap-1 min-w-max" aria-label="Tabs">
        {visibleTabs.map((tab) => {
          const isActive = location.pathname === tab.path
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.name}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
