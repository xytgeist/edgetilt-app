import DatePicker from 'react-datepicker'
import DateTimeInput from './DateTimeInput'
import { dateFromDatetimeLocalValue, datetimeLocalValueFromDate } from '../utils'

export default function OfferFormModal({
  showForm,
  editingId,
  closeForm,
  completingReviewItemId,
  fileInputRef,
  handleImportPhotos,
  uploading,
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
  endMinTime,
  endMaxTime,
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
  titleFieldRef
}) {
  if (!showForm) return null

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-[1px] px-4 py-6 overflow-y-auto">
      <div className="max-w-lg mx-auto bg-zinc-900 rounded-3xl p-5 border border-zinc-700">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-white font-bold text-lg">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden>📅</span>
              <span>{editingId ? 'Edit event' : 'Add event'}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={closeForm}
            className="text-zinc-400 hover:text-zinc-200 text-sm font-semibold touch-manipulation"
          >
            Close
          </button>
        </div>

        {!completingReviewItemId && !editingId && (
          <div className="mb-4">
            <div className="text-white font-semibold mb-1">Import from photos (bulk)</div>
            <p className="text-zinc-400 text-xs mb-3 leading-relaxed">
              We&apos;ll use AI to auto-magically create events from your casino mailers. <span aria-hidden>🤖</span>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void handleImportPhotos(e)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-11 rounded-2xl border border-zinc-600 bg-zinc-800 text-zinc-100 font-semibold hover:bg-zinc-700 disabled:opacity-60 touch-manipulation"
            >
              {uploading ? 'Uploading…' : 'Choose photo(s)'}
            </button>
          </div>
        )}

        {completingReviewItemId && (
          <div className="mb-4 rounded-2xl border border-amber-700/60 bg-amber-950/30 p-3">
            <div className="text-amber-100 text-xs font-semibold mb-2">Source image for this AI draft</div>
            {reviewSourceImageLoading ? (
              <div className="text-amber-200/80 text-xs">Loading image preview...</div>
            ) : reviewSourceImageUrl ? (
              <a href={reviewSourceImageUrl} target="_blank" rel="noreferrer" className="block" title="Open full image">
                <img
                  src={reviewSourceImageUrl}
                  alt="Source upload for AI draft"
                  className="w-full max-h-64 object-contain rounded-xl border border-amber-700/50 bg-black/20"
                />
              </a>
            ) : (
              <div className="text-amber-200/80 text-xs">Image preview unavailable. You can still complete this draft manually.</div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-zinc-400 text-xs mb-1">Casino</label>
            <div ref={casinoFieldRef} className="relative">
              <input
                value={draft.casinoName}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, casinoName: e.target.value }))
                  if (completingReviewItemId && !editingId) setPropagateCasinoOnSave(true)
                  setShowCasinoSuggestions(true)
                }}
                onFocus={() => setShowCasinoSuggestions(true)}
                onBlur={() => setTimeout(() => setShowCasinoSuggestions(false), 120)}
                className="w-full h-12 appearance-none bg-zinc-800 rounded-2xl pl-3 pr-10 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/30"
                placeholder="e.g. Bellagio"
              />
              <button
                type="button"
                aria-label="Toggle casino suggestions"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => setShowCasinoSuggestions((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm hover:text-zinc-200"
              >
                ▾
              </button>
              {showCasinoSuggestions && filteredCasinoOptions.length > 0 && (
                <div className="absolute z-30 mt-1 w-full max-h-44 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
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
                      className="w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-zinc-400 text-xs mb-1">Type</label>
            <div className="relative">
              <select
                value={draft.offerType}
                onChange={(e) => setDraft((d) => ({ ...d, offerType: e.target.value }))}
                className="w-full h-12 appearance-none bg-zinc-800 rounded-2xl pl-3 pr-10 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/30"
              >
                <option value="free_play">Free play</option>
                <option value="hotel">Hotel stay</option>
                <option value="dining">Dining credit</option>
                <option value="gift">Gift day</option>
                <option value="multiplier">Tier multiplier</option>
                <option value="tournament">Tournament</option>
                <option value="drawing">Drawing</option>
                <option value="other">Other</option>
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm"
              >
                ▾
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-zinc-400 text-xs mb-1">Title</label>
          <div ref={titleFieldRef} className="relative">
            <input
              value={draft.title}
              onChange={(e) => {
                setDraft((d) => ({ ...d, title: e.target.value }))
                if (completingReviewItemId && !editingId) setPropagateTitleOnSave(true)
                setShowTitleSuggestions(true)
              }}
              onFocus={() => setShowTitleSuggestions(true)}
              onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 120)}
              className="w-full h-12 appearance-none bg-zinc-800 rounded-2xl pl-3 pr-10 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/30"
              placeholder="e.g. Weekly Free Play"
            />
            <button
              type="button"
              aria-label="Toggle title suggestions"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => setShowTitleSuggestions((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm hover:text-zinc-200"
            >
              ▾
            </button>
            {showTitleSuggestions && filteredTitleOptions.length > 0 && (
              <div className="absolute z-30 mt-1 w-full max-h-44 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
                {filteredTitleOptions.map((title) => (
                  <button
                    key={title}
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => {
                      setDraft((d) => ({ ...d, title }))
                      if (completingReviewItemId && !editingId) setPropagateTitleOnSave(true)
                      setShowTitleSuggestions(false)
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    {title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between gap-3 mb-1">
            <label className="block text-zinc-400 text-xs">Start</label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => {
                  const v = e.target.checked
                  setAllDay(v)
                  setDraft((cur) => {
                    if (!cur.startAt) return cur
                    if (v) {
                      const dt = dateFromDatetimeLocalValue(cur.startAt)
                      if (!dt) return cur
                      const midnight = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0)
                      const curEnd = dateFromDatetimeLocalValue(cur.endAt)
                      const endMidnight = curEnd ? new Date(curEnd.getFullYear(), curEnd.getMonth(), curEnd.getDate(), 0, 0, 0, 0) : null
                      return {
                        ...cur,
                        startAt: datetimeLocalValueFromDate(midnight),
                        endAt: endMidnight ? datetimeLocalValueFromDate(endMidnight) : cur.endAt
                      }
                    }
                    return cur
                  })
                }}
                className="h-4 w-4 accent-violet-600"
              />
              <span className="text-zinc-400 text-[11px] leading-none">All day</span>
            </label>
          </div>
          <DatePicker
            selected={startSelected}
            onChange={(d) =>
              setDraft((cur) => {
                if (!d) return { ...cur, startAt: '' }
                const nextStart = datetimeLocalValueFromDate(d)
                const curEnd = dateFromDatetimeLocalValue(cur.endAt)
                const shouldClearEnd = !!curEnd && curEnd.getTime() < d.getTime()
                return { ...cur, startAt: nextStart, endAt: shouldClearEnd ? '' : cur.endAt }
              })
            }
            showTimeSelect={!allDay}
            timeIntervals={15}
            timeCaption="Time"
            dateFormat={allDay ? 'MMM d, yyyy' : 'MMM d, yyyy h:mm aa'}
            popperPlacement="bottom-start"
            wrapperClassName="w-full"
            calendarClassName="offer-datepicker"
            withPortal
            placeholderText="Select start"
            customInput={<DateTimeInput />}
          />
        </div>

        <div className="mt-3">
          <label className="block text-zinc-400 text-xs mb-1">End (optional)</label>
          <DatePicker
            selected={endSelected}
            onChange={(d) => setDraft((cur) => ({ ...cur, endAt: d ? datetimeLocalValueFromDate(d) : '' }))}
            showTimeSelect={!allDay}
            timeIntervals={15}
            timeCaption="Time"
            dateFormat={allDay ? 'MMM d, yyyy' : 'MMM d, yyyy h:mm aa'}
            minDate={startSelected || undefined}
            minTime={!allDay && startSelected ? endMinTime : undefined}
            maxTime={!allDay && startSelected ? endMaxTime : undefined}
            popperPlacement="bottom-start"
            wrapperClassName="w-full"
            calendarClassName="offer-datepicker"
            withPortal
            placeholderText="Select end"
            isClearable
            customInput={<DateTimeInput />}
          />
        </div>

        <div className="mt-3">
          <label className="block text-zinc-400 text-xs mb-1">Value amount ($)</label>
          <input
            type="number"
            value={draft.valueAmount}
            onChange={(e) => {
              setDraft((d) => ({ ...d, valueAmount: e.target.value }))
              if (completingReviewItemId && !editingId) setPropagateValueOnSaveChecked(true)
            }}
            className="w-full h-12 bg-zinc-800 rounded-2xl px-3 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/30"
            placeholder="e.g. 150"
          />
        </div>

        <div className="mt-3">
          <label className="block text-zinc-400 text-xs mb-1">Notes</label>
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            className="w-full min-h-20 bg-zinc-800 rounded-2xl px-3 py-2 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/30"
            placeholder="Any restrictions, swipe times, or details"
          />
        </div>

        <button
          type="button"
          onClick={saveEvent}
          disabled={saving}
          className="mt-4 w-full min-h-12 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation"
        >
          {saving ? 'Saving…' : editingId ? 'Update event' : 'Save event'}
        </button>
        {completingReviewItemId && !editingId && notice && (
          <div className="mt-2 rounded-xl border border-emerald-500/35 bg-emerald-950/35 px-3 py-2 text-xs text-emerald-100">
            {notice}
          </div>
        )}
        {completingReviewItemId && !editingId && (
          <div className="mt-2 rounded-2xl border border-zinc-700 bg-zinc-900/70 px-3 py-2">
            <div className="text-[11px] text-zinc-400 mb-2">Apply to associated items (same Type only)</div>
            <label className="flex items-center gap-2 text-zinc-200 text-xs">
              <input
                type="checkbox"
                checked={propagateCasinoOnSave}
                onChange={(e) => setPropagateCasinoOnSaveChecked(e.target.checked)}
                className="h-4 w-4 accent-violet-500"
              />
              Casino
            </label>
            <label className="mt-2 flex items-center gap-2 text-zinc-200 text-xs">
              <input
                type="checkbox"
                checked={propagateTitleOnSave}
                onChange={(e) => setPropagateTitleOnSaveChecked(e.target.checked)}
                className="h-4 w-4 accent-violet-500"
              />
              Title
            </label>
            <label className="mt-2 flex items-center gap-2 text-zinc-200 text-xs">
              <input
                type="checkbox"
                checked={propagateValueOnSave}
                onChange={(e) => setPropagateValueOnSaveChecked(e.target.checked)}
                className="h-4 w-4 accent-violet-500"
              />
              Value amount
            </label>
          </div>
        )}
        {completingReviewItemId && !editingId && (
          <button
            type="button"
            onClick={() => void skipCurrentReviewFromForm()}
            disabled={saving}
            className="mt-2 w-full min-h-11 rounded-2xl border border-zinc-600 bg-zinc-800 text-zinc-200 font-semibold hover:bg-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation"
          >
            Not needed — remove this item
          </button>
        )}
      </div>
    </div>
  )
}
