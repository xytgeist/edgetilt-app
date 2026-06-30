/**
 * iOS-style scroll-wheel time picker (react-mobile-picker).
 * Infinite-ish scroll: repeats hour/minute arrays and recenters silently.
 * Minute carry rolls the hour; hour crossing 11↔12 flips AM/PM.
 *
 * Props:
 *   value    - "HH:MM" 24-hour string or ''
 *   onChange - fn(string) called with "HH:MM" 24-hour
 */
import { useRef, useState, useEffect } from 'react'
import Picker from 'react-mobile-picker'

const HOUR_REPEAT = 9
const HOUR_MID = Math.floor(HOUR_REPEAT / 2)
const MINUTE_REPEAT = 7
const MINUTE_MID = Math.floor(MINUTE_REPEAT / 2)

const HOURS = Array.from({ length: HOUR_REPEAT * 12 }, (_, i) => {
  const rep = Math.floor(i / 12)
  const h = String((i % 12) + 1)
  return { token: `${rep}:${h}`, label: h }
})

const MINUTES = Array.from({ length: MINUTE_REPEAT * 60 }, (_, i) => {
  const rep = Math.floor(i / 60)
  const m = String(i % 60).padStart(2, '0')
  return { token: `${rep}:${m}`, label: m }
})

const PERIODS = ['AM', 'PM']

function nowPickerValue() {
  const now = new Date()
  const hh = now.getHours()
  const mm = now.getMinutes()
  const period = hh < 12 ? 'AM' : 'PM'
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
  return { hour: `${HOUR_MID}:${h12}`, minute: `${MINUTE_MID}:${String(mm).padStart(2, '0')}`, period }
}

function pickerValueFrom24h(hh24) {
  if (!hh24) return nowPickerValue()
  const [hh, mm] = hh24.split(':').map(Number)
  const period = hh < 12 ? 'AM' : 'PM'
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
  return { hour: `${HOUR_MID}:${h12}`, minute: `${MINUTE_MID}:${String(mm).padStart(2, '0')}`, period }
}

function displayLabel(hh24) {
  if (!hh24) return null
  const [hh, mm] = hh24.split(':').map(Number)
  const period = hh < 12 ? 'AM' : 'PM'
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`
}

export default function TimeWheelPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [pickerValue, setPickerValue] = useState(() => pickerValueFrom24h(value))
  const recenterRef = useRef(null)
  const applyRef = useRef(null)

  useEffect(() => {
    if (!value) {
      const pv = nowPickerValue()
      const h12 = Number(pv.hour.split(':')[1])
      const mm = Number(pv.minute.split(':')[1])
      let h24 = h12 % 12
      if (pv.period === 'PM') h24 += 12
      onChange(`${String(h24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (nextValue) => {
    if (recenterRef.current) { window.clearTimeout(recenterRef.current); recenterRef.current = null }
    if (applyRef.current) { window.clearTimeout(applyRef.current); applyRef.current = null }

    const prev = pickerValue
    const [, prevHourRaw] = String(prev.hour).split(':')
    const [prevMinRepRaw, prevMinuteRaw] = String(prev.minute).split(':')
    const [hourRepRaw, hourRawToken] = String(nextValue.hour).split(':')
    const [minRepRaw] = String(nextValue.minute).split(':')
    const minuteRawToken = String(nextValue.minute).split(':')[1]

    let hourRaw = hourRawToken ?? String(nextValue.hour)
    const minuteRaw = minuteRawToken ?? String(nextValue.minute)
    let hourRep = Number(hourRepRaw)
    const minuteRep = Number(minRepRaw)
    let period = nextValue.period
    const periodChangedByUser = nextValue.period !== prev.period

    const prevHourNum = Number(prevHourRaw)

    // ── Minute carry: roll the hour when crossing 59→00 or 00→59 ──────────────
    if (prevMinuteRaw === '59' && minuteRaw === '00') {
      const n = (Number(hourRaw) % 12) + 1
      if (Number.isFinite(hourRep) && n === 1) hourRep += 1
      hourRaw = String(n)
    }
    if (prevMinuteRaw === '00' && minuteRaw === '59') {
      const n = Number(hourRaw) - 1 || 12
      if (Number.isFinite(hourRep) && n === 12) hourRep -= 1
      hourRaw = String(n)
    }

    // ── AM/PM flip when crossing 11↔12 (direct scroll OR minute-carry) ────────
    if (!periodChangedByUser) {
      const newHourNum = Number(hourRaw)
      if (prevHourNum === 11 && newHourNum === 12) period = period === 'AM' ? 'PM' : 'AM'
      else if (prevHourNum === 12 && newHourNum === 11) period = period === 'AM' ? 'PM' : 'AM'
    }

    const resolved = {
      hour: `${Number.isFinite(hourRep) ? hourRep : HOUR_MID}:${hourRaw}`,
      minute: `${Number.isFinite(minuteRep) ? minuteRep : MINUTE_MID}:${minuteRaw}`,
      period,
    }
    setPickerValue(resolved)

    // Silently recenter if drifting near the edge of the repeated array
    const hRepN = Number.isFinite(hourRep) ? hourRep : HOUR_MID
    const mRepN = Number.isFinite(minuteRep) ? minuteRep : MINUTE_MID
    if (hRepN < 2 || hRepN > HOUR_REPEAT - 3 || mRepN < 2 || mRepN > MINUTE_REPEAT - 3) {
      recenterRef.current = window.setTimeout(() => {
        setPickerValue(r => ({
          ...r,
          hour: `${HOUR_MID}:${r.hour.split(':')[1]}`,
          minute: `${MINUTE_MID}:${r.minute.split(':')[1]}`,
        }))
        recenterRef.current = null
      }, 140)
    }

    // Debounce the parent onChange emit
    applyRef.current = window.setTimeout(() => {
      const h = Number(hourRaw)
      const m = Number(minuteRaw)
      if (!Number.isFinite(h) || !Number.isFinite(m)) return
      let h24 = h % 12
      if (period === 'PM') h24 += 12
      onChange(`${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      applyRef.current = null
    }, 160)
  }

  const label = displayLabel(value) ?? displayLabel((() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  })())

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full min-h-12 rounded-2xl bg-zinc-800 px-3 text-left flex items-center justify-between touch-manipulation"
      >
        <span className="text-white font-semibold text-sm truncate">{label}</span>
        <span className={`text-zinc-500 text-xs ml-1 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
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
              <Picker.Column name="hour">
                {HOURS.map(h => (
                  <Picker.Item key={h.token} value={h.token}>
                    {({ selected }) => (
                      <div className={`text-center text-lg ${selected ? 'text-white font-semibold' : 'text-zinc-500'}`}>{h.label}</div>
                    )}
                  </Picker.Item>
                ))}
              </Picker.Column>
              <Picker.Column name="minute">
                {MINUTES.map(m => (
                  <Picker.Item key={m.token} value={m.token}>
                    {({ selected }) => (
                      <div className={`text-center text-lg ${selected ? 'text-white font-semibold' : 'text-zinc-500'}`}>{m.label}</div>
                    )}
                  </Picker.Item>
                ))}
              </Picker.Column>
              <Picker.Column name="period">
                {PERIODS.map(p => (
                  <Picker.Item key={p} value={p}>
                    {({ selected }) => (
                      <div className={`text-center text-lg ${selected ? 'text-white font-semibold' : 'text-zinc-500'}`}>{p}</div>
                    )}
                  </Picker.Item>
                ))}
              </Picker.Column>
            </Picker>
          </div>
        </div>
      )}
    </div>
  )
}
