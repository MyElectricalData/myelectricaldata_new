import { Link, useLocation } from 'react-router-dom'
import { Zap, Euro } from 'lucide-react'

interface Tab {
  name: string
  path: string
  icon: typeof Zap
}

const tabs: Tab[] = [
  { name: 'kWh', path: '/consumption_kwh', icon: Zap },
  { name: 'Euro', path: '/consumption_euro', icon: Euro },
]

export default function ConsumptionTabs() {
  const location = useLocation()

  return (
    <div className="w-full border-b border-gray-200 dark:border-gray-700 overflow-x-auto bg-white dark:bg-gray-800">
      <nav className="flex justify-center gap-1 min-w-max px-3 sm:px-4 lg:px-6" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path
          const Icon = tab.icon
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
  )
}
