import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Calendar, Download, BarChart3, Loader2, CalendarDays, CalendarRange } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'

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

    // Calculate current date
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const currentDate = new Date(yesterday)
    currentDate.setDate(yesterday.getDate() - (detailWeekOffset * 7) - selectedDetailDay)

    // Check week-1 availability
    const weekAgoDate = new Date(currentDate)
    weekAgoDate.setDate(currentDate.getDate() - 7)
    const weekAgoDateStr = weekAgoDate.getUTCFullYear() + '-' +
                          String(weekAgoDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                          String(weekAgoDate.getUTCDate()).padStart(2, '0')

    const weekAgoData = queryClient.getQueryData(['consumptionDetail', selectedPDL, weekAgoDateStr, weekAgoDateStr]) as any
    const weekAvailable = !!weekAgoData?.data?.meter_reading?.interval_reading
    setWeekComparisonAvailable(weekAvailable)
    // Reset comparison toggle if data becomes unavailable
    if (!weekAvailable && showDetailWeekComparison) {
      setShowDetailWeekComparison(false)
    }

    // Check year-1 availability
    const yearAgoDate = new Date(currentDate)
    yearAgoDate.setFullYear(yearAgoDate.getFullYear() - 1)
    const yearAgoDateStr = yearAgoDate.getUTCFullYear() + '-' +
                          String(yearAgoDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                          String(yearAgoDate.getUTCDate()).padStart(2, '0')

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

    // Calculate current date
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const currentDate = new Date(yesterday)
    currentDate.setDate(yesterday.getDate() - (detailWeekOffset * 7) - selectedDetailDay)

    // Add week -1 comparison
    if (showDetailWeekComparison && selectedPDL) {
      const weekAgoDate = new Date(currentDate)
      weekAgoDate.setDate(currentDate.getDate() - 7)

      // Format date for cache key
      const weekAgoDateStr = weekAgoDate.getUTCFullYear() + '-' +
                            String(weekAgoDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                            String(weekAgoDate.getUTCDate()).padStart(2, '0')

      console.log('🔍 Looking for week-1 data:', {
        currentDate: currentDate.toISOString().split('T')[0],
        weekAgoDate: weekAgoDateStr,
        selectedPDL
      })

      // Try to get data for the specific day from cache
      const weekAgoData = queryClient.getQueryData(['consumptionDetail', selectedPDL, weekAgoDateStr, weekAgoDateStr]) as any

      if (weekAgoData?.data?.meter_reading?.interval_reading) {
        console.log('✅ Found week-1 data in cache!')
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
        console.log('✅ Week-1 data added successfully')
      } else {
        console.log('⚠️ No week-1 data found in cache for date:', weekAgoDateStr)
      }
    }

    // Add year -1 comparison
    if (showDetailYearComparison && selectedPDL) {
      const yearAgoDate = new Date(currentDate)
      yearAgoDate.setFullYear(yearAgoDate.getFullYear() - 1)

      // Format date for cache key
      const yearAgoDateStr = yearAgoDate.getUTCFullYear() + '-' +
                            String(yearAgoDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                            String(yearAgoDate.getUTCDate()).padStart(2, '0')

      console.log('🔍 Looking for year-1 data:', {
        currentDate: currentDate.toISOString().split('T')[0],
        yearAgoDate: yearAgoDateStr,
        selectedPDL
      })

      // Try to get data for the specific day from cache
      const yearAgoData = queryClient.getQueryData(['consumptionDetail', selectedPDL, yearAgoDateStr, yearAgoDateStr]) as any

      if (yearAgoData?.data?.meter_reading?.interval_reading) {
        console.log('✅ Found year-1 data in cache!')
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
        console.log('✅ Year-1 data added successfully')
      } else {
        console.log('⚠️ No year-1 data found in cache for date:', yearAgoDateStr)
      }
    }

    return mergedData
  }

  const renderCalendar = () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)

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
      const dayDate = isValidDay ? new Date(currentYear, currentMonth, dayNumber) : null

      const twoYearsAgo = new Date(yesterday)
      twoYearsAgo.setFullYear(yesterday.getFullYear() - 2)
      const isInRange = dayDate && dayDate <= yesterday && dayDate >= twoYearsAgo

      const currentSelectedDate = new Date(yesterday)
      currentSelectedDate.setDate(yesterday.getDate() - (detailWeekOffset * 7) - selectedDetailDay)
      const isSelected = dayDate &&
        dayDate.getDate() === currentSelectedDate.getDate() &&
        dayDate.getMonth() === currentSelectedDate.getMonth() &&
        dayDate.getFullYear() === currentSelectedDate.getFullYear()

      calendarDays.push({
        dayNumber,
        isValidDay,
        isInRange,
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
              disabled={!day.isValidDay || !day.isInRange}
              onClick={() => {
                if (day.date && day.isInRange) {
                  const daysDiff = Math.floor((yesterday.getTime() - day.date.getTime()) / (1000 * 60 * 60 * 24))
                  const newWeekOffset = Math.floor(daysDiff / 7)
                  const newDayIndex = daysDiff % 7
                  onWeekOffsetChange(newWeekOffset)
                  setSelectedDetailDay(newDayIndex)
                  setShowDatePicker(false)
                  toast.success(`Date sélectionnée : ${day.date.toLocaleDateString('fr-FR')}`)
                }
              }}
              className={`
                aspect-square p-2 rounded-lg text-sm font-medium transition-all duration-200
                ${!day.isValidDay ? 'invisible' : ''}
                ${day.isValidDay && !day.isInRange ? 'text-gray-300 dark:text-gray-700 cursor-not-allowed' : ''}
                ${day.isValidDay && day.isInRange && !day.isSelected ? 'text-gray-700 dark:text-gray-300 hover:bg-primary-100 dark:hover:bg-primary-900/30 cursor-pointer' : ''}
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
      {/* Date selector - full width block with blue background, single line */}
      <div className="mb-4 bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-xl border border-primary-200 dark:border-primary-800 p-4">
        <div className="flex items-center gap-3">
          <Calendar className="text-primary-600 dark:text-primary-400 flex-shrink-0" size={24} />
          <label className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
            Sélectionner une date :
          </label>

          {/* Date display button - enlarged */}
          <div className="relative flex-1">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="w-full px-4 py-3 rounded-xl border-2 border-primary-300 dark:border-primary-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 cursor-pointer hover:border-primary-400 dark:hover:border-primary-600 text-center"
            >
              {(() => {
                if (!detailDateRange) return 'Sélectionner...'
                const today = new Date()
                const yesterday = new Date(today)
                yesterday.setDate(today.getDate() - 1)
                const selectedDate = new Date(yesterday)
                selectedDate.setDate(yesterday.getDate() - (detailWeekOffset * 7) - selectedDetailDay)
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

          {/* Quick access buttons - enlarged and better distributed */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => {
                onWeekOffsetChange(0)
                setSelectedDetailDay(0)
                toast.success("Retour à aujourd'hui")
              }}
              className="px-6 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium border border-gray-300 dark:border-gray-600 transition-colors whitespace-nowrap"
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => {
                onWeekOffsetChange(1)
                setSelectedDetailDay(0)
                toast.success("Semaine dernière sélectionnée")
              }}
              className="px-6 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium border border-gray-300 dark:border-gray-600 transition-colors whitespace-nowrap"
            >
              Semaine dernière
            </button>
            <button
              onClick={() => {
                const weeksInYear = 52
                onWeekOffsetChange(weeksInYear)
                setSelectedDetailDay(0)
                toast.success("Il y a un an sélectionné")
              }}
              className="px-6 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium border border-gray-300 dark:border-gray-600 transition-colors whitespace-nowrap"
            >
              Il y a un an
            </button>
          </div>
        </div>
      </div>

      {/* Day selector tabs with navigation and export button */}
      <div className="flex items-center justify-between gap-2 mb-4">
        {/* Left side: navigation and tabs */}
        <div className="flex items-center gap-2 flex-1">
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
        <div className="flex items-center gap-2">
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
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 transform hover:scale-105"
          >
            <Download size={16} className="flex-shrink-0" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Graph */}
      <div className="relative">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600 min-h-[500px]">
          {detailByDayData.length > 0 && detailByDayData[selectedDetailDay] ? (
            <>
              <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                {detailByDayData[selectedDetailDay].data.length} points de mesure pour cette journée
              </div>
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
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <BarChart3 className="text-gray-400 dark:text-gray-600" size={48} />
                <p className="text-gray-600 dark:text-gray-400">
                  Aucune donnée détaillée disponible pour cette période
                </p>
                {detailDateRange && (
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Période demandée : du {new Date(detailDateRange.start).toLocaleDateString('fr-FR')} au {new Date(detailDateRange.end).toLocaleDateString('fr-FR')}
                  </p>
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
