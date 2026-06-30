import { useEffect, useMemo, useRef, useState } from 'react'
import DatePicker from 'react-datepicker'
import Picker from 'react-mobile-picker'
import {
  dateFromDatetimeLocalValue,
  datetimeLocalValueFromDate,
  defaultAlertPresetForAllDay,
  OFFER_ALERT_10_MIN_BEFORE,
  OFFER_ALERT_15_MIN_BEFORE,
  OFFER_ALERT_1_DAY_BEFORE,
  OFFER_ALERT_1_WEEK_BEFORE,
  OFFER_ALERT_2_DAYS_BEFORE,
  OFFER_ALERT_2_HOURS_BEFORE,
  OFFER_ALERT_30_MIN_BEFORE,
  OFFER_ALERT_5_MIN_BEFORE,
  OFFER_ALERT_AT_TIME,
  OFFER_ALERT_DAY_9AM,
  OFFER_ALERT_HOUR_BEFORE,
  OFFER_ALERT_NONE
} from '../utils'

function FieldGroup({ children }) {
  return <div className="overflow-visible rounded-3xl bg-[#2b2d34] shadow-[0_2px_8px_rgba(0,0,0,0.16)]">{children}</div>
}

function GroupRow({ children, divider = true }) {
  return (
    <>
      <div className="px-4">{children}</div>
      {divider ? <div className="mx-4 h-px bg-zinc-700/75" /> : null}
    </>
  )
}

const ALERT_OPTIONS_ALL_DAY = [
  { value: OFFER_ALERT_NONE, label: 'None' },
  { value: OFFER_ALERT_DAY_9AM, label: 'On day of event (9 AM)' },
  { value: OFFER_ALERT_1_DAY_BEFORE, label: '1 day before (9 AM)' },
  { value: OFFER_ALERT_2_DAYS_BEFORE, label: '2 days before (9 AM)' },
  { value: OFFER_ALERT_1_WEEK_BEFORE, label: '1 week before' }
]

const ALERT_OPTIONS_TIMED = [
  { value: OFFER_ALERT_NONE, label: 'None' },
  { value: OFFER_ALERT_AT_TIME, label: 'At time of event' },
  { value: OFFER_ALERT_5_MIN_BEFORE, label: '5 minutes before' },
  { value: OFFER_ALERT_10_MIN_BEFORE, label: '10 minutes before' },
  { value: OFFER_ALERT_15_MIN_BEFORE, label: '15 minutes before' },
  { value: OFFER_ALERT_30_MIN_BEFORE, label: '30 minutes before' },
  { value: OFFER_ALERT_HOUR_BEFORE, label: '1 hour before' },
  { value: OFFER_ALERT_2_HOURS_BEFORE, label: '2 hours before' },
  { value: OFFER_ALERT_1_DAY_BEFORE, label: '1 day before' },
  { value: OFFER_ALERT_2_DAYS_BEFORE, label: '2 days before' },
  { value: OFFER_ALERT_1_WEEK_BEFORE, label: '1 week before' }
]

const OFFER_TYPE_OPTIONS = [
  { value: 'free_play', label: 'Free play' },
  { value: 'hotel', label: 'Hotel stay' },
  { value: 'dining', label: 'Dining credit' },
  { value: 'gift', label: 'Gift day' },
  { value: 'multiplier', label: 'Tier multiplier' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'other', label: 'Other' }
]

