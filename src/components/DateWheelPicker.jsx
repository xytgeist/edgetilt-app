/**
 * iOS-style scroll-wheel date picker (react-mobile-picker).
 * Renders as a tappable display → opens wheel on tap.
 *
 * Props:
 *   value    - "YYYY-MM-DD" string or ''
 *   onChange - fn(string) called with "YYYY-MM-DD"
 *   showYear - show year column (default false; month+day fits narrow grids)
 */
import { useState, useEffect, useMemo } from 'react'
import Picker from 'react-mobile-picker'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function daysInMonth(monthIdx, year) {
  return new Date(year, monthIdx + 1, 0).getDate()
}

function nowParts() {
  const d = new Date()
  return { month: MONTHS[d.getMonth()], day: String(d.getDate()), year: String(d.getFullYear()) }
}

function partsFrom(yyyymmdd) {
  if (!yyyymmdd) return nowParts()
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  return { month: MONTHS[m - 1], day: String(d), year: String(y) }
}

function toYYYYMMDD({ month, day, year }) {
  const m = MONTHS.indexOf(month) + 1
  const d = Number(day)
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function displayLabel(yyyymmdd, showYear = false) {
  if (!yyyymmdd) return null
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const opts = showYear
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' }
  return date.toLocaleDateString('en-US', opts)
}

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 8 }, (_, i) => String(currentYear - 7 + i))

export default function DateWheelPicker({ value, onChange, showYear = false }) {
  const [open, setOpen] = useState(false)
  const [pickerValue, setPickerValue] = useState(() => partsFrom(value))

  useEffect(() => {
    if (!value) onChange(toYYYYMMDD(nowParts()))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (value) setPickerValue(partsFrom(value))
  }, [value])

  const days = useMemo(() => {
    const monthIdx = MONTHS.indexOf(pickerValue.month)
    const year = Number(pickerValue.year)
    const count = daysInMonth(monthIdx >= 0 ? monthIdx : 0, year || currentYear)
    return Array.from({ length: count }, (_, i) => String(i + 1))
  }, [pickerValue.month, pickerValue.year])

  const handleChange = (next) => {
    const monthIdx = MONTHS.indexOf(next.month)
    const year = Number(next.year)
    const maxDay = daysInMonth(monthIdx >= 0 ? monthIdx : 0, year || currentYear)
    const clampedDay = String(Math.min(Number(next.day), maxDay))
    const resolved = { ...next, day: clampedDay }
    setPickerValue(resolved)
    onChange(toYYYYMMDD(resolved))
  }

  const label = displayLabel(value, showYear) ?? displayLabel(toYYYYMMDD(nowParts()), showYear)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-left flex items-center justify-between touch-manipulation"
      >
        <span className="text-white font-semibold text-sm">{label}</span>
        <span className={`text-zinc-500 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="mt-2 rounded-2xl bg-zinc-800 overflow-hidden">
          <div className="relative px-1 py-2">
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[30px] -translate-y-1/2 rounded-full bg-zinc-600/50" />
            <Picker
              className="offers-time-wheel"
              value={pickerValue}
              onChange={handleChange}
              height={170}
              itemHeight={44}
              wheelMode="natural"
            >
              <Picker.Column name="month">
                {MONTHS.map(m => (
                  <Picker.Item key={m} value={m}>
                    {({ selected }) => (
                      <div className={`text-center text-lg ${selected ? 'text-white font-semibold' : 'text-zinc-500'}`}>{m}</div>
                    )}
                  </Picker.Item>
                ))}
              </Picker.Column>
              <Picker.Column name="day">
                {days.map(d => (
                  <Picker.Item key={d} value={d}>
                    {({ selected }) => (
                      <div className={`text-center text-lg ${selected ? 'text-white font-semibold' : 'text-zinc-500'}`}>{d}</div>
                    )}
                  </Picker.Item>
                ))}
              </Picker.Column>
              {showYear && (
                <Picker.Column name="year">
                  {YEARS.map(y => (
                    <Picker.Item key={y} value={y}>
                      {({ selected }) => (
                        <div className={`text-center text-lg ${selected ? 'text-white font-semibold' : 'text-zinc-500'}`}>{y}</div>
                      )}
                    </Picker.Item>
                  ))}
                </Picker.Column>
              )}
            </Picker>
          </div>
        </div>
      )}
    </div>
  )
}
