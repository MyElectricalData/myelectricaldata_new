import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'
import { Calendar, ChevronDown } from 'lucide-react'
import 'react-day-picker/style.css'

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onRangeChange: (start: string, end: string) => void
  disabled?: boolean
  minDate?: string // Earliest date with available data (YYYY-MM-DD)
}

type ActivePicker = 'start' | 'end' | null

export function DateRangePicker({ startDate, endDate, onRangeChange, disabled, minDate }: DateRangePickerProps) {
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
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '---'
    return format(new Date(dateStr), 'dd MMM yyyy', { locale: fr })
  }

  // Calculate max date (yesterday)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const pickerStyles = `
    .date-picker-container {
      --rdp-accent-color: #7c3aed !important;
      --rdp-accent-background-color: #7c3aed !important;
      --rdp-selected-color: #ffffff !important;
      --rdp-selected-border: 2px solid #7c3aed !important;
    }
    .date-picker-container .rdp-today:not(.rdp-selected) .rdp-day_button {
      border: 2px solid #3b82f6 !important;
      border-radius: 9999px;
    }
    .date-picker-container .rdp-today.rdp-disabled .rdp-day_button {
      color: #9ca3af !important;
      border-color: #d1d5db !important;
    }
    .date-picker-container .rdp-selected .rdp-day_button {
      border: 2px solid #3b82f6 !important;
    }
    .date-picker-container .rdp-button_previous,
    .date-picker-container .rdp-button_next {
      color: #3b82f6 !important;
    }
    .date-picker-container .rdp-chevron {
      fill: #3b82f6 !important;
    }
    .date-picker-container .rdp-button_previous:hover,
    .date-picker-container .rdp-button_next:hover {
      background-color: #ede9fe !important;
    }
    .dark .date-picker-container {
      --rdp-accent-color: #a78bfa !important;
      --rdp-accent-background-color: #7c3aed !important;
      --rdp-selected-border: 2px solid #a78bfa !important;
      --rdp-day-color: #f3f4f6;
      --rdp-month-caption-color: #f3f4f6;
      --rdp-weekday-color: #9ca3af;
      --rdp-outside-color: #6b7280;
      --rdp-disabled-color: #4b5563;
      --rdp-selected-color: #ffffff !important;
    }
    .dark .date-picker-container .rdp-today:not(.rdp-selected) .rdp-day_button {
      border: 2px solid #60a5fa !important;
      border-radius: 9999px;
    }
    .dark .date-picker-container .rdp-today.rdp-disabled .rdp-day_button {
      color: #6b7280 !important;
      border-color: #4b5563 !important;
    }
    .dark .date-picker-container .rdp-selected .rdp-day_button {
      border: 2px solid #60a5fa !important;
    }
    .dark .date-picker-container .rdp-button_previous,
    .dark .date-picker-container .rdp-button_next {
      color: #60a5fa !important;
    }
    .dark .date-picker-container .rdp-chevron {
      fill: #60a5fa !important;
    }
    .dark .date-picker-container .rdp-button_previous:hover,
    .dark .date-picker-container .rdp-button_next:hover {
      background-color: #374151 !important;
    }
    .dark .date-picker-container button:hover:not([disabled]) {
      background-color: #374151;
    }
  `

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <style>{pickerStyles}</style>

      {/* Start date picker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setActivePicker(activePicker === 'start' ? null : 'start')}
          disabled={disabled}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-xl
            bg-white dark:bg-gray-800
            border border-gray-300 dark:border-gray-600
            text-gray-900 dark:text-gray-100
            hover:border-primary-500 dark:hover:border-primary-400
            focus:outline-none focus:ring-2 focus:ring-primary-500
            transition-all duration-200
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            ${activePicker === 'start' ? 'ring-2 ring-primary-500 border-primary-500' : ''}
          `}
        >
          <Calendar size={16} className="text-primary-600 dark:text-primary-400" />
          <span className="text-sm font-medium">{formatDate(startDate)}</span>
          <ChevronDown
            size={14}
            className={`text-gray-400 transition-transform duration-200 ${activePicker === 'start' ? 'rotate-180' : ''}`}
          />
        </button>

        {activePicker === 'start' && (
          <div className="absolute z-50 mt-2 left-0 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="date-picker-container bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-3">
              <DayPicker
                mode="single"
                selected={startDate ? new Date(startDate) : undefined}
                onSelect={handleStartSelect}
                locale={fr}
                disabled={[
                  { after: endDate ? new Date(endDate) : yesterday },
                  ...(minDate ? [{ before: new Date(minDate) }] : [])
                ]}
                defaultMonth={startDate ? new Date(startDate) : new Date()}
              />
            </div>
          </div>
        )}
      </div>

      <span className="text-gray-500 dark:text-gray-400 text-sm">→</span>

      {/* End date picker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setActivePicker(activePicker === 'end' ? null : 'end')}
          disabled={disabled}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-xl
            bg-white dark:bg-gray-800
            border border-gray-300 dark:border-gray-600
            text-gray-900 dark:text-gray-100
            hover:border-primary-500 dark:hover:border-primary-400
            focus:outline-none focus:ring-2 focus:ring-primary-500
            transition-all duration-200
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            ${activePicker === 'end' ? 'ring-2 ring-primary-500 border-primary-500' : ''}
          `}
        >
          <Calendar size={16} className="text-primary-600 dark:text-primary-400" />
          <span className="text-sm font-medium">{formatDate(endDate)}</span>
          <ChevronDown
            size={14}
            className={`text-gray-400 transition-transform duration-200 ${activePicker === 'end' ? 'rotate-180' : ''}`}
          />
        </button>

        {activePicker === 'end' && (
          <div className="absolute z-50 mt-2 right-0 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="date-picker-container bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-3">
              <DayPicker
                mode="single"
                selected={endDate ? new Date(endDate) : undefined}
                onSelect={handleEndSelect}
                locale={fr}
                disabled={[
                  ...(startDate ? [{ before: new Date(startDate) }] : minDate ? [{ before: new Date(minDate) }] : []),
                  { after: yesterday }
                ]}
                defaultMonth={endDate ? new Date(endDate) : new Date()}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
