import { useCallback, useEffect, useMemo, useState } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import SlotsToolPageHeader from '../../components/SlotsToolPageHeader.jsx'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import {
  POKER_STABLE_SMOKE_CHECKLIST_KEY,
  POKER_STABLE_SMOKE_CHECKLIST_VERSION,
  POKER_STABLE_SMOKE_SECTIONS,
  emptySmokeChecklistResponseMap,
  mergeSmokeChecklistResponses,
  serializeSmokeChecklistResponses,
} from './pokerStableSmokeChecklistItems.js'
import { isSmokeChecklistHostAllowed } from './smokeChecklistHost.js'
import {
  loadSmokeChecklistSubmission,
  saveSmokeChecklistSubmission,
} from './smokeChecklistApi.js'
import SmokeChecklistScreenshotAttachments from './SmokeChecklistScreenshotAttachments.jsx'
import {
  imageFilesFromClipboardEvent,
  imageFilesFromNavigatorClipboardRead,
} from '../../utils/clipboardImagePaste.js'
import { uploadSmokeChecklistScreenshot } from './smokeChecklistScreenshotUpload.js'

function formatSavedAt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Interactive Poker Stable v2 smoke checklist (admin, test host).
 * Route: `/?tab=stable-smoke`
 */
export default function PokerStableSmokeChecklistScreen({
  supabaseClient,
  isAdmin = false,
  titleBarNavSlot = null,
}) {
  const hostAllowed = isSmokeChecklistHostAllowed()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [runLabel, setRunLabel] = useState('')
  const [status, setStatus] = useState('draft')
  const [submittedAt, setSubmittedAt] = useState(/** @type {string | null} */ (null))
  const [updatedAt, setUpdatedAt] = useState(/** @type {string | null} */ (null))
  const [responses, setResponses] = useState(emptySmokeChecklistResponseMap)
  const [userId, setUserId] = useState(/** @type {string | null} */ (null))
  const [itemUploading, setItemUploading] = useState(/** @type {Record<string, boolean>} */ ({}))

  const totalItems = useMemo(
    () => POKER_STABLE_SMOKE_SECTIONS.reduce((sum, section) => sum + section.items.length, 0),
    [],
  )

  const checkedCount = useMemo(
    () => Object.values(responses).filter((row) => row.checked).length,
    [responses],
  )

  const loadSubmission = useCallback(async () => {
    if (!supabaseClient || !isAdmin || !hostAllowed) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const { submission, error: loadErr } = await loadSmokeChecklistSubmission(
        supabaseClient,
        POKER_STABLE_SMOKE_CHECKLIST_KEY,
      )
      if (loadErr) throw loadErr
      if (submission) {
        setResponses(mergeSmokeChecklistResponses(submission.responses))
        setRunLabel(submission.run_label || '')
        setStatus(submission.status || 'draft')
        setSubmittedAt(submission.submitted_at || null)
        setUpdatedAt(submission.updated_at || null)
      } else {
        setResponses(emptySmokeChecklistResponseMap())
        setRunLabel('')
        setStatus('draft')
        setSubmittedAt(null)
        setUpdatedAt(null)
      }
    } catch (e) {
      setError(e?.message || 'Could not load smoke checklist.')
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, isAdmin, hostAllowed])

  useEffect(() => {
    void loadSubmission()
  }, [loadSubmission])

  useEffect(() => {
    if (!supabaseClient) return undefined
    let cancelled = false
    void supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setUserId(session?.user?.id ?? null)
    })
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabaseClient])

  const anyItemUploading = useMemo(
    () => Object.values(itemUploading).some(Boolean),
    [itemUploading],
  )

  async function persist(nextStatus) {
    if (!supabaseClient) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = serializeSmokeChecklistResponses(responses)
      const { error: saveErr } = await saveSmokeChecklistSubmission(supabaseClient, {
        responses: payload,
        status: nextStatus,
        runLabel,
      })
      if (saveErr) throw saveErr
      triggerTapHapticLight()
      setStatus(nextStatus)
      if (nextStatus === 'submitted') {
        setSubmittedAt(new Date().toISOString())
        setNotice('Smoke report submitted. Tell Theo: "ok lets go over the smoke list".')
      } else {
        setNotice('Progress saved.')
      }
      setUpdatedAt(new Date().toISOString())
    } catch (e) {
      setError(e?.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  function updateItem(itemId, patch) {
    setResponses((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        ...patch,
      },
    }))
  }

  async function pasteScreenshotsIntoItem(itemId, files) {
    if (!supabaseClient || !userId) return
    const incoming = (files || []).filter((f) => f && f.type?.startsWith('image/'))
    if (!incoming.length) return

    const current = responses[itemId]?.screenshots || []
    const remaining = 4 - current.length
    if (remaining <= 0) {
      setError('Max 4 screenshots per step.')
      return
    }

    setItemUploading((prev) => ({ ...prev, [itemId]: true }))
    setError('')
    try {
      const next = [...current]
      for (const file of incoming.slice(0, remaining)) {
        const url = await uploadSmokeChecklistScreenshot(supabaseClient, userId, file)
        next.push(url)
      }
      updateItem(itemId, { screenshots: next })
      triggerTapHapticLight()
    } catch (e) {
      setError(e?.message || 'Screenshot upload failed.')
    } finally {
      setItemUploading((prev) => ({ ...prev, [itemId]: false }))
    }
  }

  async function handleNotesPaste(itemId, e) {
    const imageFiles = imageFilesFromClipboardEvent(e)
    if (imageFiles.length) {
      e.preventDefault()
      await pasteScreenshotsIntoItem(itemId, imageFiles)
      return
    }
    if (navigator.clipboard?.read) {
      const asyncFiles = await imageFilesFromNavigatorClipboardRead()
      if (asyncFiles.length) {
        e.preventDefault()
        await pasteScreenshotsIntoItem(itemId, asyncFiles)
      }
    }
  }

  if (!isAdmin) {
    return (
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        contentClassName="px-3 py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
      >
        <div className="rounded-2xl bg-zinc-900 p-5 text-sm leading-relaxed text-zinc-400">
          Poker Stable smoke checklist is admin-only.
        </div>
      </ScrollLinkedEdgeTitleBarShell>
    )
  }

  if (!hostAllowed) {
    return (
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        contentClassName="px-3 py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
      >
        <div className="rounded-2xl bg-zinc-900 p-5 text-sm leading-relaxed text-zinc-400">
          Smoke checklist is for test only ... open on{' '}
          <span className="font-semibold text-zinc-200">lvslotpro.com</span> (or localhost).
        </div>
      </ScrollLinkedEdgeTitleBarShell>
    )
  }

  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      contentClassName="px-3 py-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
    >
      <div data-stable-smoke-checklist className="mx-auto max-w-2xl">
        <SlotsToolPageHeader
          center={
            <div className="text-center">
              <div className="text-lg font-black tracking-tight text-white">Stable smoke</div>
              <div className="text-[11px] text-zinc-500">
                v2 · {POKER_STABLE_SMOKE_CHECKLIST_VERSION} · {checkedCount}/{totalItems} checked
              </div>
            </div>
          }
        />

        <p className="mb-4 text-xs leading-relaxed text-zinc-500">
          Run on lvslotpro.com with player + Edge backer (e.g. @edgelord). Check items as you go,
          add notes, paste screenshots per step (Ctrl+V), then submit so Theo can review your report
          in chat.
        </p>

        <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            Run label (optional)
          </label>
          <input
            type="text"
            value={runLabel}
            onChange={(e) => setRunLabel(e.target.value)}
            placeholder="e.g. Aug 2 chunkyunc + edgelord"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <span>
              Status:{' '}
              <span
                className={
                  status === 'submitted' ? 'font-semibold text-emerald-400' : 'font-semibold text-amber-300'
                }
              >
                {status === 'submitted' ? 'Submitted' : 'Draft'}
              </span>
            </span>
            {submittedAt ? <span>Submitted {formatSavedAt(submittedAt)}</span> : null}
            {updatedAt ? <span>Updated {formatSavedAt(updatedAt)}</span> : null}
          </div>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading checklist…</p>
        ) : (
          <div className="space-y-5">
            {POKER_STABLE_SMOKE_SECTIONS.map((section) => (
              <section
                key={section.id}
                data-stable-smoke-section={section.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3"
              >
                <h3 className="text-sm font-bold text-white">
                  {section.id}. {section.title}
                </h3>
                {section.intro ? (
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">{section.intro}</p>
                ) : null}
                <ul className="mt-3 space-y-4">
                  {section.items.map((item) => {
                    const state = responses[item.id] || { checked: false, notes: '', screenshots: [] }
                    return (
                      <li
                        key={item.id}
                        data-stable-smoke-item={item.id}
                        className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3"
                      >
                        <label className="flex cursor-pointer items-start gap-3 touch-manipulation">
                          <input
                            type="checkbox"
                            checked={Boolean(state.checked)}
                            onChange={(e) => updateItem(item.id, { checked: e.target.checked })}
                            className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm leading-snug text-zinc-200">
                              <span className="mr-1.5 font-mono text-[11px] text-zinc-500">
                                {item.id}
                              </span>
                              {item.label}
                            </span>
                            {item.hint ? (
                              <span className="mt-1 block text-xs text-zinc-500">{item.hint}</span>
                            ) : null}
                          </span>
                        </label>
                        <label className="mt-3 block">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                            Notes
                          </span>
                          <textarea
                            value={state.notes}
                            onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                            onPaste={(e) => void handleNotesPaste(item.id, e)}
                            rows={2}
                            placeholder="Findings, pass/fail detail… (paste screenshot with Ctrl+V)"
                            className="w-full resize-y rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                          />
                        </label>
                        {userId ? (
                          <SmokeChecklistScreenshotAttachments
                            supabaseClient={supabaseClient}
                            userId={userId}
                            screenshots={state.screenshots || []}
                            onChange={(screenshots) => updateItem(item.id, { screenshots })}
                            onError={setError}
                            onUploadingChange={(uploading) =>
                              setItemUploading((prev) => ({ ...prev, [item.id]: uploading }))
                            }
                          />
                        ) : null}
                        {itemUploading[item.id] ? (
                          <p className="mt-2 text-xs text-amber-300/90">Uploading screenshot…</p>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {notice}
          </p>
        ) : null}

        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-10 mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={saving || loading || anyItemUploading}
            onClick={() => void persist('draft')}
            data-stable-smoke-save-btn
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save progress'}
          </button>
          <button
            type="button"
            disabled={saving || loading || anyItemUploading}
            onClick={() => void persist('submitted')}
            data-stable-smoke-submit-btn
            className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
          >
            {saving ? 'Submitting…' : 'Submit smoke report'}
          </button>
        </div>
      </div>
    </ScrollLinkedEdgeTitleBarShell>
  )
}
