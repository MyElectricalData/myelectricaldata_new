import { useState, useRef, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'
import { Info } from 'lucide-react'
import 'react-day-picker/style.css'

// Create a custom French locale with capitalized month names
const frCapitalized = {
  ...fr,
  localize: {
    ...fr.localize,
    month: (n: number) => {
      const months = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
      ]
      return months[n]
    }
  }
}

interface PeriodSelectorProps {
  startDate: string
  endDate: string
  onRangeChange: (start: string, end: string) => void
  disabled?: boolean
  minDate?: string
  availableDates?: Set<string> // Dates with cached data (YYYY-MM-DD format)
  shortcuts?: Array<{
    label: string
    onClick: () => void
    active?: boolean
    tooltip?: string
  }>
}

type ActivePicker = 'start' | 'end' | null

export function PeriodSelector({
  startDate,
  endDate,
  onRangeChange,
  disabled,
  minDate,
  availableDates,
  shortcuts = []
}: PeriodSelectorProps) {
  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActivePicker(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleStartSelect = (date: Date | undefined) => {
    if (date) {
      const newStart = format(date, 'yyyy-MM-dd')
      onRangeChange(newStart, endDate)
      setActivePicker(null)
    }
  }

  const handleEndSelect = (date: Date | undefined) => {
    if (date) {
      const newEnd = format(date, 'yyyy-MM-dd')
      onRangeChange(startDate, newEnd)
      setActivePicker(null)
    }
  }

  // Format display text
  const formatDateLong = (dateStr: string) => {
    if (!dateStr) return '---'
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  // Calculate max date (yesterday)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  // Function to check if a date has no cached data
  const isDateUnavailable = (date: Date): boolean => {
    if (!availableDates || availableDates.size === 0) return false
    const dateStr = format(date, 'yyyy-MM-dd')
    return !availableDates.has(dateStr)
  }

  // Calculate min/max dates from available data
  const { dataStartMonth, dataEndMonth } = useMemo(() => {
    if (!availableDates || availableDates.size === 0) {
      return {
        dataStartMonth: minDate ? new Date(minDate) : new Date(2020, 0),
        dataEndMonth: yesterday
      }
    }

    const sortedDates = Array.from(availableDates).sort()
    const firstDate = new Date(sortedDates[0])
    const lastDate = new Date(sortedDates[sortedDates.length - 1])

    return {
      dataStartMonth: firstDate,
      dataEndMonth: lastDate
    }
  }, [availableDates, minDate, yesterday])

  const pickerStyles = `
    .period-picker-container {
      --rdp-accent-color: #3b82f6 !important;
      --rdp-accent-background-color: #3b82f6 !important;
      --rdp-selected-color: #ffffff !important;
      --rdp-selected-border: 2px solid #3b82f6 !important;
    }
    .period-picker-container .rdp-today:not(.rdp-selected) .rdp-day_button {
      border: 2px solid #3b82f6 !important;
      border-radius: 9999px;
    }
    .period-picker-container .rdp-today.rdp-disabled .rdp-day_button {
      color: #9ca3af !important;
      border-color: #d1d5db !important;
    }
    .period-picker-container .rdp-selected .rdp-day_button {
      border: 2px solid #3b82f6 !important;
    }
    .period-picker-container .rdp-chevron {
      fill: #3b82f6 !important;
    }
    .dark .period-picker-container {
      --rdp-accent-color: #60a5fa !important;
      --rdp-accent-background-color: #3b82f6 !important;
      --rdp-selected-border: 2px solid #60a5fa !important;
      --rdp-day-color: #f3f4f6;
      --rdp-month-caption-color: #f3f4f6;
      --rdp-weekday-color: #9ca3af;
      --rdp-outside-color: #6b7280;
      --rdp-disabled-color: #4b5563;
      --rdp-selected-color: #ffffff !important;
    }
    .dark .period-picker-container .rdp-today:not(.rdp-selected) .rdp-day_button {
      border: 2px solid #60a5fa !important;
      border-radius: 9999px;
    }
    .dark .period-picker-container .rdp-today.rdp-disabled .rdp-day_button {
      color: #6b7280 !important;
      border-color: #4b5563 !important;
    }
    .dark .period-picker-container .rdp-selected .rdp-day_button {
      border: 2px solid #60a5fa !important;
    }
    .dark .period-picker-container .rdp-chevron {
      fill: #60a5fa !important;
    }
    .dark .period-picker-container button:hover:not([disabled]) {
      background-color: #374151;
    }
    /* Caption layout - dropdowns centered */
    .period-picker-container .rdp-month_caption {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
      margin-bottom: 0.75rem;
    }
    .period-picker-container .rdp-dropdowns {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }
    /* Hide navigation - month/year dropdowns are sufficient */
    .period-picker-container .rdp-nav,
    .period-picker-container .rdp-button_previous,
    .period-picker-container .rdp-button_next {
      display: none !important;
    }
    .period-picker-container .rdp-dropdown,
    .period-picker-container .rdp-dropdowns select,
    .period-picker-container select.rdp-dropdown {
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
      padding: 0.375rem 2.5rem 0.375rem 0.75rem;
      border-radius: 0.5rem;
      border: 1px solid #d1d5db;
      background-color: white;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      text-transform: capitalize;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.75rem center;
      background-size: 1rem;
      box-sizing: border-box;
    }
    /* Month dropdown - fixed width */
    .period-picker-container .rdp-months_dropdown,
    .period-picker-container .rdp-dropdown_months,
    .period-picker-container select[name="months"],
    .period-picker-container .rdp-dropdowns select:first-of-type,
    .period-picker-container .rdp-dropdowns > *:first-child,
    .period-picker-container .rdp-dropdowns > *:first-child select {
      width: 140px !important;
      min-width: 140px !important;
      max-width: 140px !important;
      box-sizing: border-box !important;
    }
    /* Year dropdown - fixed width, left align text */
    .period-picker-container .rdp-years_dropdown,
    .period-picker-container .rdp-dropdown_years,
    .period-picker-container select[name="years"],
    .period-picker-container .rdp-dropdowns select:last-of-type,
    .period-picker-container .rdp-dropdowns > *:last-child,
    .period-picker-container .rdp-dropdowns > *:last-child select {
      width: 90px !important;
      min-width: 90px !important;
      max-width: 90px !important;
      box-sizing: border-box !important;
      text-align: left;
      text-align-last: left;
    }
    /* Focus styles - remove ugly outline */
    .period-picker-container .rdp-dropdown:focus,
    .period-picker-container .rdp-dropdowns select:focus,
    .period-picker-container select.rdp-dropdown:focus,
    .period-picker-container select:focus,
    .period-picker-container .rdp-dropdown:active,
    .period-picker-container select:active {
      outline: 0 !important;
      outline-style: none !important;
      outline-width: 0 !important;
      box-shadow: none !important;
      border: 1px solid #3b82f6 !important;
      -webkit-appearance: none;
    }
    .period-picker-container .rdp-dropdown:focus-visible,
    .period-picker-container .rdp-dropdowns select:focus-visible,
    .period-picker-container select.rdp-dropdown:focus-visible,
    .period-picker-container select:focus-visible {
      outline: 0 !important;
      outline-style: none !important;
      box-shadow: none !important;
      border: 1px solid #3b82f6 !important;
    }
    .period-picker-container *:focus {
      outline: none !important;
    }
    .dark .period-picker-container .rdp-dropdown,
    .dark .period-picker-container .rdp-dropdowns select,
    .dark .period-picker-container select.rdp-dropdown {
      background-color: #374151;
      border-color: #4b5563;
      color: #f3f4f6;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
    }
    .dark .period-picker-container .rdp-dropdown:focus,
    .dark .period-picker-container select:focus {
      border-color: #60a5fa !important;
    }
    .dark .period-picker-container .rdp-dropdown option {
      background-color: #374151;
      color: #f3f4f6;
    }
    .period-picker-container .rdp-dropdown option,
    .period-picker-container .rdp-dropdown_months option {
      text-transform: capitalize;
    }
    .period-picker-container .rdp-month_caption {
      text-transform: capitalize;
    }
  `

  return (
    <div ref={containerRef} className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-xl border border-primary-200 dark:border-primary-800 p-4">
      <style>{pickerStyles}</style>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        {/* Date range display */}
        <div className="flex-1 flex items-center gap-2">
          {/* Start date button */}
          <div className="relative flex-1">
            <button
              onClick={() => !disabled && setActivePicker(activePicker === 'start' ? null : 'start')}
              disabled={disabled}
              className={`
                w-full px-4 py-3 rounded-xl border-2
                ${activePicker === 'start'
                  ? 'border-primary-500 ring-2 ring-primary-500'
                  : 'border-primary-300 dark:border-primary-700 hover:border-primary-400 dark:hover:border-primary-600'
                }
                bg-white dark:bg-gray-800
                text-gray-900 dark:text-white font-medium
                focus:outline-none transition-all duration-200
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                text-center text-sm
              `}
            >
              {formatDateLong(startDate)}
            </button>

            {activePicker === 'start' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setActivePicker(null)} />
                <div className="absolute left-0 z-50 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border-2 border-primary-300 dark:border-primary-700 p-4">
                  <div className="period-picker-container">
                    <DayPicker
                      mode="single"
                      captionLayout="dropdown"
                      startMonth={dataStartMonth}
                      endMonth={dataEndMonth}
                      selected={startDate ? new Date(startDate) : undefined}
                      onSelect={handleStartSelect}
                      locale={frCapitalized}
                      disabled={[
                        { after: endDate ? new Date(endDate) : yesterday },
                        ...(minDate ? [{ before: new Date(minDate) }] : []),
                        ...(availableDates && availableDates.size > 0 ? [isDateUnavailable] : [])
                      ]}
                      defaultMonth={startDate ? new Date(startDate) : new Date()}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <span className="text-gray-500 dark:text-gray-400 font-medium">→</span>

          {/* End date button */}
          <div className="relative flex-1">
            <button
              onClick={() => !disabled && setActivePicker(activePicker === 'end' ? null : 'end')}
              disabled={disabled}
              className={`
                w-full px-4 py-3 rounded-xl border-2
                ${activePicker === 'end'
                  ? 'border-primary-500 ring-2 ring-primary-500'
                  : 'border-primary-300 dark:border-primary-700 hover:border-primary-400 dark:hover:border-primary-600'
                }
                bg-white dark:bg-gray-800
                text-gray-900 dark:text-white font-medium
                focus:outline-none transition-all duration-200
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                text-center text-sm
              `}
            >
              {formatDateLong(endDate)}
            </button>

            {activePicker === 'end' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setActivePicker(null)} />
                <div className="absolute right-0 z-50 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border-2 border-primary-300 dark:border-primary-700 p-4">
                  <div className="period-picker-container">
                    <DayPicker
                      mode="single"
                      captionLayout="dropdown"
                      startMonth={dataStartMonth}
                      endMonth={dataEndMonth}
                      selected={endDate ? new Date(endDate) : undefined}
                      onSelect={handleEndSelect}
                      locale={frCapitalized}
                      disabled={[
                        ...(startDate ? [{ before: new Date(startDate) }] : minDate ? [{ before: new Date(minDate) }] : []),
                        { after: yesterday },
                        ...(availableDates && availableDates.size > 0 ? [isDateUnavailable] : [])
                      ]}
                      defaultMonth={endDate ? new Date(endDate) : new Date()}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Shortcuts */}
        {shortcuts.length > 0 && (
          <div className="flex flex-wrap gap-2 lg:flex-shrink-0">
            {shortcuts.map((shortcut, index) => (
              <div key={index} className="relative group">
                <button
                  onClick={shortcut.onClick}
                  disabled={disabled}
                  className={`
                    px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 border flex items-center gap-1.5
                    ${shortcut.active
                      ? 'bg-primary-600 text-white dark:bg-primary-500 border-primary-600 dark:border-primary-500'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  {shortcut.label}
                  {shortcut.tooltip && (
                    <Info size={14} className={shortcut.active ? 'text-white' : 'text-primary-500 dark:text-primary-400'} />
                  )}
                </button>
                {shortcut.tooltip && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:block z-50 pointer-events-none">
                    <div className="bg-gray-900 dark:bg-gray-800 text-white text-sm rounded-lg px-4 py-3 shadow-xl max-w-sm w-max leading-relaxed">
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-transparent border-b-gray-900 dark:border-b-gray-800"></div>
                      {shortcut.tooltip}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
