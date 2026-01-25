import { Link, useLocation } from 'react-router-dom'
import { Plus, List, Package } from 'lucide-react'

interface Tab {
  name: string
  path: string
  icon: typeof Plus
}

const tabs: Tab[] = [
  { name: 'Toutes les offres', path: '/contribute/offers', icon: Package },
  // Onglet désactivé temporairement - fonctionnalité intégrée dans /contribute/offers
  // { name: 'Nouvelle contribution', path: '/contribute/new', icon: Plus },
  { name: 'Mes contributions', path: '/contribute/mine', icon: List },
]

export default function ContributeTabs() {
  const location = useLocation()

  return (
    <div className="w-full bg-white dark:bg-gray-800">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 max-w-[1920px]">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex -mb-px" aria-label="Tabs">
            {tabs.map((tab) => {
              const isActive = location.pathname === tab.path
              const Icon = tab.icon
              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon size={16} />
                  {tab.name}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
    </div>
  )
}
