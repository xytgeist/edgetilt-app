import { useCallback } from 'react'
import {
  coerceAlertPresetForMode,
  computeOfferAlertFireIso,
  dateFromDatetimeLocalValue,
  draftFromAiReviewPayload,
  OFFER_ALERT_DAY_9AM
} from '../utils'
import {
  requestCfR2DirectUpload,
  uploadFileToCfR2PresignedUrl,
  deleteCfR2OrphanObject,
} from '../../../utils/loungeCfImageMedia'

function isMissingAlertColumnsError(err) {
  const code = String(err?.code || '')
  const msg = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase()
  const mentionsMissingColumn = msg.includes('column') && (msg.includes('does not exist') || msg.includes('could not find'))
  const mentionsAlertColumns = msg.includes('alert_preset') || msg.includes('alert_fire_at')
  return code === '42703' || code === 'PGRST204' || (mentionsMissingColumn && mentionsAlertColumns)
}

function withoutAlertColumns(payload) {
  const next = { ...payload }
  delete next.alert_preset
  delete next.alert_fire_at
  return next
}

export default function useOffersCalendarMutations({
  supabaseClient,
  state,
  setters,
  actions,
  hasSlotsEdge = true,
  onRequireSubscribe,
}) {
  const {
    draft,
    allDay,
    editingId,
    completingReviewItemId,
    completingReviewUploadId,
    propagateCasinoOnSave,
    propagateTitleOnSave,
    propagateValueOnSave,
    reviewSourceImagePath
  } = state
  const {
    setCursorMonth,
    setWeekAnchor,
    setSelectedDays,
    setSaving,
    setError,
    setNotice,
    setUploading,
    setActiveImportBatchId
  } = setters
  const { closeForm, loadEvents, loadReviewQueue, refreshImportResults, resolveAlertPresetBeforeSave, onAfterSuccessfulSave } = actions

  const applyCurrentFieldsToAssociatedReviewItems = useCallback(async () => {
    if (!completingReviewUploadId || !completingReviewItemId) return
    try {
      setNotice('')
      const { data: sessionData } = await supabaseClient.auth.getSession()
      const user = sessionData?.session?.user
      if (!user) throw new Error('Sign in to apply fields across associated items.')
      const { data: rows, error: rowsErr } = await supabaseClient
        .from('offer_ai_review_items')
        .select('id,draft,upload_id,offer_uploads(storage_path)')
        .eq('upload_id', completingReviewUploadId)
        .eq('status', 'open')
        .neq('id', completingReviewItemId)
      if (rowsErr) throw rowsErr

      let changedCount = 0
      let createdCount = 0
      for (const row of rows || []) {
        const target = draftFromAiReviewPayload(row.draft || {})
        const merged = { ...target }
        const sameType = (target.offerType || 'other') === (draft.offerType || 'other')
        if (sameType && !merged.offerType && draft.offerType) merged.offerType = draft.offerType
        if (sameType && propagateCasinoOnSave && draft.casinoName?.trim()) {
          merged.casinoName = draft.casinoName.trim()
        }
        if (sameType && propagateTitleOnSave && draft.title?.trim()) {
          merged.title = draft.title.trim()
        }
        if (sameType && propagateValueOnSave && draft.valueAmount !== '') {
          merged.valueAmount = draft.valueAmount
        }

        const nextDraft = {
          casino_name: merged.casinoName || '',
          offer_type: merged.offerType || 'other',
          title: merged.title || '',
          start_at: merged.startAt || '',
          end_at: merged.endAt || '',
          value_amount: merged.valueAmount !== '' ? Number(merged.valueAmount) : null,
          notes: merged.notes || '',
          has_specific_time: merged.hasSpecificTime === true
        }

        const prevDraft = row.draft || {}
        const prevNorm = JSON.stringify({
          casino_name: String(prevDraft.casino_name ?? prevDraft.casinoName ?? ''),
          offer_type: String(prevDraft.offer_type ?? prevDraft.offerType ?? 'other'),
          title: String(prevDraft.title ?? ''),
          start_at: String(prevDraft.start_at ?? prevDraft.startAt ?? ''),
          end_at: String(prevDraft.end_at ?? prevDraft.endAt ?? ''),
          value_amount: prevDraft.value_amount ?? prevDraft.valueAmount ?? null,
          notes: String(prevDraft.notes ?? '')
        })
        const nextNorm = JSON.stringify(nextDraft)
        if (prevNorm === nextNorm) continue

        const hasRequiredFields = !!(merged.casinoName?.trim() && merged.title?.trim() && merged.startAt)
        let createdFromAssociated = false
        if (hasRequiredFields) {
          const associatedAllDay = merged.hasSpecificTime !== true
          const startDt = dateFromDatetimeLocalValue(merged.startAt)
          const endDt = merged.endAt ? dateFromDatetimeLocalValue(merged.endAt) : null
          if (startDt && (!merged.endAt || endDt)) {
            const normalizedStart = associatedAllDay
              ? new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate(), 0, 0, 0, 0)
              : startDt
            const normalizedEnd = endDt
              ? associatedAllDay
                ? new Date(endDt.getFullYear(), endDt.getMonth(), endDt.getDate(), 0, 0, 0, 0)
                : endDt
              : null
            if (!normalizedEnd || normalizedEnd.getTime() >= normalizedStart.getTime()) {
              const up = row.offer_uploads
              const associatedStoragePath = Array.isArray(up) ? up[0]?.storage_path : up?.storage_path
              const assocPreset = coerceAlertPresetForMode(draft.alertPreset || OFFER_ALERT_DAY_9AM, associatedAllDay)
              const assocFire = computeOfferAlertFireIso(assocPreset, normalizedStart, associatedAllDay)
              const insertPayload = {
                user_id: user.id,
                casino_name: merged.casinoName.trim(),
                offer_type: merged.offerType || 'other',
                title: merged.title.trim(),
                start_at: normalizedStart.toISOString(),
                end_at: normalizedEnd ? normalizedEnd.toISOString() : null,
                value_amount: merged.valueAmount !== '' ? Number(merged.valueAmount) : null,
                notes: merged.notes?.trim() || null,
                source_type: 'image_ai',
                source_image_path: associatedStoragePath || reviewSourceImagePath || null,
                alert_preset: assocPreset,
                alert_fire_at: assocFire
              }
              let { data: inserted, error: insertErr } = await supabaseClient
                .from('offer_events')
                .insert(insertPayload)
                .select('id')
                .single()
              if (insertErr && isMissingAlertColumnsError(insertErr)) {
                const retry = await supabaseClient
                  .from('offer_events')
                  .insert(withoutAlertColumns(insertPayload))
                  .select('id')
                  .single()
                inserted = retry.data
                insertErr = retry.error
              }
              if (!insertErr && inserted?.id) {
                const { error: resolveErr } = await supabaseClient
                  .from('offer_ai_review_items')
                  .update({
                    status: 'resolved',
                    resolved_at: new Date().toISOString(),
                    resolved_event_id: inserted.id
                  })
                  .eq('id', row.id)
                if (!resolveErr) {
                  createdFromAssociated = true
                  createdCount += 1
                }
              }
            }
          }
        }

        if (!createdFromAssociated) {
          const { error: updateErr } = await supabaseClient
            .from('offer_ai_review_items')
            .update({ draft: nextDraft })
            .eq('id', row.id)
          if (updateErr) throw updateErr
          changedCount += 1
        }
      }
      if (createdCount > 0 || changedCount > 0) {
        const parts = []
        if (createdCount > 0) parts.push(`Created ${createdCount} event${createdCount > 1 ? 's' : ''}`)
        if (changedCount > 0) parts.push(`updated ${changedCount} draft${changedCount > 1 ? 's' : ''}`)
        setNotice(`${parts.join(' and ')} for associated items.`)
        window.setTimeout(() => setNotice(''), 3200)
      } else {
        setNotice('No associated items changed (they may already be filled).')
        window.setTimeout(() => setNotice(''), 2400)
      }
      await loadReviewQueue()
      return changedCount
    } catch (e) {
      setError(e?.message || 'Could not apply values to associated review items.')
      return 0
    }
  }, [
    completingReviewUploadId,
    completingReviewItemId,
    setNotice,
    supabaseClient,
    draft,
    propagateCasinoOnSave,
    propagateTitleOnSave,
    propagateValueOnSave,
    reviewSourceImagePath,
    loadReviewQueue,
    setError
  ])

  const saveEvent = useCallback(async () => {
    let saveCompleted = false
    setSaving(true)
    setError('')
    try {
      const pendingReviewId = completingReviewItemId
      if (!draft.casinoName.trim()) throw new Error('Casino name is required.')
      if (!draft.title.trim()) throw new Error('Title is required.')
      if (!draft.startAt) throw new Error('Start date/time is required.')

      const startDt = new Date(draft.startAt)
      if (Number.isNaN(startDt.getTime())) throw new Error('Start date/time is invalid.')
      const endDt = draft.endAt ? new Date(draft.endAt) : null
      if (endDt && Number.isNaN(endDt.getTime())) throw new Error('End date/time is invalid.')
      const normalizedStart = allDay ? new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate(), 0, 0, 0, 0) : startDt
      const normalizedEnd = endDt ? (allDay ? new Date(endDt.getFullYear(), endDt.getMonth(), endDt.getDate(), 0, 0, 0, 0) : endDt) : null
      if (normalizedEnd && normalizedEnd.getTime() < normalizedStart.getTime()) {
        throw new Error('End date/time must be later than (or the same as) start.')
      }

      const initialAlertPreset = coerceAlertPresetForMode(draft.alertPreset || OFFER_ALERT_DAY_9AM, allDay)
      const alertPreset = resolveAlertPresetBeforeSave
        ? await resolveAlertPresetBeforeSave(initialAlertPreset, {
            allDay,
            editingId: Boolean(editingId)
          })
        : initialAlertPreset
      const alertFireAt = computeOfferAlertFireIso(alertPreset, normalizedStart, allDay)
      const payload = {
        casino_name: draft.casinoName.trim(),
        offer_type: draft.offerType,
        title: draft.title.trim(),
        start_at: normalizedStart.toISOString(),
        end_at: normalizedEnd ? normalizedEnd.toISOString() : null,
        value_amount: draft.valueAmount !== '' ? Number(draft.valueAmount) : null,
        notes: draft.notes.trim() || null,
        alert_preset: alertPreset,
        alert_fire_at: alertFireAt
      }

      if (editingId) {
        let { error: e } = await supabaseClient.from('offer_events').update(payload).eq('id', editingId)
        if (e && isMissingAlertColumnsError(e)) {
          const retry = await supabaseClient.from('offer_events').update(withoutAlertColumns(payload)).eq('id', editingId)
          e = retry.error
        }
        if (e) throw e
      } else {
        const { data: sessionData } = await supabaseClient.auth.getSession()
        const user = sessionData?.session?.user
        if (!user) throw new Error('Sign in to save offers to your calendar.')
        const pendingImg = reviewSourceImagePath
        if (pendingReviewId && (propagateCasinoOnSave || propagateTitleOnSave || propagateValueOnSave)) {
          await applyCurrentFieldsToAssociatedReviewItems()
        }
        const insertPayload = {
          ...payload,
          user_id: user.id,
          source_type: pendingReviewId ? 'image_ai' : 'manual',
          source_image_path: pendingReviewId ? pendingImg : null
        }
        let { data: inserted, error: e } = await supabaseClient.from('offer_events').insert(insertPayload).select('id').single()
        if (e && isMissingAlertColumnsError(e)) {
          const retry = await supabaseClient.from('offer_events').insert(withoutAlertColumns(insertPayload)).select('id').single()
          inserted = retry.data
          e = retry.error
        }
        if (e) throw e
        if (pendingReviewId && inserted?.id) {
          const { error: revErr } = await supabaseClient
            .from('offer_ai_review_items')
            .update({
              status: 'resolved',
              resolved_at: new Date().toISOString(),
              resolved_event_id: inserted.id
            })
            .eq('id', pendingReviewId)
          if (revErr) {
            console.warn('Could not mark AI review item resolved:', revErr)
          }
        }
      }
      // Fire-and-forget: add casino name to global list if new
      if (draft.casinoName?.trim()) {
        supabaseClient.rpc('upsert_casino_name', { p_name: draft.casinoName.trim() }).then(() => {}).catch(() => {})
      }

      saveCompleted = true
      if (!editingId && !pendingReviewId) {
        const focusDate = new Date(normalizedStart.getFullYear(), normalizedStart.getMonth(), normalizedStart.getDate())
        setCursorMonth(new Date(focusDate.getFullYear(), focusDate.getMonth(), 1))
        setWeekAnchor(focusDate)
        setSelectedDays([])
      }
      await loadEvents()
      await loadReviewQueue()
      if (typeof onAfterSuccessfulSave === 'function') {
        void onAfterSuccessfulSave()
      }
    } catch (e) {
      console.error('saveEvent error:', e)
      console.error('saveEvent payload (partial):', {
        offer_type: draft?.offerType,
        startAt: draft?.startAt,
        endAt: draft?.endAt,
        valueAmount: draft?.valueAmount
      })
      const parts = []
      if (e?.message) parts.push(e.message)
      if (e?.code) parts.push(`code: ${e.code}`)
      if (e?.details) parts.push(`details: ${e.details}`)
      if (e?.hint) parts.push(`hint: ${e.hint}`)
      setError(parts.join('\n') || 'Failed to save offer.')
    } finally {
      if (saveCompleted) {
        try {
          closeForm()
        } catch {
          // Never allow close-flow errors to keep the form open after a successful save.
        }
      }
      setSaving(false)
    }
  }, [
    setSaving,
    setError,
    completingReviewItemId,
    draft,
    allDay,
    editingId,
    supabaseClient,
    reviewSourceImagePath,
    propagateCasinoOnSave,
    propagateTitleOnSave,
    propagateValueOnSave,
    applyCurrentFieldsToAssociatedReviewItems,
    setCursorMonth,
    setWeekAnchor,
    setSelectedDays,
    closeForm,
    loadEvents,
    loadReviewQueue,
    resolveAlertPresetBeforeSave,
    onAfterSuccessfulSave
  ])

  const handleImportPhotos = useCallback(
    async (ev) => {
      if (!hasSlotsEdge) {
        onRequireSubscribe?.()
        ev.target.value = ''
        return
      }
      const files = Array.from(ev.target.files || []).filter((f) => f.type.startsWith('image/'))
      ev.target.value = ''
      if (!files.length) return
      closeForm()
      setUploading(true)
      setError('')
      try {
        const { data: sessionData } = await supabaseClient.auth.getSession()
        const user = sessionData?.session?.user
        if (!user) throw new Error('Sign in to upload mailer photos.')

        let batchId = null
        const { data: batchRow, error: batchErr } = await supabaseClient
          .from('offer_import_batches')
          .insert({ status: 'awaiting_parse' })
          .select('id')
          .single()
        if (!batchErr && batchRow?.id) {
          batchId = batchRow.id
        }

        // Try R2 first for the first file to check if configured (avoid repeated 503s)
        let r2Configured = null // null = unknown, true/false once determined
        for (const file of files) {
          let storagePath = null
          let bucketId = null

          if (r2Configured !== false) {
            // Attempt R2 presigned upload
            let mint = null
            try {
              mint = await requestCfR2DirectUpload(supabaseClient, {
                contentType: file.type || 'image/jpeg',
                fileName: file.name || '',
              })
            } catch (r2Err) {
              if (r2Configured === null) r2Configured = false
            }
            if (mint) {
              if (!mint.configured) {
                r2Configured = false
              } else {
                r2Configured = true
                await uploadFileToCfR2PresignedUrl(mint.data.uploadURL, file)
                storagePath = mint.data.publicUrl
                bucketId = 'cf-r2'
              }
            }
          }

          if (!storagePath) {
            // Fall back to Supabase Storage
            const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
            const safeName = `${crypto.randomUUID()}${ext}`
            const path = `${user.id}/${safeName}`
            const { error: upErr } = await supabaseClient.storage.from('offer-mailers').upload(path, file, {
              cacheControl: '3600',
              upsert: false
            })
            if (upErr) throw upErr
            storagePath = path
            bucketId = 'offer-mailers'
          }

          const row = {
            storage_path: storagePath,
            bucket_id: bucketId,
            file_name: file.name,
            mime_type: file.type || null,
            status: 'queued',
            ...(batchId ? { batch_id: batchId } : {})
          }
          const { error: rowErr } = await supabaseClient.from('offer_uploads').insert(row)
          if (rowErr) {
            // If we uploaded to R2 but failed to save the row, clean up the orphan
            if (bucketId === 'cf-r2') void deleteCfR2OrphanObject(supabaseClient, storagePath)
            throw rowErr
          }
        }

        if (batchId) {
          setActiveImportBatchId(batchId)
          await supabaseClient.from('offer_import_batches').update({ status: 'awaiting_parse' }).eq('id', batchId)
          const { error: invokeErr } = await supabaseClient.functions.invoke('process-offer-uploads', {
            body: { batchId, timezoneOffsetMinutes: new Date().getTimezoneOffset() }
          })
          if (invokeErr) {
            setError('Uploaded successfully, but AI parsing could not be started right now. Try again in a moment.')
          }
          void refreshImportResults(batchId)
        } else {
          setError('Uploaded successfully, but batch metadata is unavailable. Run supabase/offer_ai_import.sql.')
        }
      } catch (err) {
        setError(
          err?.message ||
            'Upload failed. Run supabase/offer_uploads.sql, offer_ai_import.sql, and storage_offer_mailers.sql if tables or bucket are missing.'
        )
      } finally {
        setUploading(false)
      }
    },
    [closeForm, hasSlotsEdge, onRequireSubscribe, refreshImportResults, setActiveImportBatchId, setError, setUploading, supabaseClient]
  )

  return {
    applyCurrentFieldsToAssociatedReviewItems,
    saveEvent,
    handleImportPhotos
  }
}
