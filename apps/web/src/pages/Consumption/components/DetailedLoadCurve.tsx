import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Calendar, Download, BarChart3, Loader2, CalendarDays, CalendarRange } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { logger } from '@/utils/logger'
import { ModernButton } from './ModernButton'

interface DetailedLoadCurveProps {
  detailByDayData: any[]
  selectedPDL: string | null
  isDarkMode: boolean
  isLoadingDetail: boolean
  detailDateRange: { start: string; end: string } | null
  onWeekOffsetChange: (offset: number) => void
  detailWeekOffset: number
}

export function DetailedLoadCurve({
  detailByDayData,
  selectedPDL,
  isDarkMode,
  isLoadingDetail,
  detailDateRange,
  onWeekOffsetChange,
  detailWeekOffset
}: DetailedLoadCurveProps) {
  const queryClient = useQueryClient()
  const [selectedDetailDay, setSelectedDetailDay] = useState(0)
  const [showDetailWeekComparison, setShowDetailWeekComparison] = useState(false)
  const [showDetailYearComparison, setShowDetailYearComparison] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [viewMonth, setViewMonth] = useState(new Date())
  const [weekComparisonAvailable, setWeekComparisonAvailable] = useState(false)
  const [yearComparisonAvailable, setYearComparisonAvailable] = useState(false)
  const [hasAutoSelected, setHasAutoSelected] = useState(false)

  // Reset auto-selection flag when PDL changes
  useEffect(() => {
    setHasAutoSelected(false)
  }, [selectedPDL])

  // Auto-select most recent day with data ONLY on initial load (only once per PDL)
  // This prevents resetting the user's selection when data refreshes
  useEffect(() => {
    // Skip if already auto-selected OR if user has manually navigated away from default (day 0, week 0)
    const hasUserNavigated = detailWeekOffset !== 0 || selectedDetailDay !== 0
    if (!selectedPDL || !detailDateRange || hasAutoSelected || hasUserNavigated) return

    // Use detailByDayData which is already filtered by date range and minimum points
    // This ensures we select a day that's actually visible in the UI
    if (detailByDayData.length === 0) {
      setHasAutoSelected(true)
      return
    }

    // detailByDayData is sorted newest first, so index 0 = most recent day with data
    // Just select index 0 directly since the data is already correctly filtered
    setSelectedDetailDay(0)
    setHasAutoSelected(true)

    logger.info('Auto-selected most recent day with data', {
      date: detailByDayData[0].date,
      totalDays: detailByDayData.length,
      weekOffset: detailWeekOffset,
      dayIndex: 0
    })
  }, [selectedPDL, detailDateRange, detailByDayData, hasAutoSelected, detailWeekOffset, selectedDetailDay])

  // Auto-adjust selected day when data changes
  useEffect(() => {
    if (detailByDayData.length > 0) {
      if (selectedDetailDay >= detailByDayData.length) {
        setSelectedDetailDay(detailByDayData.length - 1)
      }
    }
  }, [detailByDayData, selectedDetailDay])

  // Check for comparison data availability when selected date changes
  useEffect(() => {
    if (!selectedPDL || !detailByDayData[selectedDetailDay]) {
      setWeekComparisonAvailable(false)
      setYearComparisonAvailable(false)
      // Reset comparison toggles when no data available
      setShowDetailWeekComparison(false)
      setShowDetailYearComparison(false)
      return
    }

    // Calculate current date in UTC
    const todayUTC = new Date()
    const yesterdayUTC = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate() - 1,
      0, 0, 0, 0
    ))
    const currentDateUTC = new Date(Date.UTC(
      yesterdayUTC.getUTCFullYear(),
      yesterdayUTC.getUTCMonth(),
      yesterdayUTC.getUTCDate() - (detailWeekOffset * 7) - selectedDetailDay,
      0, 0, 0, 0
    ))

    // Check week-1 availability
    const weekAgoDateUTC = new Date(Date.UTC(
      currentDateUTC.getUTCFullYear(),
      currentDateUTC.getUTCMonth(),
      currentDateUTC.getUTCDate() - 7,
      0, 0, 0, 0
    ))
    const weekAgoDateStr = weekAgoDateUTC.getUTCFullYear() + '-' +
                          String(weekAgoDateUTC.getUTCMonth() + 1).padStart(2, '0') + '-' +
                          String(weekAgoDateUTC.getUTCDate()).padStart(2, '0')

    const weekAgoData = queryClient.getQueryData(['consumptionDetail', selectedPDL, weekAgoDateStr, weekAgoDateStr]) as any
    const weekAvailable = !!weekAgoData?.data?.meter_reading?.interval_reading
    setWeekComparisonAvailable(weekAvailable)
    // Reset comparison toggle if data becomes unavailable
    if (!weekAvailable && showDetailWeekComparison) {
      setShowDetailWeekComparison(false)
    }

    // Check year-1 availability
    const yearAgoDateUTC = new Date(Date.UTC(
      currentDateUTC.getUTCFullYear() - 1,
      currentDateUTC.getUTCMonth(),
      currentDateUTC.getUTCDate(),
      0, 0, 0, 0
    ))
    const yearAgoDateStr = yearAgoDateUTC.getUTCFullYear() + '-' +
                          String(yearAgoDateUTC.getUTCMonth() + 1).padStart(2, '0') + '-' +
                          String(yearAgoDateUTC.getUTCDate()).padStart(2, '0')

    const yearAgoData = queryClient.getQueryData(['consumptionDetail', selectedPDL, yearAgoDateStr, yearAgoDateStr]) as any
    const yearAvailable = !!yearAgoData?.data?.meter_reading?.interval_reading
    setYearComparisonAvailable(yearAvailable)
    // Reset comparison toggle if data becomes unavailable
    if (!yearAvailable && showDetailYearComparison) {
      setShowDetailYearComparison(false)
    }
  }, [selectedDetailDay, detailWeekOffset, selectedPDL, detailByDayData, queryClient, showDetailWeekComparison, showDetailYearComparison])

  const handleExport = () => {
    if (!detailByDayData[selectedDetailDay]) return
    const jsonData = JSON.stringify({
      date: detailByDayData[selectedDetailDay].date,
      data: detailByDayData[selectedDetailDay].data,
      totalEnergyKwh: detailByDayData[selectedDetailDay].totalEnergyKwh
    }, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Données copiées dans le presse-papier')
  }

  const getComparisonData = () => {
    if (!detailByDayData[selectedDetailDay]) return []

    const currentData = detailByDayData[selectedDetailDay].data
    interface MergedDataPoint {
      time: string
      power: number
      energyKwh: number
      powerWeekAgo?: number | null
      powerYearAgo?: number | null
    }

    let mergedData: MergedDataPoint[] = currentData.map((d: { time: string; power: number; energyKwh: number }) => ({ ...d }))

    // Calculate current date in UTC
    const todayUTC = new Date()
    const yesterdayUTC = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate() - 1,
      0, 0, 0, 0
    ))
    const currentDateUTC = new Date(Date.UTC(
      yesterdayUTC.getUTCFullYear(),
      yesterdayUTC.getUTCMonth(),
      yesterdayUTC.getUTCDate() - (detailWeekOffset * 7) - selectedDetailDay,
      0, 0, 0, 0
    ))

    // Add week -1 comparison
    if (showDetailWeekComparison && selectedPDL) {
      const weekAgoDateUTC = new Date(Date.UTC(
        currentDateUTC.getUTCFullYear(),
        currentDateUTC.getUTCMonth(),
        currentDateUTC.getUTCDate() - 7,
        0, 0, 0, 0
      ))

      // Format date for cache key
      const weekAgoDateStr = weekAgoDateUTC.getUTCFullYear() + '-' +
                            String(weekAgoDateUTC.getUTCMonth() + 1).padStart(2, '0') + '-' +
                            String(weekAgoDateUTC.getUTCDate()).padStart(2, '0')

      logger.log('🔍 Looking for week-1 data:', {
        currentDate: currentDateUTC.toISOString().split('T')[0],
        weekAgoDate: weekAgoDateStr,
        selectedPDL
      })

      // Try to get data for the specific day from cache
      const weekAgoData = queryClient.getQueryData(['consumptionDetail', selectedPDL, weekAgoDateStr, weekAgoDateStr]) as any

      if (weekAgoData?.data?.meter_reading?.interval_reading) {
        logger.log('✅ Found week-1 data in cache!')
        const readings = weekAgoData.data.meter_reading.interval_reading
        const unit = weekAgoData.data.meter_reading.reading_type?.unit || 'W'
        const intervalLength = weekAgoData.data.meter_reading.reading_type?.interval_length || 'PT30M'

        const parseInterval = (interval: string): number => {
          // Handle both P30M and PT30M formats
          const match = interval.match(/^P(?:T)?(\d+)([DHM])$/)
          if (!match) return 0.5
          const value = parseInt(match[1], 10)
          const unitType = match[2]
          return unitType === 'D' ? value * 24 : unitType === 'H' ? value : value / 60
        }
        const intervalMultiplier = unit === 'W' ? parseInterval(intervalLength) : 1

        mergedData = mergedData.map((current, idx) => {
          const weekAgoReading = readings[idx]
          const power = weekAgoReading?.value
            ? (parseFloat(weekAgoReading.value) * intervalMultiplier) / 1000
            : null
          return {
            ...current,
            powerWeekAgo: power
          }
        })
        logger.log('✅ Week-1 data added successfully')
      } else {
        logger.log('⚠️ No week-1 data found in cache for date:', weekAgoDateStr)
      }
    }

    // Add year -1 comparison
    if (showDetailYearComparison && selectedPDL) {
      const yearAgoDateUTC = new Date(Date.UTC(
        currentDateUTC.getUTCFullYear() - 1,
        currentDateUTC.getUTCMonth(),
        currentDateUTC.getUTCDate(),
        0, 0, 0, 0
      ))

      // Format date for cache key
      const yearAgoDateStr = yearAgoDateUTC.getUTCFullYear() + '-' +
                            String(yearAgoDateUTC.getUTCMonth() + 1).padStart(2, '0') + '-' +
                            String(yearAgoDateUTC.getUTCDate()).padStart(2, '0')

      logger.log('🔍 Looking for year-1 data:', {
        currentDate: currentDateUTC.toISOString().split('T')[0],
        yearAgoDate: yearAgoDateStr,
        selectedPDL
      })

      // Try to get data for the specific day from cache
      const yearAgoData = queryClient.getQueryData(['consumptionDetail', selectedPDL, yearAgoDateStr, yearAgoDateStr]) as any

      if (yearAgoData?.data?.meter_reading?.interval_reading) {
        logger.log('✅ Found year-1 data in cache!')
        const readings = yearAgoData.data.meter_reading.interval_reading
        const unit = yearAgoData.data.meter_reading.reading_type?.unit || 'W'
        const intervalLength = yearAgoData.data.meter_reading.reading_type?.interval_length || 'PT30M'

        const parseInterval = (interval: string): number => {
          // Handle both P30M and PT30M formats
          const match = interval.match(/^P(?:T)?(\d+)([DHM])$/)
          if (!match) return 0.5
          const value = parseInt(match[1], 10)
          const unitType = match[2]
          return unitType === 'D' ? value * 24 : unitType === 'H' ? value : value / 60
        }
        const intervalMultiplier = unit === 'W' ? parseInterval(intervalLength) : 1

        mergedData = mergedData.map((current, idx) => {
          const yearAgoReading = readings[idx]
          const power = yearAgoReading?.value
            ? (parseFloat(yearAgoReading.value) * intervalMultiplier) / 1000
            : null
          return {
            ...current,
            powerYearAgo: power
          }
        })
        logger.log('✅ Year-1 data added successfully')
      } else {
        logger.log('⚠️ No year-1 data found in cache for date:', yearAgoDateStr)
      }
    }

    return mergedData
  }

  const renderCalendar = () => {
    // Use UTC for all calendar calculations
    const todayUTC = new Date()
    const yesterdayUTC = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate() - 1,
      0, 0, 0, 0
    ))

    const currentMonth = viewMonth.getMonth()
    const currentYear = viewMonth.getFullYear()

    const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
    const startingDayOfWeek = firstDayOfMonth.getDay()
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()

    const calendarDays = []
    const totalCells = Math.ceil((startingDayOfWeek + daysInMonth) / 7) * 7

    for (let i = 0; i < totalCells; i++) {
      const dayNumber = i - startingDayOfWeek + 1
      const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth
      const dayDate = isValidDay ? new Date(Date.UTC(currentYear, currentMonth, dayNumber, 0, 0, 0, 0)) : null

      const twoYearsAgoUTC = new Date(Date.UTC(
        yesterdayUTC.getUTCFullYear() - 2,
        yesterdayUTC.getUTCMonth(),
        yesterdayUTC.getUTCDate(),
        0, 0, 0, 0
      ))
      const isInRange = dayDate && dayDate <= yesterdayUTC && dayDate >= twoYearsAgoUTC

      // Check if data exists for this day
      let hasData = false
      if (isInRange && dayDate && selectedPDL) {
        const dateStr = dayDate.getFullYear() + '-' +
                       String(dayDate.getMonth() + 1).padStart(2, '0') + '-' +
                       String(dayDate.getDate()).padStart(2, '0')

        // Get all detail data from unified cache key
        const cachedData = queryClient.getQueryData(['consumptionDetail', selectedPDL]) as any

        if (cachedData?.data?.meter_reading?.interval_reading) {
          // Check if any readings exist for this specific date
          const readings = cachedData.data.meter_reading.interval_reading
          hasData = readings.some((reading: any) => {
            if (!reading.date) return false
            const readingDate = reading.date.split(' ')[0].split('T')[0]
            return readingDate === dateStr
          })
        }
      }

      // Calculate currently selected date in UTC
      const currentSelectedDateUTC = new Date(Date.UTC(
        yesterdayUTC.getUTCFullYear(),
        yesterdayUTC.getUTCMonth(),
        yesterdayUTC.getUTCDate() - (detailWeekOffset * 7) - selectedDetailDay,
        0, 0, 0, 0
      ))
      const isSelected = dayDate &&
        dayDate.getUTCDate() === currentSelectedDateUTC.getUTCDate() &&
        dayDate.getUTCMonth() === currentSelectedDateUTC.getUTCMonth() &&
        dayDate.getUTCFullYear() === currentSelectedDateUTC.getUTCFullYear()

      calendarDays.push({
        dayNumber,
        isValidDay,
        isInRange,
        hasData,
        isSelected,
        date: dayDate
      })
    }

    return (
      <>
        <button
          onClick={() => setShowDatePicker(false)}
          className="absolute -top-2 -right-2 p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shadow-md"
        >
          <svg className="w-4 h-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setViewMonth(new Date(currentYear, currentMonth - 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {viewMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </h3>
          <button
            onClick={() => setViewMonth(new Date(currentYear, currentMonth + 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => (
            <div key={i} className="text-center text-xs font-bold uppercase text-gray-600 dark:text-gray-400 py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, i) => (
            <button
              key={i}
              disabled={!day.isValidDay || !day.hasData}
              onClick={() => {
                if (day.date && day.hasData) {
                  // Format clicked date as YYYY-MM-DD for matching
                  const clickedDateStr = day.date.getUTCFullYear() + '-' +
                                        String(day.date.getUTCMonth() + 1).padStart(2, '0') + '-' +
                                        String(day.date.getUTCDate()).padStart(2, '0')

                  // Calculate which week this date belongs to (for loading correct week's data)
                  const daysDiff = Math.floor((yesterdayUTC.getTime() - day.date.getTime()) / (1000 * 60 * 60 * 24))
                  const newWeekOffset = Math.floor(daysDiff / 7)

                  // Find the exact index of this date in the current detailByDayData
                  // detailByDayData is filtered by detailDateRange and sorted newest first
                  const currentDataIndex = detailByDayData.findIndex(d => d.date === clickedDateStr)

                  if (currentDataIndex !== -1) {
                    // Date is already in current week's data, just select it
                    setSelectedDetailDay(currentDataIndex)
                    setShowDatePicker(false)
                    toast.success(`Date sélectionnée : ${day.date.toLocaleDateString('fr-FR')}`)
                  } else {
                    // Date is in a different week, load that week
                    onWeekOffsetChange(newWeekOffset)
                    // Reset to first day of the new week (index 0 = most recent in range)
                    setSelectedDetailDay(0)
                    setShowDatePicker(false)
                    toast.success(`Chargement des données...`)
                  }
                }
              }}
              title={day.isValidDay && day.isInRange && !day.hasData ? 'Aucune donnée disponible pour ce jour' : ''}
              className={`
                aspect-square p-2 rounded-lg text-sm font-medium transition-all duration-200
                ${!day.isValidDay ? 'invisible' : ''}
                ${day.isValidDay && !day.hasData ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-40' : ''}
                ${day.isValidDay && day.hasData && !day.isSelected ? 'text-gray-700 dark:text-gray-300 hover:bg-primary-100 dark:hover:bg-primary-900/30 cursor-pointer' : ''}
                ${day.isSelected ? 'bg-primary-600 text-white font-bold shadow-lg scale-105' : ''}
              `}
            >
              {day.isValidDay ? day.dayNumber : ''}
            </button>
          ))}
        </div>
      </>
    )
  }

  return (
    <div>
      {/* Date selector - hidden on small screens (mobile), visible on sm and up */}
      <div className="hidden sm:block mb-4 bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-xl border border-primary-200 dark:border-primary-800 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="text-primary-600 dark:text-primary-400 flex-shrink-0" size={24} />
            <label className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
              Sélectionner une date :
            </label>
          </div>

          {/* Date display button - enlarged */}
          <div className="relative flex-1">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="w-full px-4 py-3 rounded-xl border-2 border-primary-300 dark:border-primary-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 cursor-pointer hover:border-primary-400 dark:hover:border-primary-600 text-center"
            >
              {(() => {
                if (!detailDateRange || !detailByDayData[selectedDetailDay]) return 'Sélectionner...'
                // Use the actual date from the selected day data
                const selectedDate = new Date(detailByDayData[selectedDetailDay].date + 'T00:00:00')
                return selectedDate.toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })
              })()}
            </button>

            {/* Custom date picker dropdown */}
            {showDatePicker && (
              <>
                {/* Overlay to close on outside click */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowDatePicker(false)}
                />
                <div className="absolute left-0 z-50 mt-2 w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl border-2 border-primary-300 dark:border-primary-700 p-6">
                  {renderCalendar()}
                </div>
              </>
            )}
          </div>

          {/* Quick access buttons - responsive grid on mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:flex lg:items-center lg:gap-3 lg:flex-shrink-0">
            <ModernButton
              variant="secondary"
              size="md"
              onClick={() => {
                onWeekOffsetChange(0)
                setSelectedDetailDay(0)
                toast.success("Retour à la veille")
              }}
              className="w-full sm:w-auto"
            >
              Hier
            </ModernButton>
            <ModernButton
              variant="secondary"
              size="md"
              onClick={() => {
                onWeekOffsetChange(1)
                setSelectedDetailDay(0)
                toast.success("Semaine dernière sélectionnée")
              }}
              className="w-full sm:w-auto"
            >
              Semaine dernière
            </ModernButton>
            <ModernButton
              variant="secondary"
              size="md"
              onClick={() => {
                const weeksInYear = 52
                onWeekOffsetChange(weeksInYear)
                setSelectedDetailDay(0)
                toast.success("Il y a un an sélectionné")
              }}
              className="w-full sm:w-auto"
            >
              Il y a un an
            </ModernButton>
          </div>
        </div>
      </div>

      {/* Day selector tabs with navigation and export button - hidden on smaller screens */}
      <div className="hidden lg:flex lg:flex-row lg:items-center lg:justify-between gap-2 mb-4">
        {/* Left side: navigation and tabs */}
        <div className="flex items-center gap-2 flex-1 overflow-x-auto overflow-y-hidden py-3 px-2 no-scrollbar">
          {/* Left button */}
          <button
            onClick={() => {
              if (selectedDetailDay === 0 && detailWeekOffset > 0) {
                onWeekOffsetChange(Math.max(0, detailWeekOffset - 1))
                setSelectedDetailDay(999)
                toast.success('Chargement de la semaine suivante...')
              } else if (selectedDetailDay > 0) {
                setSelectedDetailDay(prev => prev - 1)
              }
            }}
            disabled={(selectedDetailDay === 0 && detailWeekOffset === 0) || isLoadingDetail}
            className="flex-shrink-0 p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={selectedDetailDay === 0 && detailWeekOffset > 0 ? "Semaine suivante (plus récente)" : "Jour suivant (plus récent)"}
          >
            {isLoadingDetail && selectedDetailDay === 0 ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            )}
          </button>

          {/* Tabs container */}
          <div className="flex-1 flex gap-2 overflow-hidden">
            {detailByDayData.map((dayData, idx) => {
              const date = new Date(dayData.date)
              const dayLabel = date.toLocaleDateString('fr-FR', {
                weekday: 'short',
                day: '2-digit',
                month: 'short'
              })

              return (
                <button
                  key={dayData.date}
                  onClick={() => setSelectedDetailDay(idx)}
                  className={`flex-1 px-4 py-3 font-medium transition-colors rounded-lg ${
                    selectedDetailDay === idx
                      ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/30'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm whitespace-nowrap">{dayLabel}</span>
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {dayData.totalEnergyKwh.toFixed(2)} kWh
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Right button */}
          <button
            onClick={() => {
              if (selectedDetailDay === detailByDayData.length - 1) {
                onWeekOffsetChange(detailWeekOffset + 1)
                setSelectedDetailDay(0)
              } else {
                setSelectedDetailDay(prev => prev + 1)
              }
            }}
            disabled={isLoadingDetail}
            className="flex-shrink-0 p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={selectedDetailDay === detailByDayData.length - 1 ? "Semaine précédente (plus ancienne)" : "Jour précédent (plus ancien)"}
          >
            {isLoadingDetail && selectedDetailDay === detailByDayData.length - 1 ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Right side: Comparison and Export buttons */}
        <div className="flex items-center gap-2 justify-end flex-wrap">
          <button
            onClick={() => {
              if (yearComparisonAvailable) {
                setShowDetailYearComparison(!showDetailYearComparison)
              }
            }}
            disabled={!yearComparisonAvailable}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 shadow-sm ${
              showDetailYearComparison && yearComparisonAvailable
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md'
                : !yearComparisonAvailable
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-300 dark:border-gray-600 cursor-not-allowed opacity-50'
                : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
            }`}
          >
            <CalendarRange size={16} className="flex-shrink-0" />
            <span>Année -1</span>
          </button>
          <button
            onClick={() => {
              if (weekComparisonAvailable) {
                setShowDetailWeekComparison(!showDetailWeekComparison)
              }
            }}
            disabled={!weekComparisonAvailable}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 shadow-sm ${
              showDetailWeekComparison && weekComparisonAvailable
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md'
                : !weekComparisonAvailable
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-300 dark:border-gray-600 cursor-not-allowed opacity-50'
                : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
            }`}
          >
            <CalendarDays size={16} className="flex-shrink-0" />
            <span>Semaine -1</span>
          </button>
          <ModernButton
            variant="gradient"
            size="sm"
            icon={Download}
            iconPosition="left"
            onClick={handleExport}
          >
            Export JSON
          </ModernButton>
        </div>
      </div>

      {/* Smaller screens: Comparison and Export buttons - centered */}
      <div className="lg:hidden flex items-center gap-2 justify-center flex-wrap mb-4">
        <button
          onClick={() => {
            if (yearComparisonAvailable) {
              setShowDetailYearComparison(!showDetailYearComparison)
            }
          }}
          disabled={!yearComparisonAvailable}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 shadow-sm ${
            showDetailYearComparison && yearComparisonAvailable
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md'
              : !yearComparisonAvailable
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-300 dark:border-gray-600 cursor-not-allowed opacity-50'
              : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
          }`}
        >
          <CalendarRange size={16} className="flex-shrink-0" />
          <span>Année -1</span>
        </button>
        <button
          onClick={() => {
            if (weekComparisonAvailable) {
              setShowDetailWeekComparison(!showDetailWeekComparison)
            }
          }}
          disabled={!weekComparisonAvailable}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 shadow-sm ${
            showDetailWeekComparison && weekComparisonAvailable
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md'
              : !weekComparisonAvailable
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-300 dark:border-gray-600 cursor-not-allowed opacity-50'
              : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
          }`}
        >
          <CalendarDays size={16} className="flex-shrink-0" />
          <span>Semaine -1</span>
        </button>
        <ModernButton
          variant="gradient"
          size="sm"
          icon={Download}
          iconPosition="left"
          onClick={handleExport}
        >
          Export JSON
        </ModernButton>
      </div>

      {/* Graph */}
      <div className="relative">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600 min-h-[500px]">
          {detailByDayData.length > 0 && detailByDayData[selectedDetailDay] ? (
            <>
              <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                {detailByDayData[selectedDetailDay].data.length} points de mesure pour cette journée
              </div>
              {/* Warning message if viewing yesterday (J-1) and no data yet */}
              {(() => {
                // Calculate yesterday in UTC
                const todayUTC = new Date()
                const yesterdayUTC = new Date(Date.UTC(
                  todayUTC.getUTCFullYear(),
                  todayUTC.getUTCMonth(),
                  todayUTC.getUTCDate() - 1,
                  0, 0, 0, 0
                ))

                // Get the actual date from the data (parse as UTC)
                const dateStr = detailByDayData[selectedDetailDay].date
                const [year, month, day] = dateStr.split('-').map(Number)
                const selectedDataDateUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))

                // Check if selected date is J-1 (yesterday)
                const isYesterday = selectedDataDateUTC.getTime() === yesterdayUTC.getTime()

                // Check if we have data (less than expected 48 points for a full day)
                const hasIncompleteData = detailByDayData[selectedDetailDay].data.length < 40

                if (isYesterday && hasIncompleteData) {
                  return (
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        <strong>ℹ️ Information :</strong> Les données de la veille (J-1) sont disponibles au plus tard à 11h le lendemain. Si vous ne voyez pas encore les données complètes, elles seront mises à jour automatiquement dans les prochaines heures.
                      </p>
                    </div>
                  )
                }
                return null
              })()}
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={getComparisonData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
                  <XAxis
                    dataKey="time"
                    stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                    style={{ fontSize: '11px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                    style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                    label={{ value: 'Puissance (kW)', angle: -90, position: 'insideLeft', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                    domain={[0, 'auto']}
                  />
                  <Tooltip
                    cursor={{ stroke: '#3B82F6', strokeWidth: 2 }}
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#F9FAFB'
                    }}
                    formatter={(value: number, _name: string, props: any) => {
                      const dataPoint = props.payload
                      if (!dataPoint) return [`${value.toFixed(3)} kW`, 'Puissance moyenne']

                      return [
                        <div key="tooltip-content" className="flex flex-col gap-1">
                          <div className="font-semibold">{dataPoint.power.toFixed(3)} kW</div>
                          <div className="text-xs text-gray-400">
                            Énergie: {dataPoint.energyKwh.toFixed(4)} kWh
                          </div>
                        </div>,
                        'Puissance moyenne'
                      ]
                    }}
                    labelFormatter={(label) => `Heure: ${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="power"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={{ fill: '#3B82F6', r: 3 }}
                    activeDot={{ r: 6 }}
                    name="Consommation (kW)"
                  />
                  {showDetailWeekComparison && (
                    <Line
                      type="monotone"
                      dataKey="powerWeekAgo"
                      stroke="#10B981"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Semaine -1 (kW)"
                    />
                  )}
                  {showDetailYearComparison && (
                    <Line
                      type="monotone"
                      dataKey="powerYearAgo"
                      stroke="#F59E0B"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Année -1 (kW)"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div className="flex items-center justify-center h-[468px]">
              <div className="flex flex-col items-center justify-center gap-4 text-center px-6">
                <BarChart3 className="text-gray-400 dark:text-gray-600" size={48} />
                <p className="text-gray-600 dark:text-gray-400">
                  Aucune donnée détaillée disponible pour cette période
                </p>
                {detailDateRange && (
                  <>
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      Période demandée : du {new Date(detailDateRange.start).toLocaleDateString('fr-FR')} au {new Date(detailDateRange.end).toLocaleDateString('fr-FR')}
                    </p>
                    {/* Check if we're looking at yesterday (J-1) */}
                    {(() => {
                      if (!detailDateRange) return null

                      // Calculate yesterday in UTC
                      const todayUTC = new Date()
                      const yesterdayUTC = new Date(Date.UTC(
                        todayUTC.getUTCFullYear(),
                        todayUTC.getUTCMonth(),
                        todayUTC.getUTCDate() - 1,
                        0, 0, 0, 0
                      ))

                      // Parse the date range to check if we're viewing yesterday (parse as UTC)
                      const startParts = detailDateRange.start.split('-').map(Number)
                      const startDateUTC = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0))

                      const endParts = detailDateRange.end.split('-').map(Number)
                      const endDateUTC = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2], 0, 0, 0, 0))

                      // Check if the range includes yesterday
                      const isYesterday = (startDateUTC.getTime() <= yesterdayUTC.getTime()) && (yesterdayUTC.getTime() <= endDateUTC.getTime())

                      if (isYesterday) {
                        return (
                          <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg max-w-md">
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                              <strong>ℹ️ Information :</strong> Les données de la veille (J-1) sont disponibles au plus tard à 11h le lendemain. Si vous ne voyez pas encore les données, elles seront mises à jour automatiquement dans les prochaines heures.
                            </p>
                          </div>
                        )
                      }
                      return null
                    })()}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Loading overlay */}
        {isLoadingDetail && (
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-lg flex items-center justify-center">
            <div className="flex flex-col items-center justify-center gap-4 p-8">
              <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={48} />
              <p className="text-gray-900 dark:text-white font-semibold text-center">
                Chargement des données détaillées...
              </p>
              {detailDateRange && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Du {new Date(detailDateRange.start).toLocaleDateString('fr-FR')} au {new Date(detailDateRange.end).toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
