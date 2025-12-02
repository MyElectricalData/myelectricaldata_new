import { Link, useLocation } from 'react-router-dom'

interface Tab {
  name: string
  path: string
}

const tabs: Tab[] = [
  { name: 'Swagger', path: '/api-docs' },
  { name: 'Authentification', path: '/api-docs/auth' },
]

export default function ApiDocsTabs() {
  const location = useLocation()

  return (
    <div className="w-full bg-white dark:bg-gray-800">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 max-w-[1920px]">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex -mb-px" aria-label="Tabs">
            {tabs.map((tab) => {
              const isActive = location.pathname === tab.path
              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={`flex-1 text-center px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
      </div>
    </div>
  )
}
