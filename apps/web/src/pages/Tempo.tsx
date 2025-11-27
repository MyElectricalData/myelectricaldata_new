import { useQuery } from '@tanstack/react-query'
import { tempoApi, type TempoDay } from '../api/tempo'

export default function Tempo() {
  const { data: tempoData, isLoading } = useQuery({
    queryKey: ['tempo-all'],
    queryFn: () => tempoApi.getDays(),
  })

  if (isLoading) {
    return (
      <div className="w-full">
        <h1 className="text-3xl font-bold mb-6">Calendrier Tempo</h1>
        <p>Chargement des données...</p>
      </div>
    )
  }

  // Ensure data is always an array
  const allDays: TempoDay[] = Array.isArray(tempoData?.data) ? tempoData.data : []

  if (!tempoData?.success || allDays.length === 0) {
    return (
      <div className="w-full">
        <h1 className="text-3xl font-bold mb-6">Calendrier Tempo</h1>
        <p className="text-red-600">Erreur lors du chargement des données Tempo ou aucune donnée disponible.</p>
      </div>
    )
  }

  // Group days by TEMPO season (Sept 1 to Aug 31)
  // TEMPO season: Sept Year N to Aug Year N+1 = Season "N/N+1"
  const groupedBySeason: Record<string, Record<string, TempoDay[]>> = {}
  allDays.forEach((day) => {
    // Parse date as local date (YYYY-MM-DD) to avoid timezone issues
    const [year, month] = day.date.split('-').map(Number)
    const monthIndex = month - 1 // Convert to 0-based index (0=Jan, 8=Sept)

    // TEMPO season starts Sept 1 (month 8)
    const seasonStart = monthIndex >= 8 ? year : year - 1
    const seasonKey = `${seasonStart}/${seasonStart + 1}`

    if (!groupedBySeason[seasonKey]) {
      groupedBySeason[seasonKey] = {}
    }
    if (!groupedBySeason[seasonKey][monthIndex]) {
      groupedBySeason[seasonKey][monthIndex] = []
    }
    groupedBySeason[seasonKey][monthIndex].push(day)
  })

  const seasons = Object.keys(groupedBySeason).sort((a, b) => {
    const yearA = parseInt(a.split('/')[0])
    const yearB = parseInt(b.split('/')[0])
    return yearB - yearA // Most recent first
  })

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'BLUE':
        return 'bg-blue-500 text-white'
      case 'WHITE':
        return 'bg-white dark:bg-white text-gray-900 dark:text-gray-900 border border-gray-400 dark:border-gray-500'
      case 'RED':
        return 'bg-red-500 text-white'
      default:
        return 'bg-gray-300 text-gray-700'
    }
  }

  const monthNames = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
  ]

  const renderMonth = (season: string, month: number) => {
    const days = groupedBySeason[season][month] || []
    if (days.length === 0) return null

    // Sort days by date (using string comparison for YYYY-MM-DD format)
    days.sort((a, b) => a.date.localeCompare(b.date))

    // Get actual year for this month (Sept-Dec uses first year, Jan-Aug uses second year)
    const [year1, year2] = season.split('/').map(Number)
    const actualYear = month >= 8 ? year1 : year2

    // Get first day of month to determine offset
    const firstDay = new Date(actualYear, month, 1)
    const firstDayOfWeek = firstDay.getDay() // 0 = Sunday, 1 = Monday, ...
    const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1 // Convert to Monday = 0

    // Get number of days in month
    const daysInMonth = new Date(actualYear, month + 1, 0).getDate()

    // Create array for all days in month
    const calendarDays: (TempoDay | null)[] = Array(daysInMonth).fill(null)
    days.forEach((day) => {
      // Extract day number from YYYY-MM-DD format (avoids timezone issues)
      const dayNum = parseInt(day.date.split('-')[2], 10)
      calendarDays[dayNum - 1] = day
    })

    return (
      <div key={`${season}-${month}`} className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <h3 className="font-semibold text-lg mb-3 text-center">{monthNames[month]} {actualYear}</h3>

        {/* Week day headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, idx) => (
            <div key={idx} className="text-center text-xs font-semibold text-gray-600 dark:text-gray-400">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Offset for first day of month */}
          {Array(offset)
            .fill(null)
            .map((_, idx) => (
              <div key={`offset-${idx}`} />
            ))}

          {/* Days */}
          {calendarDays.map((day, idx) => {
            const dayNum = idx + 1
            return (
              <div
                key={dayNum}
                className={`aspect-square flex items-center justify-center text-sm font-medium rounded ${
                  day ? getColorClasses(day.color) : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                }`}
                title={day ? `${dayNum} - ${day.color}` : `${dayNum}`}
              >
                {dayNum}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Count colors by season
  const getSeasonStats = (season: string) => {
    const seasonData = groupedBySeason[season]
    const stats = { BLUE: 0, WHITE: 0, RED: 0 }

    Object.values(seasonData).forEach((monthDays) => {
      monthDays.forEach((day) => {
        if (day.color in stats) {
          stats[day.color as keyof typeof stats]++
        }
      })
    })

    return stats
  }

  // Get current season stats
  const getCurrentSeasonStats = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()

    // Determine current season
    const currentSeasonStart = month >= 8 ? year : year - 1
    const currentSeasonKey = `${currentSeasonStart}/${currentSeasonStart + 1}`

    if (!groupedBySeason[currentSeasonKey]) {
      return null
    }

    const stats = getSeasonStats(currentSeasonKey)
    return {
      season: currentSeasonKey,
      blueUsed: stats.BLUE,
      whiteUsed: stats.WHITE,
      redUsed: stats.RED,
      blueRemaining: 300 - stats.BLUE,
      whiteRemaining: 43 - stats.WHITE,
      redRemaining: 22 - stats.RED,
    }
  }

  const currentSeasonStats = getCurrentSeasonStats()

  return (
    <div className="pt-6 w-full">

      {/* Current Season Summary */}
      {currentSeasonStats && (
        <div className="mb-8 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-700 rounded-lg p-6 border border-blue-200 dark:border-gray-600">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Saison en cours : {currentSeasonStats.season}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Du 1er septembre au 31 août
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Blue days */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Jours Bleus Restants</span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {currentSeasonStats.blueRemaining}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Utilisés : {currentSeasonStats.blueUsed}</span>
                <span className="text-gray-500 dark:text-gray-400">/ 300</span>
              </div>
              <div className="mt-2 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all"
                  style={{ width: `${(currentSeasonStats.blueUsed / 300) * 100}%` }}
                />
              </div>
            </div>

            {/* White days */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-l-4 border-gray-500">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Jours Blancs Restants</span>
                <span className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                  {currentSeasonStats.whiteRemaining}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Utilisés : {currentSeasonStats.whiteUsed}</span>
                <span className="text-gray-500 dark:text-gray-400">/ 43</span>
              </div>
              <div className="mt-2 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gray-500 h-full transition-all"
                  style={{ width: `${(currentSeasonStats.whiteUsed / 43) * 100}%` }}
                />
              </div>
            </div>

            {/* Red days */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-l-4 border-red-500">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Jours Rouges Restants</span>
                <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {currentSeasonStats.redRemaining}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Utilisés : {currentSeasonStats.redUsed}</span>
                <span className="text-gray-500 dark:text-gray-400">/ 22</span>
              </div>
              <div className="mt-2 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-red-500 h-full transition-all"
                  style={{ width: `${(currentSeasonStats.redUsed / 22) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mb-8 flex gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-500 rounded"></div>
          <span className="text-sm">Jour Bleu (300 jours/an)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-white dark:bg-gray-200 border border-gray-400 rounded"></div>
          <span className="text-sm">Jour Blanc (43 jours/an)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-red-500 rounded"></div>
          <span className="text-sm">Jour Rouge (22 jours/an)</span>
        </div>
      </div>

      {seasons.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">Aucune donnée Tempo disponible</p>
        </div>
      ) : (
        <div className="space-y-12">
          {seasons.map((season) => {
            const stats = getSeasonStats(season)
            const months = Object.keys(groupedBySeason[season])
              .map(Number)
              .sort((a, b) => {
                // Sort months from most recent to oldest within a season
                // For a season (Sept N to Aug N+1):
                // - Jan-Aug (0-7) are more recent (year N+1)
                // - Sept-Dec (8-11) are older (year N)
                const orderA = a >= 8 ? a - 8 : a + 4
                const orderB = b >= 8 ? b - 8 : b + 4
                return orderB - orderA // Inverted for reverse order (most recent first)
              })

            return (
              <div key={season}>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">Saison Tempo {season}</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Du 1er septembre au 31 août
                  </p>
                  <div className="flex gap-4 mt-2 text-sm">
                    <span className="text-blue-600 dark:text-blue-400">
                      {stats.BLUE} jours bleus
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {stats.WHITE} jours blancs
                    </span>
                    <span className="text-red-600 dark:text-red-400">
                      {stats.RED} jours rouges
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {months.map((month) => renderMonth(season, month))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