export default function OfferFormModal({
  showForm,
  editingId,
  closeForm,
  completingReviewItemId,
  fileInputRef,
  handleImportPhotos,
  uploading,
  hasSlotsEdge = true,
  onRequireSubscribe,
  reviewSourceImageLoading,
  reviewSourceImageUrl,
  draft,
  setDraft,
  setPropagateCasinoOnSave,
  setShowCasinoSuggestions,
  showCasinoSuggestions,
  filteredCasinoOptions,
  setPropagateTitleOnSave,
  setShowTitleSuggestions,
  showTitleSuggestions,
  filteredTitleOptions,
  allDay,
  setAllDay,
  startSelected,
  endSelected,
  saveEvent,
  saving,
  notice,
  propagateCasinoOnSave,
  setPropagateCasinoOnSaveChecked,
  propagateTitleOnSave,
  setPropagateTitleOnSaveChecked,
  propagateValueOnSave,
  setPropagateValueOnSaveChecked,
  skipCurrentReviewFromForm,
  casinoFieldRef,
  titleFieldRef,
  onRequestSetAlertPreset
}) {
  const canSave = !!(draft.casinoName?.trim() && draft.title?.trim() && draft.startAt)
  const hasTitleSuggestions = filteredTitleOptions.length > 0
  const hasCasinoSuggestions = filteredCasinoOptions.length > 0
  const [valueFocused, setValueFocused] = useState(false)
  const [activeCalendar, setActiveCalendar] = useState(null) // 'start' | 'end' | null
  const [activeTime, setActiveTime] = useState(null) // 'start' | 'end' | null
  const [showOfferTypeMenu, setShowOfferTypeMenu] = useState(false)
  const [showAlertMenu, setShowAlertMenu] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [alertCardPulse, setAlertCardPulse] = useState(false)
  const [offerTypeMenuDirection, setOfferTypeMenuDirection] = useState('down')
  const [alertMenuDirection, setAlertMenuDirection] = useState('down')
  const offerTypeAnchorRef = useRef(null)
  const alertAnchorRef = useRef(null)
  const offerTypeMenuRef = useRef(null)
  const alertMenuRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const startPickerAnchorRef = useRef(null)
  const endPickerAnchorRef = useRef(null)
  const HOUR_REPEAT = 9
  const HOUR_MID = Math.floor(HOUR_REPEAT / 2)
  const MINUTE_REPEAT = 7
  const MINUTE_MID = Math.floor(MINUTE_REPEAT / 2)
  const [timePickerValue, setTimePickerValue] = useState({
    start: { hour: `${HOUR_MID}:1`, minute: `${MINUTE_MID}:00`, period: 'AM' },
    end: { hour: `${HOUR_MID}:1`, minute: `${MINUTE_MID}:00`, period: 'AM' }
  })
  const timePickerRecenterTimersRef = useRef({ start: null, end: null })
  const timePickerApplyTimersRef = useRef({ start: null, end: null })

  const valueRaw = String(draft.valueAmount ?? '')
  const valueFormatted = useMemo(() => {
    const cleaned = valueRaw.replace(/[^0-9.]/g, '')
    if (!cleaned) return ''
    const num = Number(cleaned)
    if (!Number.isFinite(num)) return ''
    const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
    return `$${fmt.format(num)}`
  }, [valueRaw])

  // Keep Ends populated whenever Starts exists.
  useEffect(() => {
    if (!draft.startAt || draft.endAt) return
    const startDt = dateFromDatetimeLocalValue(draft.startAt)
    if (!startDt) return
    const defaultEnd = allDay
      ? new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate(), 0, 0, 0, 0)
      : new Date(startDt.getTime() + 60 * 60 * 1000)
    const nextEnd = datetimeLocalValueFromDate(defaultEnd)
    setDraft((cur) => {
      if (!cur.startAt || cur.endAt) return cur
      return { ...cur, endAt: nextEnd }
    })
  }, [allDay, draft.endAt, draft.startAt, setDraft])

  const formatDateOnly = (dt) => (dt ? dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')
  const formatTimeOnly = (dt) => (dt ? dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '')
  const alertOptions = allDay ? ALERT_OPTIONS_ALL_DAY : ALERT_OPTIONS_TIMED
  const safeAlertPreset = draft.alertPreset || defaultAlertPresetForAllDay(allDay)
  const alertLabel = alertOptions.find((o) => o.value === safeAlertPreset)?.label || alertOptions[0].label
  const offerTypeLabel = OFFER_TYPE_OPTIONS.find((o) => o.value === draft.offerType)?.label || 'Free play'
  const hasUserEnteredDraftData =
    !!draft.title?.trim() ||
    !!draft.casinoName?.trim() ||
    !!draft.valueAmount?.trim() ||
    !!draft.notes?.trim() ||
    draft.offerType !== 'free_play' ||
    allDay !== true

  const requestClose = () => {
    if (!editingId && hasUserEnteredDraftData) {
      setShowDiscardConfirm(true)
      return
    }
    closeForm()
  }

  const chooseMenuDirection = (anchorEl, desiredMenuHeight = 320) => {
    if (!anchorEl || typeof window === 'undefined') return 'down'
    const rect = anchorEl.getBoundingClientRect()
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    if (spaceBelow >= desiredMenuHeight) return 'down'
    if (spaceAbove >= desiredMenuHeight) return 'up'
    return spaceBelow >= spaceAbove ? 'down' : 'up'
  }

  useEffect(() => {
    if (!showAlertMenu && !showOfferTypeMenu) return
    const onPointerDown = (event) => {
      const target = event.target
      const inAlertMenu = alertMenuRef.current?.contains(target)
      const inAlertAnchor = alertAnchorRef.current?.contains(target)
      const inOfferTypeMenu = offerTypeMenuRef.current?.contains(target)
      const inOfferTypeAnchor = offerTypeAnchorRef.current?.contains(target)
      if (showAlertMenu && !inAlertMenu && !inAlertAnchor) setShowAlertMenu(false)
      if (showOfferTypeMenu && !inOfferTypeMenu && !inOfferTypeAnchor) setShowOfferTypeMenu(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [showAlertMenu, showOfferTypeMenu])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const pickerKey = activeTime || activeCalendar
    if (!pickerKey) return
    const target = pickerKey === 'start' ? startPickerAnchorRef.current : endPickerAnchorRef.current
    if (!target) return
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const nextTop = targetRect.top - containerRect.top + container.scrollTop - container.clientHeight * 0.22
    container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
  }, [activeCalendar, activeTime])

  useEffect(() => {
    if (!showAlertMenu && !showOfferTypeMenu) return
    const updateDirections = () => {
      if (showOfferTypeMenu) setOfferTypeMenuDirection(chooseMenuDirection(offerTypeAnchorRef.current, 320))
      if (showAlertMenu) setAlertMenuDirection(chooseMenuDirection(alertAnchorRef.current, 320))
    }
    updateDirections()
    window.addEventListener('resize', updateDirections)
    window.addEventListener('scroll', updateDirections, true)
    return () => {
      window.removeEventListener('resize', updateDirections)
      window.removeEventListener('scroll', updateDirections, true)
    }
  }, [showAlertMenu, showOfferTypeMenu])

  const applyTimeToField = (field, hour24, minute) => {
    const source = field === 'start' ? startSelected : endSelected
    if (!source) return
    const next = new Date(source)
    next.setHours(hour24, minute, 0, 0)
    const nextVal = datetimeLocalValueFromDate(next)
    if (field === 'start') {
      setDraft((cur) => {
        const curEnd = dateFromDatetimeLocalValue(cur.endAt)
        const nextEnd = curEnd && curEnd.getTime() > next.getTime() ? cur.endAt : datetimeLocalValueFromDate(new Date(next.getTime() + 60 * 60 * 1000))
        return { ...cur, startAt: nextVal, endAt: nextEnd }
      })
    } else {
      setDraft((cur) => ({ ...cur, endAt: nextVal }))
    }
  }

  const seedTimePicker = (field, dt) => {
    if (!dt) return
    const h24 = dt.getHours()
    const hour12 = String(h24 % 12 || 12)
    const minuteStep = Math.round(dt.getMinutes() / 5) * 5
    const minute = String(minuteStep === 60 ? 0 : minuteStep).padStart(2, '0')
    const period = h24 >= 12 ? 'PM' : 'AM'
    setTimePickerValue((prev) => ({
      ...prev,
      [field]: { hour: `${HOUR_MID}:${hour12}`, minute: `${MINUTE_MID}:${minute}`, period }
    }))
  }

  const renderTimePicker = (field) => {
    const dt = field === 'start' ? startSelected : endSelected
    if (!dt || allDay || activeTime !== field) return null
    const pickerValue = timePickerValue[field]

    const hours = Array.from({ length: HOUR_REPEAT * 12 }, (_, i) => {
      const rep = Math.floor(i / 12)
      const h = String((i % 12) + 1)
      return { token: `${rep}:${h}`, label: h }
    })
    const minutes = Array.from({ length: MINUTE_REPEAT * 12 }, (_, i) => {
      const rep = Math.floor(i / 12)
      const m = String((i % 12) * 5).padStart(2, '0')
      return { token: `${rep}:${m}`, label: m }
    })
    const periods = ['AM', 'PM']
    const onChange = (nextValue) => {
      const timers = timePickerRecenterTimersRef.current
      if (timers?.[field]) {
        window.clearTimeout(timers[field])
        timers[field] = null
      }
      const applyTimers = timePickerApplyTimersRef.current
      if (applyTimers?.[field]) {
        window.clearTimeout(applyTimers[field])
        applyTimers[field] = null
      }
      const prevValue = timePickerValue[field]
      const [prevHourRepRaw, prevHourRaw] = String(prevValue.hour).split(':')
      const [, prevMinuteRaw] = String(prevValue.minute).split(':')
      const [hourRepRaw, hourRawToken] = String(nextValue.hour).split(':')
      const [minRepRaw, minuteRawToken] = String(nextValue.minute).split(':')

      const prevHour = prevHourRaw ?? String(prevValue.hour)
      const prevMinute = prevMinuteRaw ?? String(prevValue.minute)
      let hourRaw = hourRawToken ?? String(nextValue.hour)
      const minuteRaw = minuteRawToken ?? String(nextValue.minute)
      let hourRep = Number(hourRepRaw)
      const minuteRep = Number(minRepRaw)
      let period = nextValue.period
      const periodChangedByUser = nextValue.period !== prevValue.period

      // Carry forward hour when minute wraps 55 -> 00.
      if (prevMinute === '55' && minuteRaw === '00') {
        const nextHourNum = (Number(hourRaw) % 12) + 1
        hourRaw = String(nextHourNum)
        if (Number.isFinite(hourRep) && nextHourNum === 1) hourRep += 1
      }
      // Borrow hour when minute wraps 00 -> 55.
      if (prevMinute === '00' && minuteRaw === '55') {
        const prevHourNum = Number(hourRaw) - 1 || 12
        hourRaw = String(prevHourNum)
        if (Number.isFinite(hourRep) && prevHourNum === 12) hourRep -= 1
      }
      // Toggle AM/PM when the hour wheel crosses 11 <-> 12.
      if (!periodChangedByUser && prevMinute === minuteRaw) {
        if (prevHour === '11' && hourRaw === '12') {
          period = period === 'AM' ? 'PM' : 'AM'
        } else if (prevHour === '12' && hourRaw === '11') {
          period = period === 'AM' ? 'PM' : 'AM'
        }
      }

      const resolvedValue = {
        hour: `${Number.isFinite(hourRep) ? hourRep : Number(prevHourRepRaw) || HOUR_MID}:${hourRaw}`,
        minute: `${Number.isFinite(minuteRep) ? minuteRep : MINUTE_MID}:${minuteRaw}`,
        period
      }
      setTimePickerValue((prev) => ({ ...prev, [field]: resolvedValue }))

      const h = Number(hourRaw)
      const m = Number(minuteRaw)
      if (!Number.isFinite(h) || !Number.isFinite(m)) return
      let h24 = h % 12
      if (period === 'PM') h24 += 12
      // Debounce draft updates so the wheel can glide smoothly.
      applyTimers[field] = window.setTimeout(() => {
        applyTimeToField(field, h24, m)
        applyTimers[field] = null
      }, 160)
      const hourNearEdge = Number.isFinite(hourRep) && (hourRep < 2 || hourRep > HOUR_REPEAT - 3)
      const minuteNearEdge = Number.isFinite(minRepRaw) && (minRepRaw < 2 || minRepRaw > MINUTE_REPEAT - 3)
      if (hourNearEdge || minuteNearEdge) {
        // Debounce recenter so swipe momentum doesn't feel "grabby".
        timers[field] = window.setTimeout(() => {
          setTimePickerValue((prev) => ({
            ...prev,
            [field]: {
              hour: `${HOUR_MID}:${hourRaw}`,
              minute: `${MINUTE_MID}:${minuteRaw}`,
              period
            }
          }))
          timers[field] = null
        }, 140)
      }
    }

    return (
      <>
        <div className="px-4 py-2">
          <div className="relative w-full rounded-2xl bg-[#2b2d34] px-1 py-2">
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[30px] -translate-y-1/2 rounded-full bg-zinc-600/60" />
            <div className="mx-auto w-[180px]">
              <Picker className="offers-time-wheel" value={pickerValue} onChange={onChange} height={170} itemHeight={44} wheelMode="natural">
              <Picker.Column name="hour">
                {hours.map((h) => (
                  <Picker.Item key={h.token} value={h.token}>
                    {({ selected }) => <div className={`text-center text-lg ${selected ? 'text-zinc-100' : 'text-zinc-500'}`}>{h.label}</div>}
                  </Picker.Item>
                ))}
              </Picker.Column>
              <Picker.Column name="minute">
                {minutes.map((m) => (
                  <Picker.Item key={m.token} value={m.token}>
                    {({ selected }) => <div className={`text-center text-lg ${selected ? 'text-zinc-100' : 'text-zinc-500'}`}>{m.label}</div>}
                  </Picker.Item>
                ))}
              </Picker.Column>
              <Picker.Column name="period">
                {periods.map((p) => (
                  <Picker.Item key={p} value={p}>
                    {({ selected }) => <div className={`text-center text-lg ${selected ? 'text-zinc-100' : 'text-zinc-500'}`}>{p}</div>}
                  </Picker.Item>
                ))}
              </Picker.Column>
              </Picker>
            </div>
          </div>
        </div>
        <div className="mx-4 h-px bg-zinc-700/75" />
      </>
    )
  }

  const InlineCalendar = activeCalendar ? (
    <>
      <div className="mx-4 h-px bg-zinc-700/75" />
      <div className="px-4 py-2">
        <DatePicker
          inline
          selected={activeCalendar === 'start' ? startSelected : endSelected}
          onChange={(d) => {
            if (!d) return
            if (activeCalendar === 'start') {
              setDraft((cur) => {
                const nextStart = datetimeLocalValueFromDate(d)
                const curEnd = dateFromDatetimeLocalValue(cur.endAt)
                if (!allDay) {
                  const nextEndDt = new Date(d.getTime() + 60 * 60 * 1000)
                  const nextEndValue = datetimeLocalValueFromDate(nextEndDt)
                  const shouldBumpEnd = !curEnd || curEnd.getTime() <= d.getTime()
                  return { ...cur, startAt: nextStart, endAt: shouldBumpEnd ? nextEndValue : cur.endAt }
                }
                const shouldResetEnd = !curEnd || curEnd.getTime() < d.getTime()
                return { ...cur, startAt: nextStart, endAt: shouldResetEnd ? nextStart : cur.endAt }
              })
            } else {
              setDraft((cur) => ({ ...cur, endAt: datetimeLocalValueFromDate(d) }))
            }
            setActiveCalendar(null)
            setActiveTime(null)
          }}
          showTimeSelect={false}
          dateFormat="MMM d, yyyy"
          minDate={activeCalendar === 'end' ? startSelected || undefined : undefined}
          calendarClassName="offer-datepicker offer-datepicker-inline"
          renderCustomHeader={({ date, decreaseMonth, increaseMonth }) => (
            <div className="flex items-center justify-between pb-2 pt-1">
              <div className="text-zinc-100 font-semibold">
                {date.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={decreaseMonth} className="text-cyan-300 text-lg font-semibold px-2 -mr-1">
                  ‹
                </button>
                <button type="button" onClick={increaseMonth} className="text-cyan-300 text-lg font-semibold px-2 -mr-2">
                  ›
                </button>
              </div>
            </div>
          )}
          formatWeekDay={(dayName) => String(dayName || '').toUpperCase().slice(0, 3)}
        />
      </div>
      <div className="mx-4 h-px bg-zinc-700/75" />
    </>
  ) : null

  if (!showForm) return null

  return (
    <div data-offer-form className="fixed inset-0 z-[70] flex bg-black/55 px-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-[2px]">
      <div className="mx-auto flex w-full max-w-lg flex-1 items-end">
        <div
          className="relative w-full overflow-hidden rounded-t-[36px] bg-[#181b22] shadow-[0_6px_16px_rgba(0,0,0,0.12)]"
          style={{ height: 'calc(100dvh - (env(safe-area-inset-top) + 12px))' }}
        >
          {/* Transparent control layer above scroll content */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pb-5 pt-4">
            <div className="relative flex shrink-0 items-center justify-between">
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close event form"
                className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-zinc-600 bg-zinc-800/90 text-2xl leading-none text-zinc-300 touch-manipulation"
              >
                ×
              </button>
              <div className="pointer-events-none absolute left-0 right-0 text-center text-[16px] font-semibold text-white">
                {editingId ? 'Edit Event' : 'New Event'}
              </div>
              <button
                type="button"
                onClick={saveEvent}
                disabled={!canSave || saving}
                aria-label={editingId ? 'Update event' : 'Save event'}
                className={`pointer-events-auto grid h-12 w-12 place-items-center rounded-full border text-2xl leading-none touch-manipulation transition-colors ${
                  canSave && !saving
                    ? 'border-emerald-400/70 bg-emerald-500 text-white'
                    : 'border-zinc-600 bg-zinc-800/90 text-zinc-500'
                }`}
              >
                {saving ? '…' : '✓'}
              </button>
            </div>
          </div>

          {/* Top blur veil to recreate iOS-style scroll-under blur */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-20 bg-black/4 backdrop-blur-xl"
            style={{
              WebkitMaskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 18%, rgba(0,0,0,0.82) 42%, rgba(0,0,0,0.5) 62%, rgba(0,0,0,0) 78%)',
              maskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 18%, rgba(0,0,0,0.82) 42%, rgba(0,0,0,0.5) 62%, rgba(0,0,0,0) 78%)'
            }}
          />

          {/* Scroll region (content scrolls under header) */}
          <div
            ref={scrollContainerRef}
            className="relative h-full overscroll-contain overflow-y-auto touch-pan-y"
            style={{
              WebkitOverflowScrolling: 'touch',
              WebkitMaskImage:
                'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.92) 28px, rgba(0,0,0,1) 64px, rgba(0,0,0,1) calc(100% - 96px), rgba(0,0,0,0.9) calc(100% - 56px), rgba(0,0,0,0) 100%)',
              maskImage:
                'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.92) 28px, rgba(0,0,0,1) 64px, rgba(0,0,0,1) calc(100% - 96px), rgba(0,0,0,0.9) calc(100% - 56px), rgba(0,0,0,0) 100%)'
            }}
          >
            {/* Body */}
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[86px]">
              <div className="flex flex-col gap-6">
          {!completingReviewItemId && !editingId && (
            <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/35 via-slate-900/95 to-zinc-900/95 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.16)]">
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  if (!hasSlotsEdge) {
                    onRequireSubscribe?.()
                    return
                  }
                  fileInputRef.current?.click()
                }}
                className="w-full min-h-11 touch-manipulation text-left disabled:opacity-55"
              >
                <span className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-200">
                    📸
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[16px] font-semibold text-cyan-100">
                      {uploading ? 'Importing photos…' : hasSlotsEdge ? 'Import from photo(s)' : 'Import from photo(s) - Slots Edge'}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-cyan-200/75">
                      {hasSlotsEdge
                        ? 'We will auto-create offer events from your casino mailers.'
                        : 'Subscribe to Slots Edge to unlock mailer OCR.'}
                    </span>
                  </span>
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void handleImportPhotos(e)}
              />
            </div>
          )}

          {completingReviewItemId && (
            <div className="overflow-hidden rounded-3xl border border-zinc-700/50 bg-zinc-800/40">
              {reviewSourceImageLoading ? (
                <div className="flex items-center justify-center h-24 text-sm text-zinc-500">Loading preview…</div>
              ) : reviewSourceImageUrl ? (
                <a href={reviewSourceImageUrl} target="_blank" rel="noreferrer" title="Open full image" className="block">
                  <img src={reviewSourceImageUrl} alt="Source mailer" className="max-h-64 w-full object-contain" />
                </a>
              ) : (
                <div className="flex items-center justify-center h-16 text-sm text-zinc-500">Preview unavailable</div>
              )}
            </div>
          )}

          {/* Title + Casino */}
          <FieldGroup>
            <GroupRow>
              <div ref={titleFieldRef} className="relative h-12">
                <input
                  aria-label="Title"
                  value={draft.title}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, title: e.target.value }))
                    if (completingReviewItemId && !editingId) setPropagateTitleOnSave(true)
                    setShowTitleSuggestions(hasTitleSuggestions)
                  }}
                  onFocus={() => setShowTitleSuggestions(hasTitleSuggestions)}
                  onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 120)}
                  className="h-12 w-full bg-transparent py-0 pr-10 text-[16px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:outline-none"
                  placeholder="Title"
                  autoComplete="off"
                />
                {hasTitleSuggestions ? (
                  <button
                    type="button"
                    aria-label="Title suggestions"
                    tabIndex={-1}
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => setShowTitleSuggestions((v) => !v)}
                    className="pointer-events-auto absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-zinc-100"
                  >
                    ▾
                  </button>
                ) : null}
                {showTitleSuggestions && hasTitleSuggestions && (
                  <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-44 overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
                    {filteredTitleOptions.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => {
                          setDraft((d) => ({ ...d, title: t }))
                          if (completingReviewItemId && !editingId) setPropagateTitleOnSave(true)
                          setShowTitleSuggestions(false)
                        }}
                        className="w-full px-4 py-2.5 text-left text-[16px] text-zinc-100 hover:bg-zinc-800"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </GroupRow>
            <GroupRow divider={false}>
              <div ref={casinoFieldRef} className="relative h-12">
                <input
                  aria-label="Casino"
                  value={draft.casinoName}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, casinoName: e.target.value }))
                    if (completingReviewItemId && !editingId) setPropagateCasinoOnSave(true)
                    setShowCasinoSuggestions(hasCasinoSuggestions)
                  }}
                  onFocus={() => setShowCasinoSuggestions(hasCasinoSuggestions)}
                  onBlur={() => setTimeout(() => setShowCasinoSuggestions(false), 120)}
                  className="h-12 w-full bg-transparent py-0 pr-10 text-[16px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:outline-none"
                  placeholder="Casino"
                  autoComplete="off"
                />
                {hasCasinoSuggestions ? (
                  <button
                    type="button"
                    aria-label="Casino suggestions"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => setShowCasinoSuggestions((v) => !v)}
                    className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-zinc-100"
                  >
                    ▾
                  </button>
                ) : null}
                {showCasinoSuggestions && hasCasinoSuggestions && (
                  <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-44 overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
                    {filteredCasinoOptions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => {
                          setDraft((d) => ({ ...d, casinoName: name }))
                          if (completingReviewItemId && !editingId) setPropagateCasinoOnSave(true)
                          setShowCasinoSuggestions(false)
                        }}
                        className="w-full px-4 py-2.5 text-left text-[16px] text-zinc-100 hover:bg-zinc-800"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </GroupRow>
          </FieldGroup>

          {/* Type + Amount */}
          <FieldGroup>
            <GroupRow>
              <div ref={offerTypeAnchorRef} className="relative h-12">
                <button
                  type="button"
                  aria-label="Offer type"
                  onClick={() => {
                    setShowAlertMenu(false)
                    setOfferTypeMenuDirection(chooseMenuDirection(offerTypeAnchorRef.current, 320))
                    setShowOfferTypeMenu((v) => !v)
                  }}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer"
                >
                  <span className="sr-only">Open offer type options</span>
                </button>
                <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-[16px] text-zinc-100">
                  {offerTypeLabel}
                </div>
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-zinc-100"
                >
                  ▾
                </span>
                {showOfferTypeMenu ? (
                  <div
                    ref={offerTypeMenuRef}
                    className={`absolute right-0 z-40 w-[270px] max-w-[82vw] overflow-hidden rounded-[30px] border border-zinc-600/75 bg-zinc-900/95 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
                      offerTypeMenuDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
                    }`}
                  >
                    <div className="max-h-[360px] overflow-auto">
                      {OFFER_TYPE_OPTIONS.map((opt) => {
                        const selected = draft.offerType === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setDraft((d) => ({ ...d, offerType: opt.value }))
                              setShowOfferTypeMenu(false)
                            }}
                            className="w-full text-left px-3 py-2 text-[16px] text-zinc-100 hover:bg-zinc-800/70 rounded-lg"
                          >
                            <span className="inline-flex w-7 items-center justify-center text-zinc-100">{selected ? '✓' : ''}</span>
                            <span>{opt.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </GroupRow>
            <GroupRow divider={false}>
              <input
                aria-label="Promo value in dollars"
                type="text"
                inputMode="decimal"
                value={valueFocused ? valueRaw : valueFormatted}
                onChange={(e) => {
                  const next = String(e.target.value || '').replace(/[^0-9.]/g, '')
                  const parts = next.split('.')
                  const normalized = parts.length <= 1 ? next : `${parts[0]}.${parts.slice(1).join('')}`
                  setDraft((d) => ({ ...d, valueAmount: normalized }))
                  if (completingReviewItemId && !editingId) setPropagateValueOnSaveChecked(true)
                }}
                onFocus={() => setValueFocused(true)}
                onBlur={() => setValueFocused(false)}
                className="h-12 w-full bg-transparent py-0 text-[16px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:outline-none"
                placeholder="$ Value"
              />
            </GroupRow>
          </FieldGroup>

          {/* All-day · Starts · Ends */}
          <FieldGroup>
            <GroupRow>
              <div className="flex h-12 items-center justify-between gap-4">
              <span className="text-[16px] text-zinc-100">All-day</span>
              <label className="relative inline-flex cursor-pointer items-center shrink-0">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => {
                    const v = e.target.checked
                    setAllDay(v)
                    const nextPreset = defaultAlertPresetForAllDay(v)
                    setDraft((cur) => {
                      if (!cur.startAt) return { ...cur, alertPreset: nextPreset }
                      if (v) {
                        const dt = dateFromDatetimeLocalValue(cur.startAt)
                        if (!dt) return { ...cur, alertPreset: nextPreset }
                        const midnight = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0)
                        const curEnd = dateFromDatetimeLocalValue(cur.endAt)
                        const endMidnight = curEnd
                          ? new Date(curEnd.getFullYear(), curEnd.getMonth(), curEnd.getDate(), 0, 0, 0, 0)
                          : midnight
                        return {
                          ...cur,
                          alertPreset: nextPreset,
                          startAt: datetimeLocalValueFromDate(midnight),
                          endAt: datetimeLocalValueFromDate(endMidnight)
                        }
                      }
                    // Switching from all-day -> timed:
                    // Default Starts to the next closest hour from *now*, and Ends to +1 hour.
                    const base = dateFromDatetimeLocalValue(cur.startAt)
                    if (!base) return { ...cur, alertPreset: nextPreset }
                    const curEnd = dateFromDatetimeLocalValue(cur.endAt)
                    const now = new Date()
                    const trunc = new Date(now)
                    trunc.setMinutes(0, 0, 0)
                    const nextHour = new Date(trunc)
                    if (now.getTime() > trunc.getTime()) nextHour.setHours(nextHour.getHours() + 1)
                    const isLate = now.getHours() >= 23
                    const nextStart = isLate
                      ? new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 0, 0, 0, 0)
                      : new Date(base.getFullYear(), base.getMonth(), base.getDate(), nextHour.getHours(), 0, 0, 0)
                    // Preserve user-selected end date when present; only fill in a time.
                    const nextEnd = curEnd
                      ? new Date(curEnd.getFullYear(), curEnd.getMonth(), curEnd.getDate(), nextStart.getHours() + 1, 0, 0, 0)
                      : new Date(nextStart.getTime() + 60 * 60 * 1000)
                    return {
                      ...cur,
                      alertPreset: nextPreset,
                      startAt: datetimeLocalValueFromDate(nextStart),
                      endAt: datetimeLocalValueFromDate(nextEnd)
                    }
                    })
                  }}
                  className="peer sr-only"
                />
                <span className="relative block h-[26px] w-[58px] rounded-[999px] bg-zinc-600 transition-colors after:absolute after:left-[2px] after:top-[2px] after:block after:h-[22px] after:w-[36px] after:rounded-[999px] after:bg-white after:shadow after:transition-transform peer-checked:bg-[#FF4144] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-500 peer-checked:after:translate-x-[18px]" />
              </label>
              </div>
            </GroupRow>
            <GroupRow>
            <div ref={startPickerAnchorRef} className="flex h-0 w-0" />
            <div className="flex h-12 items-center gap-4">
              <span className="w-[74px] shrink-0 pt-0.5 text-[16px] text-zinc-100">Starts</span>
              <button
                type="button"
                onClick={() => {
                  setActiveTime(null)
                  setActiveCalendar((v) => (v === 'start' ? null : 'start'))
                }}
                className="min-w-0 flex-1 flex justify-end"
                aria-label="Pick start date"
              >
                {!allDay ? (
                  <span className="inline-flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full bg-zinc-600/60 px-3 py-1 ${activeCalendar === 'start' ? 'text-cyan-300' : 'text-zinc-50'}`}>
                      {formatDateOnly(startSelected)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveCalendar(null)
                        setActiveTime((v) => {
                          const next = v === 'start' ? null : 'start'
                          if (next === 'start') seedTimePicker('start', startSelected)
                          return next
                        })
                      }}
                      className={`inline-flex items-center rounded-full bg-zinc-600/60 px-3 py-1 ${activeTime === 'start' ? 'text-cyan-300' : 'text-zinc-50'}`}
                    >
                      {formatTimeOnly(startSelected)}
                    </button>
                  </span>
                ) : (
                  <span className={`inline-flex items-center rounded-full bg-zinc-600/60 px-3 py-1 ${activeCalendar === 'start' ? 'text-cyan-300' : 'text-zinc-50'}`}>
                    {formatDateOnly(startSelected)}
                  </span>
                )}
              </button>
            </div>
            </GroupRow>
            {activeCalendar === 'start' ? InlineCalendar : null}
            {renderTimePicker('start')}
            <GroupRow divider={false}>
            <div ref={endPickerAnchorRef} className="flex h-0 w-0" />
            <div className="flex h-12 items-center gap-4">
              <span className="w-[74px] shrink-0 pt-0.5 text-[16px] text-zinc-100">Ends</span>
              <button
                type="button"
                onClick={() => {
                  setActiveTime(null)
                  setActiveCalendar((v) => (v === 'end' ? null : 'end'))
                }}
                className="min-w-0 flex-1 flex justify-end"
                aria-label="Pick end date"
              >
                {!allDay ? (
                  <span className="inline-flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full bg-zinc-600/60 px-3 py-1 ${activeCalendar === 'end' ? 'text-cyan-300' : 'text-zinc-50'}`}>
                      {formatDateOnly(endSelected)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveCalendar(null)
                        setActiveTime((v) => {
                          const next = v === 'end' ? null : 'end'
                          if (next === 'end') seedTimePicker('end', endSelected)
                          return next
                        })
                      }}
                      className={`inline-flex items-center rounded-full bg-zinc-600/60 px-3 py-1 ${activeTime === 'end' ? 'text-cyan-300' : 'text-zinc-50'}`}
                    >
                      {formatTimeOnly(endSelected)}
                    </button>
                  </span>
                ) : (
                  <span className={`inline-flex items-center rounded-full bg-zinc-600/60 px-3 py-1 ${activeCalendar === 'end' ? 'text-cyan-300' : 'text-zinc-50'}`}>
                    {formatDateOnly(endSelected)}
                  </span>
                )}
              </button>
            </div>
            </GroupRow>
            {activeCalendar === 'end' ? InlineCalendar : null}
            {renderTimePicker('end')}

          </FieldGroup>

          {/* Alert */}
          <div
            className={`rounded-3xl transition-all ${
              alertCardPulse ? 'ring-2 ring-cyan-400/70 shadow-[0_0_28px_rgba(34,211,238,0.35)] animate-pulse' : ''
            }`}
          >
          <FieldGroup>
            <GroupRow divider={false}>
              <div className="flex h-12 items-center gap-4">
                <span className="w-[74px] shrink-0 pt-0.5 text-[16px] text-zinc-100">Alert</span>
                <div ref={alertAnchorRef} className="relative min-w-0 flex-1 h-11">
                  <button
                    type="button"
                    aria-label="Notification alert"
                    onClick={() => {
                      setShowOfferTypeMenu(false)
                      setAlertMenuDirection(chooseMenuDirection(alertAnchorRef.current, 320))
                      setShowAlertMenu((v) => !v)
                    }}
                    className="absolute inset-0 z-10 h-full w-full cursor-pointer"
                  >
                    <span className="sr-only">Open alert options</span>
                  </button>
                  <div aria-hidden className="pointer-events-none absolute inset-y-0 right-9 flex items-center text-[16px] text-zinc-100">
                    {alertLabel}
                  </div>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-zinc-100"
                  >
                    ▾
                  </span>
                  {showAlertMenu ? (
                    <div
                      ref={alertMenuRef}
                      className={`absolute right-0 z-40 w-[270px] max-w-[82vw] overflow-hidden rounded-[30px] border border-zinc-600/75 bg-zinc-900/95 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
                        alertMenuDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
                      }`}
                    >
                      <div className="max-h-[360px] overflow-auto">
                        {alertOptions.map((opt, idx) => {
                          const selected = safeAlertPreset === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={async () => {
                                const requestedPreset = opt.value
                                const resolvedPreset = onRequestSetAlertPreset
                                  ? await onRequestSetAlertPreset(requestedPreset, { editingId: Boolean(editingId) })
                                  : requestedPreset
                                setDraft((d) => ({ ...d, alertPreset: resolvedPreset }))
                                if (requestedPreset !== 'none' && resolvedPreset === 'none') {
                                  setAlertCardPulse(true)
                                  window.setTimeout(() => setAlertCardPulse(false), 1300)
                                }
                                setShowAlertMenu(false)
                              }}
                              className="w-full text-left px-3 py-2 text-[16px] text-zinc-100 hover:bg-zinc-800/70 rounded-lg"
                            >
                              <span className="inline-flex w-7 items-center justify-center text-zinc-100">{selected ? '✓' : ''}</span>
                              <span>{opt.label}</span>
                              {idx === 0 ? <span className="mt-2 block h-px bg-zinc-700/75" /> : null}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </GroupRow>
          </FieldGroup>
          </div>

          {/* Notes */}
          <FieldGroup>
            <textarea
              aria-label="Notes"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              className="min-h-[6rem] w-full resize-y bg-transparent px-4 py-3 text-[16px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:outline-none"
              placeholder="Notes"
              rows={4}
            />
          </FieldGroup>

          {completingReviewItemId && !editingId && notice && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-[16px] text-emerald-100">{notice}</div>
          )}

          {completingReviewItemId && !editingId && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/90 px-4 py-3">
              <div className="mb-3 text-[16px] text-zinc-200">Apply to matching open drafts · same offer type only</div>
              <label className="flex items-center gap-3 text-[16px] text-white">
                <input
                  type="checkbox"
                  checked={propagateCasinoOnSave}
                  onChange={(e) => setPropagateCasinoOnSaveChecked(e.target.checked)}
                  className="h-5 w-5 accent-cyan-500"
                />
                Casino name
              </label>
              <label className="mt-3 flex items-center gap-3 text-[16px] text-white">
                <input
                  type="checkbox"
                  checked={propagateTitleOnSave}
                  onChange={(e) => setPropagateTitleOnSaveChecked(e.target.checked)}
                  className="h-5 w-5 accent-cyan-500"
                />
                Title
              </label>
              <label className="mt-3 flex items-center gap-3 text-[16px] text-white">
                <input
                  type="checkbox"
                  checked={propagateValueOnSave}
                  onChange={(e) => setPropagateValueOnSaveChecked(e.target.checked)}
                  className="h-5 w-5 accent-cyan-500"
                />
                Amount
              </label>
            </div>
          )}

          {completingReviewItemId && !editingId && (
            <button
              type="button"
              onClick={() => void skipCurrentReviewFromForm()}
              disabled={saving}
              className="min-h-[3rem] w-full touch-manipulation rounded-xl border border-zinc-600 bg-zinc-900 py-3 text-[16px] font-medium text-red-400/95 hover:bg-zinc-800 disabled:opacity-55"
            >
              Remove this draft
            </button>
          )}
              </div>
            </div>

          </div>
        </div>
      </div>
      {showDiscardConfirm ? (
        <div className="fixed inset-0 z-[80] bg-black/30" onClick={() => setShowDiscardConfirm(false)}>
          <div
            className="absolute left-4 top-4 w-[186px] max-w-[86vw] rounded-3xl border border-zinc-600/80 bg-zinc-900/55 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur-md sm:left-6 sm:top-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[16px] text-zinc-100">Are you sure you want to discard this new event?</p>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false)
                  closeForm()
                }}
                className="w-full rounded-full bg-zinc-700/95 px-3 py-2 text-[16px] font-medium text-[#FF4144]"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
