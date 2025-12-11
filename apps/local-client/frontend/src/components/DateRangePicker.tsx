import { useStore } from '../stores/useStore'
import clsx from 'clsx'

const periodButtons = [
  { type: 'day' as const, label: 'Jour' },
  { type: 'week' as const, label: 'Semaine' },
  { type: 'month' as const, label: 'Mois' },
  { type: 'year' as const, label: 'Année' },
]

export default function DateRangePicker() {
  const { startDate, endDate, setDateRange, periodType, setPeriodType } = useStore()

  const handlePeriodChange = (type: 'day' | 'week' | 'month' | 'year') => {
    setPeriodType(type)
    const end = new Date()
    let start = new Date()

    switch (type) {
      case 'day':
        start = new Date(end)
        break
      case 'week':
        start.setDate(end.getDate() - 7)
        break
      case 'month':
        start.setMonth(end.getMonth() - 1)
        break
      case 'year':
        start.setFullYear(end.getFullYear() - 1)
        break
    }

    setDateRange(
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0]
    )
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      {/* Period buttons */}
      <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
        {periodButtons.map((btn) => (
          <button
            key={btn.type}
            onClick={() => handlePeriodChange(btn.type)}
            className={clsx(
              'px-3 py-1.5 text-sm font-medium transition-colors',
              periodType === btn.type
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Date inputs */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-500 dark:text-gray-400">Du</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setDateRange(e.target.value, endDate)}
          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
        />
        <label className="text-sm text-gray-500 dark:text-gray-400">au</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setDateRange(startDate, e.target.value)}
          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
        />
      </div>
    </div>
  )
}
