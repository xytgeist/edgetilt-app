import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import 'react-datepicker/dist/react-datepicker.css'
import {
  OFFER_ALERT_DAY_9AM,
  OFFER_ALERT_NONE,
  isOfferEventFromPeriodStart,
  localDateKeyFromIso,
  localDateKeyFromDate,
  startOfWeekMonday,
  dateFromDatetimeLocalValue,
  normalizeLoadedEvent,
} from './utils'
import ReviewQueuePanel from './components/ReviewQueuePanel'
import UploadProgressOverlay from './components/UploadProgressOverlay'
import OfferFormModal from './components/OfferFormModal'
import WeekEventDetailModal from './components/WeekEventDetailModal'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import SlotsToolPageHeader from '../../components/SlotsToolPageHeader.jsx'
import useOffersCalendarState from './hooks/useOffersCalendarState'
import useOffersCalendarMutations from './hooks/useOffersCalendarMutations'
import useWebPushNotifications from './hooks/useWebPushNotifications'
import {
  OFFERS_ALERT_DEFAULT_PRESET_KEY_PREFIX,
  OFFERS_DEFAULT_VIEW_KEY_PREFIX,
  OFFERS_DELETE_CONFIRM_SKIP_KEY_PREFIX,
  OFFERS_IOS_ALERT_SETUP_SEEN_STORAGE_KEY_PREFIX,
  OFFERS_IOS_ALERT_REMINDER_SUPPRESS_STORAGE_KEY_PREFIX,
} from './offerStorageKeys'
import { consumePwaNotifEnablePending } from '../../utils/pwaNotificationPrompt'

export default function OffersCalendar({
  supabaseClient,
  pendingOfferEventIds,
  setPendingOfferEventIds,
  offerSpotlightEventIds,
  setOfferSpotlightEventIds,
  hasSlotsEdge = true,
  onRequireSubscribe,
  titleBarNavSlot = null,
  isAdmin = false,
  titleBarToolCloseVisible = false,
}) {
  /** Gate for the large legacy push / iOS help block below (was `false &&`). */
  const showLegacyOffersPushPanel = false
  const [sendingTestPush, setSendingTestPush] = useState(false)
  const [testPushMessage, setTestPushMessage] = useState('')
  const [runningReminderCheck, setRunningReminderCheck] = useState(false)
  const [reminderMessage, setReminderMessage] = useState('')
  const [isIosDevice, setIsIosDevice] = useState(false)
  const [isSafariBrowser, setIsSafariBrowser] = useState(false)
  const [isStandaloneMode, setIsStandaloneMode] = useState(false)
  const [showIosInstallHelp, setShowIosInstallHelp] = useState(true)

  const PUSH_LEAD_OPTIONS = [5, 10, 15, 30, 60]
  const [reminderLeadMinutes, setReminderLeadMinutes] = useState(15)
  const [remindersEnabled, setRemindersEnabled] = useState(true)
  const [reminderPrefsLoaded, setReminderPrefsLoaded] = useState(false)
  const [reminderPrefsSaving, setReminderPrefsSaving] = useState(false)
  const [reminderPrefsError, setReminderPrefsError] = useState('')
  const [pushAdvancedOpen, setPushAdvancedOpen] = useState(false)
  const [newEventAlertPresetDefault, setNewEventAlertPresetDefault] = useState(OFFER_ALERT_DAY_9AM)
  const [offersDefaultView, setOffersDefaultView] = useState('auto')
  const [alertPromptHandledForCurrentForm, setAlertPromptHandledForCurrentForm] = useState(false)
  const [alertDialogState, setAlertDialogState] = useState({
    open: false,
    mode: 'confirm',
    title: '',
    message: '',
    images: [],
    checkboxLabel: '',
    checkboxChecked: false,
    confirmLabel: 'Continue',
    cancelLabel: 'Cancel'
  })
  const alertDialogResolverRef = useRef(null)
  const alertDialogReturnCheckedRef = useRef(false)
  const alertDialogCheckedRef = useRef(false)
  const pendingIosMetadataSyncRef = useRef(null)

  const {
    isSupported: pushSupported,
    permission: pushPermission,
    isBusy: pushBusy,
    statusMessage: pushStatusMessage,
    isSubscribed: pushSubscribed,
    canEnable: canEnablePush,
    canDisable: canDisablePush,
    enable: enablePush,
    disable: disablePush,
  } = useWebPushNotifications({ supabaseClient })

  const getAlertDefaultStorageKeyForUser = useCallback((userId) => `${OFFERS_ALERT_DEFAULT_PRESET_KEY_PREFIX}${userId}`, [])
  const getOffersDefaultViewStorageKeyForUser = useCallback((userId) => `${OFFERS_DEFAULT_VIEW_KEY_PREFIX}${userId}`, [])
  const getDeleteConfirmSkipStorageKeyForUser = useCallback((userId) => `${OFFERS_DELETE_CONFIRM_SKIP_KEY_PREFIX}${userId}`, [])
  const getIosAlertSetupSeenStorageKeyForUser = useCallback((userId) => `${OFFERS_IOS_ALERT_SETUP_SEEN_STORAGE_KEY_PREFIX}${userId}`, [])
  const getIosAlertReminderSuppressStorageKeyForUser = useCallback(
    (userId) => `${OFFERS_IOS_ALERT_REMINDER_SUPPRESS_STORAGE_KEY_PREFIX}${userId}`,
    []
  )
  const setStoredAlertDefaultForCurrentUser = useCallback(
    async (nextPreset) => {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      const userId = session?.user?.id
      if (!userId || typeof window === 'undefined') return
      window.localStorage.setItem(getAlertDefaultStorageKeyForUser(userId), nextPreset)
    },
    [getAlertDefaultStorageKeyForUser, supabaseClient]
  )

  const setStoredOffersDefaultViewForCurrentUser = useCallback(
    async (nextView) => {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      const userId = session?.user?.id
      if (!userId || typeof window === 'undefined') return
      window.localStorage.setItem(getOffersDefaultViewStorageKeyForUser(userId), nextView)
    },
    [getOffersDefaultViewStorageKeyForUser, supabaseClient]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user || typeof window === 'undefined') {
        if (!cancelled) setNewEventAlertPresetDefault(OFFER_ALERT_DAY_9AM)
        return
      }
      const stored = window.localStorage.getItem(getAlertDefaultStorageKeyForUser(session.user.id))
      if (cancelled) return
      setNewEventAlertPresetDefault(stored === OFFER_ALERT_NONE ? OFFER_ALERT_NONE : OFFER_ALERT_DAY_9AM)
    })()
    return () => {
      cancelled = true
    }
  }, [getAlertDefaultStorageKeyForUser, supabaseClient])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user || typeof window === 'undefined') {
        if (!cancelled) setOffersDefaultView('auto')
        return
      }
      const stored = window.localStorage.getItem(getOffersDefaultViewStorageKeyForUser(session.user.id))
      if (cancelled) return
      if (stored === 'month' || stored === 'week' || stored === 'agenda' || stored === 'auto') {
        setOffersDefaultView(stored)
      } else {
        setOffersDefaultView('auto')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getOffersDefaultViewStorageKeyForUser, supabaseClient])

  const persistReminderRule = useCallback(
    async (leadMinutes, enabled) => {
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession()
      if (sessionError) throw sessionError
      const userId = sessionData?.session?.user?.id
      if (!userId) throw new Error('Sign in required.')
      const { error: disableError } = await supabaseClient
        .from('offer_notification_rules')
        .update({ enabled: false })
        .eq('user_id', userId)
      if (disableError) throw disableError
      if (!enabled) return
      const { error } = await supabaseClient.from('offer_notification_rules').upsert(
        { user_id: userId, lead_minutes: leadMinutes, enabled: true },
        { onConflict: 'user_id,lead_minutes' }
      )
      if (error) throw error
    },
    [supabaseClient]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setReminderPrefsError('')
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user || cancelled) {
        setReminderPrefsLoaded(true)
        return
      }
      const { data: rules, error } = await supabaseClient
        .from('offer_notification_rules')
        .select('lead_minutes, enabled')
        .eq('user_id', session.user.id)
      if (cancelled) return
      if (error) {
        setReminderPrefsError(error.message)
        setReminderPrefsLoaded(true)
        return
      }
      const list = rules || []
      const active = list.find((r) => r.enabled)
      if (active) {
        setReminderLeadMinutes(active.lead_minutes)
        setRemindersEnabled(true)
      } else if (list.length > 0) {
        setReminderLeadMinutes(list[0].lead_minutes)
        setRemindersEnabled(false)
      } else {
        setReminderLeadMinutes(15)
        setRemindersEnabled(true)
      }
      setReminderPrefsLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [supabaseClient])

  const pushSubscribedRef = useRef(false)
  useEffect(() => {
    if (!reminderPrefsLoaded) return
    if (pushSubscribed && !pushSubscribedRef.current && remindersEnabled) {
      void (async () => {
        try {
          await persistReminderRule(reminderLeadMinutes, true)
        } catch {
          /* user can fix via toggles */
        }
      })()
    }
    pushSubscribedRef.current = pushSubscribed
  }, [pushSubscribed, remindersEnabled, reminderLeadMinutes, persistReminderRule, reminderPrefsLoaded])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ua = window.navigator.userAgent || ''
    const isIos = /iPhone|iPad|iPod/i.test(ua)
    const isSafari =
      /Safari/i.test(ua) &&
      !/CriOS/i.test(ua) &&
      !/FxiOS/i.test(ua) &&
      !/EdgiOS/i.test(ua) &&
      !/OPiOS/i.test(ua)
    const standaloneViaMedia = window.matchMedia?.('(display-mode: standalone)')?.matches === true
    const standaloneViaNavigator = window.navigator.standalone === true
    setIsIosDevice(isIos)
    setIsSafariBrowser(isIos && isSafari)
    setIsStandaloneMode(standaloneViaMedia || standaloneViaNavigator)
  }, [])

  const sendTestPush = useCallback(async () => {
    setSendingTestPush(true)
    setTestPushMessage('')
    try {
      const { data, error } = await supabaseClient.functions.invoke('send-test-push', {
        body: {
          title: 'Edge Test Notification',
          body: 'If you can read this, web push is working.',
          url: '/?tab=offers',
        },
      })
      if (error) throw error
      const sent = Number(data?.sent || 0)
      const failed = Number(data?.failed || 0)
      const removed = Number(data?.removed || 0)
      setTestPushMessage(`Test sent: ${sent} succeeded, ${failed} failed, ${removed} stale subscription(s) removed.`)
    } catch (error) {
      setTestPushMessage(error?.message || 'Could not send test push.')
    } finally {
      setSendingTestPush(false)
    }
  }, [supabaseClient])

  const saveReminderTiming = useCallback(
    async (nextLead, nextEnabled) => {
      if (!pushSubscribed || !reminderPrefsLoaded) return
      setReminderPrefsSaving(true)
      setReminderPrefsError('')
      try {
        await persistReminderRule(nextLead, nextEnabled)
      } catch (e) {
        setReminderPrefsError(e?.message || 'Could not save reminder settings.')
      } finally {
        setReminderPrefsSaving(false)
      }
    },
    [pushSubscribed, reminderPrefsLoaded, persistReminderRule]
  )

  const runReminderCheckNow = useCallback(async () => {
    setRunningReminderCheck(true)
    setReminderMessage('')
    try {
      const { data, error } = await supabaseClient.functions.invoke('send-due-offer-reminders', {
        body: { lookaheadMinutes: 120 },
      })
      if (error) throw error
      setReminderMessage(
        `Reminder check complete: queued ${Number(data?.queued || 0)}, sent ${Number(data?.sent || 0)}, failed ${Number(
          data?.failed || 0
        )}. (Ensure a reminder rule is enabled and matches your offer times.)`
      )
    } catch (error) {
      setReminderMessage(error?.message || 'Could not run reminder check.')
    } finally {
      setRunningReminderCheck(false)
    }
  }, [supabaseClient])

  const iosInstallRequired = isIosDevice && !isStandaloneMode
  const allowPushControls = !iosInstallRequired
  const canEnablePushUi = canEnablePush && allowPushControls
  const canDisablePushUi = canDisablePush && allowPushControls
  const canSendTestPushUi = pushSubscribed && !sendingTestPush && allowPushControls
  const canRunRemindersUi = pushSubscribed && !runningReminderCheck && allowPushControls

  const closeAlertDialog = useCallback((result) => {
    const resolver = alertDialogResolverRef.current
    const returnChecked = alertDialogReturnCheckedRef.current === true
    const checked = alertDialogCheckedRef.current === true
    alertDialogResolverRef.current = null
    alertDialogReturnCheckedRef.current = false
    alertDialogCheckedRef.current = false
    setAlertDialogState((cur) => ({ ...cur, open: false }))
    if (resolver) {
      if (returnChecked) resolver({ confirmed: result === true, checked })
      else resolver(result)
    }
  }, [])

  const showAlertDialog = useCallback(
    (config) =>
      new Promise((resolve) => {
        alertDialogResolverRef.current = resolve
        alertDialogReturnCheckedRef.current = config.returnChecked === true
        alertDialogCheckedRef.current = config.checkboxDefaultChecked === true
        setAlertDialogState({
          open: true,
          mode: config.mode || 'confirm',
          title: config.title || '',
          message: config.message || '',
          images: Array.isArray(config.images) ? config.images : [],
          checkboxLabel: config.checkboxLabel || '',
          checkboxChecked: config.checkboxDefaultChecked === true,
          confirmLabel: config.confirmLabel || 'Continue',
          cancelLabel: config.cancelLabel || 'Cancel'
        })
      }),
    []
  )

  const showAppConfirm = useCallback(
    async ({ title, message, confirmLabel = 'Continue', cancelLabel = 'Cancel' }) =>
      (await showAlertDialog({ mode: 'confirm', title, message, confirmLabel, cancelLabel })) === true,
    [showAlertDialog]
  )

  const showAppInfo = useCallback(
    async ({ title, message, images = [], confirmLabel = 'OK', checkboxLabel = '', checkboxDefaultChecked = false, returnChecked = false }) =>
      await showAlertDialog({
        mode: 'info',
        title,
        message,
        images,
        confirmLabel,
        checkboxLabel,
        checkboxDefaultChecked,
        returnChecked,
        cancelLabel: ''
      }),
    [showAlertDialog]
  )

  useEffect(
    () => () => {
      if (alertDialogResolverRef.current) {
        alertDialogResolverRef.current(false)
        alertDialogResolverRef.current = null
      }
    },
    []
  )

  /** Finish push subscribe after user accepts iOS PWA notification permission in AppShell. */
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isIosDevice || !isStandaloneMode) return
    if (pushSubscribed) return
    let cancelled = false
    ;(async () => {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      const userId = session?.user?.id
      if (!userId || cancelled) return
      if (!consumePwaNotifEnablePending(userId)) return
      await enablePush()
    })()
    return () => {
      cancelled = true
    }
  }, [enablePush, isIosDevice, isStandaloneMode, pushSubscribed, supabaseClient])

  const maybeResolveAlertPresetWithPrompt = useCallback(
    async (alertPreset) => {
      if (alertPreset === OFFER_ALERT_NONE || pushSubscribed) return alertPreset

      const setDefaultNone = async () => {
        setNewEventAlertPresetDefault(OFFER_ALERT_NONE)
        await setStoredAlertDefaultForCurrentUser(OFFER_ALERT_NONE)
      }

      if (iosInstallRequired) {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession()
        const userId = session?.user?.id
        const metadata = session?.user?.user_metadata || {}
        const seenStorageKey = userId ? getIosAlertSetupSeenStorageKeyForUser(userId) : ''
        const suppressStorageKey = userId ? getIosAlertReminderSuppressStorageKeyForUser(userId) : ''
        const hasSetupSeenMeta = typeof metadata.offers_ios_alert_setup_seen === 'boolean'
        const hasReminderSuppressMeta = typeof metadata.offers_ios_alert_reminder_suppress === 'boolean'
        let setupSeen = metadata.offers_ios_alert_setup_seen === true
        let reminderSuppress = metadata.offers_ios_alert_reminder_suppress === true
        if (userId && typeof window !== 'undefined') {
          try {
            if (!hasSetupSeenMeta) setupSeen = window.localStorage.getItem(seenStorageKey) === '1'
            if (!hasReminderSuppressMeta) reminderSuppress = window.localStorage.getItem(suppressStorageKey) === '1'
          } catch {
            // ignore storage read failures (private mode/restricted storage)
          }
        }

        const persistFlags = (nextSeen, nextSuppress = reminderSuppress) => {
          if (!userId) return
          if (typeof window !== 'undefined') {
            try {
              if (nextSeen) window.localStorage.setItem(seenStorageKey, '1')
              if (nextSuppress) window.localStorage.setItem(suppressStorageKey, '1')
            } catch {
              // ignore storage write failures
            }
          }
          pendingIosMetadataSyncRef.current = {
            userId,
            setupSeen: nextSeen,
            reminderSuppress: nextSuppress
          }
        }

        if (!setupSeen) {
          await showAppInfo({
            title: 'Enable Notifications on iPhone',
            message: isSafariBrowser
              ? "On iPhone, alert notifications only work from the Home Screen app. Don't blame me, blame Apple. 🤷‍♂️\n\nTo enable alerts:\n1) Tap Share -> Add to Home Screen\n2) Open app from Home Screen icon\n3) Allow Notifications"
              : "On iPhone, alert notifications only work from the Home Screen app.\n\nTo enable alerts:\n1) Open Edge in SAFARI (blame Apple 🤷‍♂️)\n2) Tap Share -> Add to Home Screen\n3) Open app from Home Screen icon\n4) Allow Notifications",
            images: [{ src: '/onboarding/ios-setup.png', alt: 'iPhone Home Screen setup steps', caption: '' }],
            confirmLabel: 'Got it'
          })
          persistFlags(true, reminderSuppress)
          return alertPreset
        }

        if (reminderSuppress) return alertPreset

        const infoResult = await showAppInfo({
          title: 'Remember...',
          message: "We'll save your event and alert, but you won't receive the alerts until you add the app to Home Screen!",
          images: [{ src: '/onboarding/ios-setup.png', alt: 'iPhone Home Screen setup steps', caption: '' }],
          confirmLabel: 'Got it',
          checkboxLabel: 'No more reminders',
          checkboxDefaultChecked: false,
          returnChecked: true
        })
        const checked = infoResult?.checked === true
        if (checked) persistFlags(true, true)
        return alertPreset
      }

      const shouldEnable = await showAppConfirm({
        title: 'Enable Notifications',
        message: '',
        confirmLabel: 'Enable',
        cancelLabel: 'Cancel'
      })
      if (!shouldEnable) {
        await setDefaultNone()
        return OFFER_ALERT_NONE
      }

      const enabled = await enablePush()
      if (!enabled) {
        return alertPreset
      }
      return alertPreset
    },
    [
      enablePush,
      getIosAlertReminderSuppressStorageKeyForUser,
      getIosAlertSetupSeenStorageKeyForUser,
      iosInstallRequired,
      isSafariBrowser,
      pushSubscribed,
      setStoredAlertDefaultForCurrentUser,
      showAppConfirm,
      showAppInfo,
      supabaseClient,
    ]
  )

  const handleAlertPresetSelection = useCallback(
    async (nextPreset, ctx = {}) => {
      const isEditing = ctx?.editingId === true
      if (isEditing || nextPreset === OFFER_ALERT_NONE || pushSubscribed) return nextPreset
      if (iosInstallRequired) return nextPreset
      setAlertPromptHandledForCurrentForm(true)
      return maybeResolveAlertPresetWithPrompt(nextPreset)
    },
    [iosInstallRequired, maybeResolveAlertPresetWithPrompt, pushSubscribed]
  )

  const resolveAlertPresetBeforeSave = useCallback(
    async (alertPreset, { editingId }) => {
      if (editingId || alertPreset === OFFER_ALERT_NONE || pushSubscribed) return alertPreset
      if (alertPromptHandledForCurrentForm) return alertPreset
      try {
        return await maybeResolveAlertPresetWithPrompt(alertPreset)
      } catch {
        return alertPreset
      }
    },
    [alertPromptHandledForCurrentForm, maybeResolveAlertPresetWithPrompt, pushSubscribed]
  )

  const {
    fileInputRef,
    longPressTimerRef,
    casinoFieldRef,
    titleFieldRef,
    events,
    loading,
    saving,
    setSaving,
    uploading,
    setUploading,
    syncingImportResults,
    setActiveImportBatchId,
    error,
    setError,
    notice,
    setNotice,
    reviewQueue,
    completingReviewItemId,
    completingReviewUploadId,
    propagateCasinoOnSave,
    setPropagateCasinoOnSave,
    propagateTitleOnSave,
    setPropagateTitleOnSave,
    propagateValueOnSave,
    setPropagateValueOnSave,
    reviewSourceImagePath,
    reviewSourceImageUrl,
    reviewSourceImageLoading,
    showForm,
    editingId,
    selectedDays,
    setSelectedDays,
    cursorMonth,
    setCursorMonth,
    draft,
    setDraft,
    allDay,
    setAllDay,
    showCasinoSuggestions,
    setShowCasinoSuggestions,
    showTitleSuggestions,
    setShowTitleSuggestions,
    expandedEventId,
    setExpandedEventId,
    notesPreviewRefs,
    notesOverflowById,
    setNotesOverflowById,
    calendarMode,
    setCalendarMode,
    weekDetailEvent,
    setWeekDetailEvent,
    viewMenuOpen,
    setViewMenuOpen,
    viewMenuRef,
    isLandscape,
    setIsLandscape,
    weekAnchor,
    setWeekAnchor,
    offerTypeMeta,
    dayTypeDots,
    calendarCells,
    monthTitle,
    todayKey,
    uploadSpinnerMessage,
    loadEvents,
    loadReviewQueue,
    refreshImportResults,
    beginReviewItem,
    skipReviewItem,
    skipCurrentReviewFromForm,
    closeForm,
    openForm,
    beginEdit,
    beginDuplicate,
  } = useOffersCalendarState({
    supabaseClient,
    normalizeLoadedEvent,
    newEventAlertPresetDefault
  })

  useEffect(() => {
    if (offersDefaultView === 'month' || offersDefaultView === 'week' || offersDefaultView === 'agenda') {
      setCalendarMode(offersDefaultView)
    } else if (offersDefaultView === 'auto') {
      setCalendarMode('auto')
    }
  }, [offersDefaultView, setCalendarMode])

  useEffect(() => {
    setAlertPromptHandledForCurrentForm(false)
  }, [showForm, editingId])

  const pendingOfferEventIdsKey = pendingOfferEventIds.join('\u0001')
  useEffect(() => {
    if (!pendingOfferEventIds.length) return
    const existingIds = pendingOfferEventIds.filter((id) => events.some((ev) => ev.id === id))
    if (!existingIds.length) return
    setCalendarMode('agenda')
    setSelectedDays([])
    setExpandedEventId(existingIds[0])
    setOfferSpotlightEventIds(existingIds)
    setPendingOfferEventIds([])
    window.setTimeout(() => setOfferSpotlightEventIds([]), 12000)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('eventId')
      url.searchParams.delete('eventIds')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [
    events,
    pendingOfferEventIdsKey,
    pendingOfferEventIds,
    setCalendarMode,
    setExpandedEventId,
    setOfferSpotlightEventIds,
    setPendingOfferEventIds,
    setSelectedDays,
  ])

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target
      if (casinoFieldRef.current && !casinoFieldRef.current.contains(target)) {
        setShowCasinoSuggestions(false)
      }
      if (titleFieldRef.current && !titleFieldRef.current.contains(target)) {
        setShowTitleSuggestions(false)
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(target)) {
        setViewMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [
    casinoFieldRef,
    titleFieldRef,
    viewMenuRef,
    setShowCasinoSuggestions,
    setShowTitleSuggestions,
    setViewMenuOpen,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const media = window.matchMedia('(orientation: landscape)')
    const sync = () => setIsLandscape(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [setIsLandscape])

  const toggleExpandedEvent = (eventId) => {
    setExpandedEventId((id) => (id === eventId ? null : eventId))
  }

  const toggleSelectedDay = (dayKey) => {
    setSelectedDays((current) => (current.includes(dayKey) ? current.filter((d) => d !== dayKey) : [...current, dayKey]))
  }

  const deleteEvent = async (id) => {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession()
    const userId = session?.user?.id
    let skipConfirm = false
    if (userId && typeof window !== 'undefined') {
      try {
        skipConfirm = window.localStorage.getItem(getDeleteConfirmSkipStorageKeyForUser(userId)) === '1'
      } catch {
        skipConfirm = false
      }
    }

    if (!skipConfirm) {
      const deleteResult = await showAppInfo({
        title: 'Delete Event?',
        message: 'This will permanently delete the event.',
        confirmLabel: 'Delete',
        checkboxLabel: "Don't ask again",
        checkboxDefaultChecked: false,
        returnChecked: true
      })
      const confirmed = deleteResult?.confirmed === true
      const dontAskAgain = deleteResult?.checked === true
      if (!confirmed) return
      if (dontAskAgain && userId && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(getDeleteConfirmSkipStorageKeyForUser(userId), '1')
        } catch {
          // Ignore local storage failures.
        }
      }
    }

    const { error: e } = await supabaseClient.from('offer_events').delete().eq('id', id)
    if (e) {
      setError(e?.message || 'Failed to delete event.')
      return
    }
    if (editingId === id) closeForm()
    await loadEvents()
  }

  const { saveEvent, handleImportPhotos } = useOffersCalendarMutations({
    supabaseClient,
    state: {
      draft,
      allDay,
      editingId,
      completingReviewItemId,
      completingReviewUploadId,
      propagateCasinoOnSave,
      propagateTitleOnSave,
      propagateValueOnSave,
      reviewSourceImagePath,
      calendarMode
    },
    setters: {
      setCalendarMode,
      setCursorMonth,
      setWeekAnchor,
      setSelectedDays,
      setSaving,
      setError,
      setNotice,
      setUploading,
      setActiveImportBatchId
    },
    actions: {
      closeForm,
      loadEvents,
      loadReviewQueue,
      refreshImportResults,
      resolveAlertPresetBeforeSave,
      onAfterSuccessfulSave: async () => {
        const pending = pendingIosMetadataSyncRef.current
        if (!pending) return
        try {
          const {
            data: { session },
          } = await supabaseClient.auth.getSession()
          if (!session?.user || session.user.id !== pending.userId) return
          const nextMetadata = {
            ...(session.user.user_metadata || {}),
            offers_ios_alert_setup_seen: pending.setupSeen === true,
            offers_ios_alert_reminder_suppress: pending.reminderSuppress === true
          }
          await supabaseClient.auth.updateUser({ data: nextMetadata })
          pendingIosMetadataSyncRef.current = null
        } catch {
          // Keep pending value for a future successful save attempt.
        }
      }
    },
    hasSlotsEdge,
    onRequireSubscribe,
  })

  const activeCalendarView = useMemo(() => {
    if (calendarMode === 'agenda') return 'agenda'
    if (calendarMode === 'week') return 'week'
    if (calendarMode === 'month') return 'month'
    return isLandscape ? 'week' : 'month'
  }, [calendarMode, isLandscape])

  useEffect(() => {
    setWeekDetailEvent(null)
  }, [activeCalendarView, setWeekDetailEvent])

  const [weekDetailImageUrl, setWeekDetailImageUrl] = useState(null)
  useEffect(() => {
    setWeekDetailImageUrl(null)
    const path = weekDetailEvent?.source_image_path
    if (!path) return
    // R2 images are full public URLs; Supabase Storage paths are relative and need a signed URL
    if (path.startsWith('https://') || path.startsWith('http://')) {
      setWeekDetailImageUrl(path)
      return
    }
    let cancelled = false
    supabaseClient.storage
      .from('offer-mailers')
      .createSignedUrl(path, 1800)
      .then(({ data }) => { if (!cancelled && data?.signedUrl) setWeekDetailImageUrl(data.signedUrl) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [weekDetailEvent, supabaseClient])

  const weekStart = useMemo(() => startOfWeekMonday(weekAnchor), [weekAnchor])
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + idx)
      return d
    })
  }, [weekStart])
  const weekTitle = `${weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${weekDays[6].toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })}`
  const weekStartMs = weekDays[0].getTime()
  const weekEndMs = new Date(weekDays[6].getFullYear(), weekDays[6].getMonth(), weekDays[6].getDate(), 23, 59, 59, 999).getTime()

  const weekEvents = useMemo(() => {
    return events
      .map((ev) => {
        const st = new Date(ev.start_at)
        const enRaw = ev.end_at ? new Date(ev.end_at) : st
        const en = Number.isNaN(enRaw.getTime()) ? st : enRaw
        const startDay = new Date(st.getFullYear(), st.getMonth(), st.getDate()).getTime()
        const endDay = new Date(en.getFullYear(), en.getMonth(), en.getDate(), 23, 59, 59, 999).getTime()
        return { ...ev, _startMs: startDay, _endMs: endDay }
      })
      .filter((ev) => ev._endMs >= weekStartMs && ev._startMs <= weekEndMs)
      .sort((a, b) => a._startMs - b._startMs)
      .map((ev) => {
        const startCol = Math.max(0, Math.floor((ev._startMs - weekStartMs) / 86400000))
        const endCol = Math.min(6, Math.floor((ev._endMs - weekStartMs) / 86400000))
        return { ...ev, _startCol: startCol, _span: endCol - startCol + 1 }
      })
  }, [events, weekStartMs, weekEndMs])
  const weekEventLanes = useMemo(() => {
    const lanes = []
    for (const ev of weekEvents) {
      let placed = false
      for (const lane of lanes) {
        const last = lane[lane.length - 1]
        const lastEndCol = last._startCol + last._span - 1
        if (ev._startCol > lastEndCol) {
          lane.push(ev)
          placed = true
          break
        }
      }
      if (!placed) lanes.push([ev])
    }
    return lanes
  }, [weekEvents])

  const listPeriodStart = useMemo(() => {
    if (activeCalendarView === 'week') return weekStart
    if (activeCalendarView === 'month') {
      return new Date(cursorMonth.getFullYear(), cursorMonth.getMonth(), 1)
    }
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }, [activeCalendarView, weekStart, cursorMonth])

  const listEvents = useMemo(() => {
    let filtered = events.filter((ev) => isOfferEventFromPeriodStart(ev, listPeriodStart))
    if (selectedDays.length > 0) {
      const selectedSet = new Set(selectedDays)
      filtered = filtered.filter((ev) => selectedSet.has(localDateKeyFromIso(ev.start_at)))
    }
    return filtered.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  }, [events, listPeriodStart, selectedDays])

  useEffect(() => {
    const next = {}
    for (const ev of listEvents) {
      const el = notesPreviewRefs.current[ev.id]
      if (!el) continue
      next[ev.id] = el.scrollWidth > el.clientWidth
    }
    setNotesOverflowById(next)
  }, [events, selectedDays, expandedEventId, listEvents, notesPreviewRefs, setNotesOverflowById])

  const casinoNameOptions = useMemo(() => {
    return Array.from(new Set(events.map((ev) => ev.casino_name?.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [events])

  const titleOptions = useMemo(() => {
    return Array.from(new Set(events.map((ev) => ev.title?.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [events])

  const filteredCasinoOptions = useMemo(() => {
    const q = draft.casinoName.trim().toLowerCase()
    if (!q) return casinoNameOptions.slice(0, 8)
    return casinoNameOptions.filter((name) => name.toLowerCase().includes(q)).slice(0, 8)
  }, [casinoNameOptions, draft.casinoName])

  const filteredTitleOptions = useMemo(() => {
    const q = draft.title.trim().toLowerCase()
    if (!q) return titleOptions.slice(0, 8)
    return titleOptions.filter((name) => name.toLowerCase().includes(q)).slice(0, 8)
  }, [titleOptions, draft.title])

  const startDayPress = (dayKey) => {
    longPressTimerRef.current = window.setTimeout(() => {
      openForm(dayKey)
    }, 500)
  }

  const endDayPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleAddEvent = () => {
    setViewMenuOpen(false)
    const dayKey = selectedDays.length === 1 ? selectedDays[0] : null
    openForm(dayKey)
  }

  const hasVisibleTime = (iso) => {
    const d = new Date(iso)
    return d.getHours() !== 0 || d.getMinutes() !== 0
  }

  const startSelected = dateFromDatetimeLocalValue(draft.startAt)
  const endSelected = dateFromDatetimeLocalValue(draft.endAt)
  const sameDayStartEnd =
    !!startSelected &&
    !!endSelected &&
    startSelected.getFullYear() === endSelected.getFullYear() &&
    startSelected.getMonth() === endSelected.getMonth() &&
    startSelected.getDate() === endSelected.getDate()
  const endMinTime =
    !startSelected || !sameDayStartEnd
      ? new Date(0, 0, 0, 0, 0)
      : new Date(0, 0, 0, startSelected.getHours(), startSelected.getMinutes())
  const endMaxTime = new Date(0, 0, 0, 23, 45)
  const listRows = useMemo(() => {
    if (activeCalendarView === 'agenda') return listEvents.map((e) => ({ type: 'event', event: e }))
    const today = new Date()
    const todayStartMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    const rows = []
    let insertedTodayDivider = false
    for (const e of listEvents) {
      const startsTodayOrLater = new Date(e.start_at).getTime() >= todayStartMs
      if (!insertedTodayDivider && startsTodayOrLater) {
        rows.push({ type: 'today-divider' })
        insertedTodayDivider = true
      }
      rows.push({ type: 'event', event: e })
    }
    return rows
  }, [activeCalendarView, listEvents])

  useEffect(() => {
    if (activeCalendarView !== 'month' && selectedDays.length > 0) {
      setSelectedDays([])
    }
  }, [activeCalendarView, selectedDays.length, setSelectedDays])

  const isWeekView = activeCalendarView === 'week'
  const weekLayoutFullBleed = isWeekView && isLandscape

  return (
    <>
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        titleBarToolCloseVisible={titleBarToolCloseVisible}
        fullWidth={weekLayoutFullBleed}
        contentClassName={
          weekLayoutFullBleed
            ? 'px-3 pt-3 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]'
            : 'px-3 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]'
        }
      >

      <SlotsToolPageHeader
        center={
          <div className="flex min-h-10 w-full items-center justify-center gap-1.5">
            {activeCalendarView !== 'agenda' ? (
              <button
                type="button"
                onClick={() => {
                  if (activeCalendarView === 'week') {
                    setWeekAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))
                    return
                  }
                  setCursorMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-[27px] font-bold leading-none text-zinc-200 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                aria-label={activeCalendarView === 'week' ? 'Previous week' : 'Previous month'}
              >
                <span className="block translate-y-[-0.08em]" aria-hidden>
                  ‹
                </span>
              </button>
            ) : null}
            <div className="min-w-0 flex-1 truncate text-center text-[15px] font-black leading-none tracking-tight text-white sm:text-[17px]">
              {activeCalendarView === 'agenda' ? 'Agenda' : activeCalendarView === 'week' ? weekTitle : monthTitle}
            </div>
            {activeCalendarView !== 'agenda' ? (
              <button
                type="button"
                onClick={() => {
                  if (activeCalendarView === 'week') {
                    setWeekAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))
                    return
                  }
                  setCursorMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-[27px] font-bold leading-none text-zinc-200 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                aria-label={activeCalendarView === 'week' ? 'Next week' : 'Next month'}
              >
                <span className="block translate-y-[-0.08em]" aria-hidden>
                  ›
                </span>
              </button>
            ) : null}
          </div>
        }
        trailing={
          <div className="relative z-20 flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={handleAddEvent}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-[28px] font-bold leading-none text-violet-300 touch-manipulation [-webkit-tap-highlight-color:transparent]"
              aria-label="Add event"
            >
              <span className="block translate-y-[-0.06em]" aria-hidden>
                +
              </span>
            </button>
            <div ref={viewMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setViewMenuOpen((v) => !v)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-[18px] font-bold leading-none tracking-tight text-zinc-200 touch-manipulation [-webkit-tap-highlight-color:transparent]"
              aria-label="Calendar display options"
              aria-expanded={viewMenuOpen}
              aria-haspopup="menu"
            >
              <span className="block translate-y-[-0.08em]" aria-hidden>
                ⋯
              </span>
            </button>
            {viewMenuOpen ? (
              <div
                className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setCalendarMode('month')
                    setOffersDefaultView('month')
                    await setStoredOffersDefaultViewForCurrentUser('month')
                    setViewMenuOpen(false)
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Calendar {offersDefaultView === 'month' ? '• default' : ''}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setCalendarMode('week')
                    setOffersDefaultView('week')
                    await setStoredOffersDefaultViewForCurrentUser('week')
                    setViewMenuOpen(false)
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Week {offersDefaultView === 'week' ? '• default' : ''}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setCalendarMode('agenda')
                    setOffersDefaultView('agenda')
                    await setStoredOffersDefaultViewForCurrentUser('agenda')
                    setViewMenuOpen(false)
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Agenda {offersDefaultView === 'agenda' ? '• default' : ''}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setCalendarMode('auto')
                    setOffersDefaultView('auto')
                    await setStoredOffersDefaultViewForCurrentUser('auto')
                    setViewMenuOpen(false)
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Auto {offersDefaultView === 'auto' ? '• default' : ''}
                </button>
              </div>
            ) : null}
            </div>
          </div>
        }
      />

      {error && (
        <div className="mb-4 p-4 rounded-3xl bg-red-900/40 border border-red-500/40 text-red-200 text-sm leading-relaxed">
          {error}
        </div>
      )}

      {notice && (
        <div className="mb-4 p-3 rounded-2xl border border-emerald-500/35 bg-emerald-950/35 text-emerald-100 text-xs leading-relaxed">
          {notice}
        </div>
      )}

      {syncingImportResults && (
        <div className="mb-4 p-3 rounded-2xl border border-violet-500/35 bg-violet-950/35 text-violet-100 text-xs leading-relaxed">
          Syncing AI results... new events and review items will pop in automatically.
        </div>
      )}

      {showLegacyOffersPushPanel ? (
      <div className="mb-4 rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-3">
        {iosInstallRequired && showIosInstallHelp ? (
          <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-950/30 p-3 text-[11px] leading-relaxed text-amber-100">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold">iPhone setup needed for push</span>
              <button
                type="button"
                onClick={() => setShowIosInstallHelp(false)}
                className="rounded-md px-2 py-0.5 text-[10px] font-semibold text-amber-100/80 hover:bg-amber-500/20"
              >
                Hide
              </button>
            </div>
            <div>1) Open this site in Safari</div>
            <div>2) Tap Share (square with arrow)</div>
            <div>3) Tap Add to Home Screen</div>
            <div>4) Launch the installed app icon, then tap Enable</div>
          </div>
        ) : null}

        <div className="mb-3">
          <div className="text-sm font-bold text-cyan-50">Offer reminders</div>
          <p className="mt-1 text-[11px] leading-relaxed text-cyan-200/85">
            Get alerted before timed offers start. Turn on notifications on this phone, choose how early to remind, then keep your calendar filled in.
            {!pushSupported ? ' This browser cannot use web push in this mode.' : null}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
          <button
            type="button"
            disabled={!canEnablePushUi}
            onClick={() => void enablePush()}
            className="min-h-11 shrink-0 rounded-xl border border-cyan-300/35 bg-cyan-600 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-cyan-900/35 disabled:text-cyan-100/90 disabled:opacity-100 touch-manipulation"
          >
            {pushBusy ? 'Working…' : 'Turn on alerts on this device'}
          </button>
          <button
            type="button"
            disabled={!canDisablePushUi}
            onClick={() => void disablePush()}
            className="min-h-11 shrink-0 rounded-xl border border-zinc-600/60 bg-zinc-800 px-4 text-xs font-semibold text-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-800/70 disabled:text-zinc-300/85 disabled:opacity-100 touch-manipulation"
          >
            Stop alerts on this device
          </button>
        </div>
        <div className="mt-1 text-[11px] text-cyan-200/80">
          Device:{' '}
          {!pushSupported
            ? 'Not supported here'
            : pushSubscribed
              ? 'Subscribed • tap a notification to open Calendar'
              : 'Not subscribed yet'}
        </div>

        <div className={`mt-3 rounded-xl border border-cyan-500/20 bg-black/25 p-3 ${!pushSubscribed || !allowPushControls ? 'opacity-60' : ''}`}>
          <div className="text-[11px] font-semibold text-cyan-100">Before each offer starts</div>
          <p className="mt-1 text-[10px] leading-relaxed text-cyan-200/65">
            Set timing on each offer with the Alert field in Add/Edit event (9:00 AM on the day for all-day, or 1 hour before when a start time is set).
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex rounded-xl border border-zinc-600 bg-zinc-900/90 p-0.5">
              <button
                type="button"
                disabled={!pushSubscribed || !allowPushControls || reminderPrefsSaving || !reminderPrefsLoaded}
                aria-pressed={remindersEnabled}
                onClick={() => {
                  setRemindersEnabled(true)
                  void saveReminderTiming(reminderLeadMinutes, true)
                }}
                className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-bold touch-manipulation disabled:opacity-50 ${
                  remindersEnabled ? 'bg-cyan-600 text-white' : 'text-zinc-400'
                }`}
              >
                On
              </button>
              <button
                type="button"
                disabled={!pushSubscribed || !allowPushControls || reminderPrefsSaving || !reminderPrefsLoaded}
                aria-pressed={!remindersEnabled}
                onClick={() => {
                  setRemindersEnabled(false)
                  void saveReminderTiming(reminderLeadMinutes, false)
                }}
                className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-bold touch-manipulation disabled:opacity-50 ${
                  !remindersEnabled ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400'
                }`}
              >
                Off
              </button>
            </div>
            <label className="flex flex-wrap items-center gap-2 text-[11px] text-cyan-100/90">
              <span className="shrink-0 text-cyan-200/80">Remind me</span>
              <select
                value={reminderLeadMinutes}
                disabled={!pushSubscribed || !allowPushControls || reminderPrefsSaving || !reminderPrefsLoaded || !remindersEnabled}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setReminderLeadMinutes(v)
                  void saveReminderTiming(v, remindersEnabled)
                }}
                className="min-h-10 min-w-[5.5rem] rounded-xl border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs font-semibold text-zinc-100 outline-none focus:ring-2 focus:ring-cyan-500/35 disabled:opacity-50"
              >
                {PUSH_LEAD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
              <span className="shrink-0 text-cyan-200/80">early</span>
            </label>
          </div>
          {!pushSubscribed || !allowPushControls ? (
            <p className="mt-2 text-[10px] leading-relaxed text-cyan-200/70">
              {iosInstallRequired
                ? 'After installing to Home Screen, turn on alerts above to manage reminder timing.'
                : 'Turn on alerts on this device to enable scheduled offer reminders.'}
            </p>
          ) : reminderPrefsSaving ? (
            <p className="mt-2 text-[10px] text-cyan-200/70">Saving reminder settings…</p>
          ) : null}
          {reminderPrefsError ? <p className="mt-2 text-[10px] text-amber-200/95">{reminderPrefsError}</p> : null}
        </div>

        {!canEnablePush && !pushSubscribed ? (
          <div className="mt-2 text-[11px] leading-relaxed text-cyan-100/80">
            {iosInstallRequired
              ? 'Alerts are unavailable in a normal iPhone browser tab. Add this site to your Home Screen and open it from the icon first.'
              : !pushSupported
                ? 'Alerts are unavailable because this browser does not support web push here (try Chrome on Android or your installed app on iPhone).'
                : pushPermission === 'denied'
                  ? 'This site does not have notification permission. Open your browser’s site settings for this page (lock or info icon → Permissions) and set Notifications to Allow, then try again.'
                  : 'Alerts are temporarily unavailable while setup finishes.'}
          </div>
        ) : null}

        {pushStatusMessage && !pushAdvancedOpen ? (
          <div className="mt-2 text-[11px] leading-relaxed text-cyan-100/90">{pushStatusMessage}</div>
        ) : null}

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setPushAdvancedOpen((o) => !o)}
            className="text-[11px] font-semibold text-cyan-300/95 underline underline-offset-2 hover:text-cyan-200 touch-manipulation"
            aria-expanded={pushAdvancedOpen}
          >
            {pushAdvancedOpen ? 'Hide troubleshooting' : 'Troubleshooting / test tools'}
          </button>
          {pushAdvancedOpen ? (
            <div className="mt-3 space-y-3 rounded-xl border border-zinc-600/50 bg-zinc-950/50 p-3">
              <div className="text-[11px] text-zinc-400">
                Technical: permission{' '}
                <span className="font-mono text-zinc-300">{pushPermission}</span>
                {' · '}
                {pushPermission === 'granted' ? 'Allowed' : pushPermission === 'denied' ? 'Blocked' : 'Not asked yet'}
                {reminderPrefsLoaded ? '' : ' · Loading reminder prefs…'}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={!canSendTestPushUi}
                  onClick={() => void sendTestPush()}
                  className="min-h-10 rounded-xl border border-violet-500/35 bg-violet-700/80 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-violet-900/35 disabled:text-violet-100/70 disabled:opacity-100 touch-manipulation"
                >
                  {sendingTestPush ? 'Sending…' : 'Send test notification'}
                </button>
                <button
                  type="button"
                  disabled={!canRunRemindersUi}
                  onClick={() => void runReminderCheckNow()}
                  className="min-h-10 rounded-xl border border-emerald-500/35 bg-emerald-700/80 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-900/35 disabled:text-emerald-100/70 disabled:opacity-100 touch-manipulation"
                >
                  {runningReminderCheck ? 'Running…' : 'Run reminder check now'}
                </button>
              </div>
              <p className="text-[10px] leading-relaxed text-zinc-500">
                “Run reminder check” uses the same server job as automation. It sends only for events that have an alert scheduled and whose alert time falls in the next window. Offer alerts are set on each event (Alert field on the form).
              </p>
              {pushStatusMessage && pushAdvancedOpen ? (
                <div className="text-[11px] leading-relaxed text-cyan-100/85">{pushStatusMessage}</div>
              ) : null}
              {testPushMessage ? <div className="text-[11px] leading-relaxed text-violet-100/85">{testPushMessage}</div> : null}
              {reminderMessage ? <div className="text-[11px] leading-relaxed text-emerald-100/85">{reminderMessage}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
      ) : null}

      <ReviewQueuePanel reviewQueue={reviewQueue} onComplete={beginReviewItem} onSkip={(itemId) => void skipReviewItem(itemId)} />

      <div className={isWeekView ? 'flex flex-col gap-2' : 'mb-2'}>
          {activeCalendarView === 'agenda' ? null : activeCalendarView === 'month' ? (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-zinc-500">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, idx) => (
                  <div key={`${w}-${idx}`} className="py-1">
                    {w}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 mt-1">
                {calendarCells.map((cell, idx) => {
                  if (!cell) return <div key={`empty-${idx}`} className="h-10" />
                  const key = localDateKeyFromDate(cell)
                  const isToday = key === todayKey
                  const isSelected = selectedDays.includes(key)
                  const dots = dayTypeDots[key] || []
                  return (
                    <button
                      key={`${key}-${idx}`}
                      type="button"
                      onMouseDown={() => startDayPress(key)}
                      onMouseUp={endDayPress}
                      onMouseLeave={endDayPress}
                      onTouchStart={() => startDayPress(key)}
                      onTouchEnd={endDayPress}
                      onClick={() => toggleSelectedDay(key)}
                      className={`h-10 rounded-2xl text-sm touch-manipulation flex flex-col items-center justify-center gap-0.5 border ${
                        isSelected
                          ? 'border-violet-400 text-white'
                          : isToday
                            ? 'border-zinc-500 text-zinc-100'
                            : 'border-transparent text-zinc-200'
                      }`}
                    >
                      <span>{cell.getDate()}</span>
                      <span className="h-2 flex items-center gap-1">
                        {dots.map((t) => (
                          <span key={`${key}-${t}`} className={`h-1.5 w-1.5 rounded-full ${offerTypeMeta[t]?.dot || 'bg-zinc-400'}`} />
                        ))}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className={`flex min-h-0 flex-col rounded-2xl bg-zinc-900/60 p-1.5 ${isWeekView ? 'flex-1' : ''}`}>
              <div className="grid shrink-0 grid-cols-7 gap-0 divide-x divide-zinc-500/20 border-b border-zinc-600/25 text-center text-[9px] font-semibold text-zinc-500">
                {weekDays.map((d) => {
                  const dayKey = localDateKeyFromDate(d)
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      className="touch-manipulation py-1 text-zinc-400 outline-none hover:bg-zinc-800/40 focus-visible:ring-2 focus-visible:ring-violet-500/40"
                      onMouseDown={() => startDayPress(dayKey)}
                      onMouseUp={endDayPress}
                      onMouseLeave={endDayPress}
                      onTouchStart={() => startDayPress(dayKey)}
                      onTouchEnd={endDayPress}
                      onTouchCancel={endDayPress}
                    >
                      <div>{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                      <div className="text-[8px] font-normal text-zinc-500">{d.getDate()}</div>
                    </button>
                  )
                })}
              </div>
              <div className="mt-0.5 flex flex-col space-y-0.5">
                {weekEvents.length === 0 ? (
                  <div className="relative min-h-[12rem] flex-1">
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-0 grid grid-cols-7 gap-0"
                    >
                      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="border-r border-zinc-500/15 last:border-r-0" />
                      ))}
                    </div>
                    <div className="absolute inset-0 z-[1] grid grid-cols-7 gap-0">
                      {weekDays.map((d, i) => {
                        const dk = localDateKeyFromDate(d)
                        return (
                          <button
                            key={`empty-day-${i}`}
                            type="button"
                            aria-label={`Add event on ${dk}`}
                            className="min-h-full touch-manipulation touch-none bg-transparent outline-none hover:bg-zinc-800/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500/30"
                            onMouseDown={() => startDayPress(dk)}
                            onMouseUp={endDayPress}
                            onMouseLeave={endDayPress}
                            onTouchStart={() => startDayPress(dk)}
                            onTouchEnd={endDayPress}
                            onTouchCancel={endDayPress}
                          />
                        )
                      })}
                    </div>
                    <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center px-2 text-center text-zinc-500 text-xs">
                      No events this week.
                    </div>
                  </div>
                ) : (
                  <>
                    {weekEventLanes.map((lane, laneIdx) => {
                      return (
                        <div key={`wk-lane-${laneIdx}`} className="relative min-h-[3.75rem]">
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 z-0 grid grid-cols-7 gap-0"
                          >
                            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                              <div key={i} className="border-r border-zinc-500/15 last:border-r-0" />
                            ))}
                          </div>
                          <div className="absolute inset-0 z-[1] grid grid-cols-7 gap-0">
                            {weekDays.map((d, i) => {
                              const dk = localDateKeyFromDate(d)
                              return (
                                <button
                                  key={`row-lane-${laneIdx}-day-${i}`}
                                  type="button"
                                  aria-label={`Add event on ${dk}`}
                                  className="min-h-full touch-manipulation touch-none bg-transparent outline-none hover:bg-zinc-800/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500/30"
                                  onMouseDown={() => startDayPress(dk)}
                                  onMouseUp={endDayPress}
                                  onMouseLeave={endDayPress}
                                  onTouchStart={() => startDayPress(dk)}
                                  onTouchEnd={endDayPress}
                                  onTouchCancel={endDayPress}
                                />
                              )
                            })}
                          </div>
                          <div className="pointer-events-none relative z-[2] grid grid-cols-7 gap-0">
                            {lane.map((ev) => {
                              const meta = offerTypeMeta[ev.offer_type] || offerTypeMeta.other
                              const hasAlert = !!(ev.alert_preset && ev.alert_preset !== 'none')
                              return (
                                <button
                                  key={`wk-${ev.id}-${ev._startCol}`}
                                  type="button"
                                  data-offer-type={ev.offer_type || 'other'}
                                  data-card-view="week"
                                  onClick={() => setWeekDetailEvent(ev)}
                                  className={`pointer-events-auto ${meta.card} relative flex min-h-[3.5rem] min-w-0 flex-col items-start justify-center gap-0.5 overflow-hidden rounded-lg px-2 py-1.5 text-left text-[10px] leading-tight touch-manipulation`}
                                  style={{ gridColumn: `${ev._startCol + 1} / span ${ev._span}` }}
                                >
                                  {hasAlert ? (
                                    <span
                                      title="Has alert"
                                      aria-label="Has alert"
                                      className="absolute right-1.5 top-1 inline-flex items-center justify-center text-[10px] leading-none text-zinc-100"
                                    >
                                      🔔
                                    </span>
                                  ) : null}
                                  <span className="w-full truncate text-left font-bold text-zinc-100">
                                    {ev.casino_name || 'Event'}
                                  </span>
                                  {ev.title ? (
                                    <span className="w-full truncate text-left italic text-zinc-300">{ev.title}</span>
                                  ) : null}
                                  {ev.value_amount !== null && (
                                    <span className="w-full truncate text-left font-semibold tabular-nums text-emerald-400">
                                      {ev.value_amount !== null ? `$${Number(ev.value_amount).toFixed(0)}` : ''}
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    <div className="relative min-h-[10rem] flex-1 shrink-0">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 z-0 grid grid-cols-7 gap-0"
                      >
                        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                          <div key={`pad-${i}`} className="border-r border-zinc-500/15 last:border-r-0" />
                        ))}
                      </div>
                      <div className="absolute inset-0 z-[1] grid grid-cols-7 gap-0">
                        {weekDays.map((d, i) => {
                          const dk = localDateKeyFromDate(d)
                          return (
                            <button
                              key={`footer-day-${i}`}
                              type="button"
                              aria-label={`Add event on ${dk}`}
                              className="min-h-full touch-manipulation touch-none bg-transparent outline-none hover:bg-zinc-800/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500/30"
                              onMouseDown={() => startDayPress(dk)}
                              onMouseUp={endDayPress}
                              onMouseLeave={endDayPress}
                              onTouchStart={() => startDayPress(dk)}
                              onTouchEnd={endDayPress}
                              onTouchCancel={endDayPress}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

      {activeCalendarView === 'month' && selectedDays.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 px-1 py-1">
          <div className="text-zinc-300 text-sm">
            {selectedDays.length} day{selectedDays.length > 1 ? 's' : ''} selected
          </div>
          <button
            type="button"
            onClick={() => setSelectedDays([])}
            className="text-violet-300 text-sm font-semibold touch-manipulation"
          >
            Clear
          </button>
        </div>
      )}

      {!isWeekView && (
      <div className="flex flex-col">
        <div className="text-white font-bold mb-2">{activeCalendarView === 'agenda' ? '' : 'Events'}</div>
        <div className="pr-1 pb-4">
          {loading ? (
            <div className="text-zinc-400 text-sm">Loading…</div>
          ) : listEvents.length === 0 ? (
            <div className="text-zinc-500 text-sm">No events from this period onward.</div>
          ) : (
            <div className="space-y-2">
              {listRows.map((row, rowIdx) => {
                if (row.type === 'today-divider') {
                  return (
                    <div key={`today-divider-${rowIdx}`} className="flex items-center gap-2 px-1 py-1">
                      <div className="h-px flex-1 bg-zinc-700/70" />
                      <div className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                        Today
                      </div>
                      <div className="h-px flex-1 bg-zinc-700/70" />
                    </div>
                  )
                }
                const e = row.event
                const meta = offerTypeMeta[e.offer_type] || offerTypeMeta.other
                const hasAlert = !!(e.alert_preset && e.alert_preset !== 'none')
                const isSpotlighted = offerSpotlightEventIds.includes(e.id)
                const isExpanded = expandedEventId === e.id
                const startDate = new Date(e.start_at)
                const endDate = e.end_at ? new Date(e.end_at) : null
                const showTime = hasVisibleTime(e.start_at) || (e.end_at ? hasVisibleTime(e.end_at) : false)
                const isMultiDay =
                  !!endDate &&
                  new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime() !==
                    new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime()
                const dateRangeLabel = isMultiDay
                  ? `${startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                  : ''
                const timeLabel = showTime
                  ? new Date(e.start_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                  : ''
                const dayLabel = startDate.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()
                const dayNum = startDate.getDate()
                const monthLabel = startDate.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()
                return (
                  <button
                    key={e.id}
                    type="button"
                    data-offer-type={e.offer_type || 'other'}
                    data-card-view="list"
                    onClick={() => setWeekDetailEvent(e)}
                    aria-expanded={isExpanded}
                    className={`${meta.card} relative block w-full rounded-2xl p-2.5 text-left transition-colors hover:bg-opacity-90 ${isSpotlighted ? 'ring-2 ring-cyan-300/85 shadow-[0_0_20px_rgba(34,211,238,0.35)]' : ''}`}
                  >
                    {hasAlert ? (
                      <span
                        title="Has alert"
                        aria-label="Has alert"
                        className="absolute right-2.5 top-2.5 inline-flex items-center justify-center text-[11px] leading-none text-zinc-100"
                      >
                        🔔
                      </span>
                    ) : null}
                    <div className="flex items-start gap-2">
                      <div className="w-10 shrink-0 text-center">
                        <div className="text-white/75 text-[9px] font-semibold tracking-wide">{dayLabel}</div>
                        <div className="text-white text-2xl font-bold leading-tight">{dayNum}</div>
                        <div className="text-white/80 text-[10px] font-bold tracking-wider" style={{ color: 'var(--list-month-color)' }}>{monthLabel}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${meta.chip}`}>
                            {meta.label}
                          </span>
                        </div>
                        <div className="text-zinc-100 text-base mt-0.5 leading-tight truncate">
                          {timeLabel ? `${timeLabel} ` : ''}
                          {e.title}
                        </div>
                        {dateRangeLabel && <div className="text-zinc-300 text-xs mt-0.5">{dateRangeLabel}</div>}
                        <div className="mt-0.5 flex items-center gap-2 text-xs min-w-0">
                          <span className="text-zinc-400 min-w-0 truncate">{e.casino_name}</span>
                          {e.value_amount !== null && (
                            <span className="text-emerald-300 min-w-0 truncate">
                              {e.value_amount !== null ? `$${Number(e.value_amount).toFixed(0)}` : ''}
                            </span>
                          )}
                        </div>
                        {e.notes && (
                          <div
                            ref={(el) => { notesPreviewRefs.current[e.id] = el }}
                            className="text-zinc-400 text-xs mt-0.5 truncate"
                          >
                            {e.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      )}

      </ScrollLinkedEdgeTitleBarShell>

      <WeekEventDetailModal
        event={weekDetailEvent}
        offerTypeMeta={offerTypeMeta}
        hasVisibleTime={hasVisibleTime}
        sourceImageUrl={weekDetailImageUrl}
        onClose={() => setWeekDetailEvent(null)}
        onEdit={(event) => {
          setWeekDetailEvent(null)
          beginEdit(event)
        }}
        onDuplicate={(event) => {
          setWeekDetailEvent(null)
          beginDuplicate(event)
        }}
        onDelete={(eventId) => {
          setWeekDetailEvent(null)
          deleteEvent(eventId)
        }}
      />

      <OfferFormModal
        showForm={showForm}
        editingId={editingId}
        closeForm={closeForm}
        completingReviewItemId={completingReviewItemId}
        fileInputRef={fileInputRef}
        handleImportPhotos={handleImportPhotos}
        uploading={uploading}
        hasSlotsEdge={hasSlotsEdge}
        onRequireSubscribe={onRequireSubscribe}
        reviewSourceImageLoading={reviewSourceImageLoading}
        reviewSourceImageUrl={reviewSourceImageUrl}
        draft={draft}
        setDraft={setDraft}
        setPropagateCasinoOnSave={setPropagateCasinoOnSave}
        setShowCasinoSuggestions={setShowCasinoSuggestions}
        showCasinoSuggestions={showCasinoSuggestions}
        filteredCasinoOptions={filteredCasinoOptions}
        setPropagateTitleOnSave={setPropagateTitleOnSave}
        setShowTitleSuggestions={setShowTitleSuggestions}
        showTitleSuggestions={showTitleSuggestions}
        filteredTitleOptions={filteredTitleOptions}
        allDay={allDay}
        setAllDay={setAllDay}
        startSelected={startSelected}
        endSelected={endSelected}
        endMinTime={endMinTime}
        endMaxTime={endMaxTime}
        saveEvent={saveEvent}
        saving={saving}
        notice={notice}
        propagateCasinoOnSave={propagateCasinoOnSave}
        setPropagateCasinoOnSaveChecked={setPropagateCasinoOnSave}
        propagateTitleOnSave={propagateTitleOnSave}
        setPropagateTitleOnSaveChecked={setPropagateTitleOnSave}
        propagateValueOnSave={propagateValueOnSave}
        setPropagateValueOnSaveChecked={setPropagateValueOnSave}
        skipCurrentReviewFromForm={skipCurrentReviewFromForm}
        casinoFieldRef={casinoFieldRef}
        titleFieldRef={titleFieldRef}
        onRequestSetAlertPreset={handleAlertPresetSelection}
      />
      {alertDialogState.open ? (
        <div
          className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => closeAlertDialog(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[17px] font-semibold text-zinc-100">{alertDialogState.title}</div>
            <div className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-zinc-300">{alertDialogState.message}</div>
            {alertDialogState.images?.length ? (
              <div className="mt-3 max-h-[45dvh] space-y-2 overflow-auto pr-0.5">
                {alertDialogState.images.map((img, idx) => (
                  <div key={`${img.src}-${idx}`} className="rounded-2xl border border-zinc-700/70 bg-zinc-950/60 p-2">
                    <img src={img.src} alt={img.alt || ''} className="w-full rounded-xl object-cover" loading="lazy" />
                    {img.caption ? <div className="mt-1 text-[11px] text-zinc-300">{img.caption}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}
            {alertDialogState.checkboxLabel ? (
              <label className="mt-3 flex items-center gap-2 text-[12px] text-zinc-200">
                <input
                  type="checkbox"
                  checked={alertDialogState.checkboxChecked === true}
                  onChange={(e) => {
                    const checked = e.target.checked
                    alertDialogCheckedRef.current = checked
                    setAlertDialogState((cur) => ({ ...cur, checkboxChecked: checked }))
                  }}
                  className="h-4 w-4 rounded border-zinc-500 bg-zinc-800 text-cyan-500 focus:ring-cyan-400"
                />
                <span>{alertDialogState.checkboxLabel}</span>
              </label>
            ) : null}
            <div className="mt-4 flex gap-2">
              {alertDialogState.mode === 'confirm' ? (
                <button
                  type="button"
                  onClick={() => closeAlertDialog(false)}
                  className="min-h-11 flex-1 rounded-xl border border-zinc-600 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 touch-manipulation"
                >
                  {alertDialogState.cancelLabel}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => closeAlertDialog(true)}
                className="min-h-11 flex-1 rounded-xl border border-cyan-400/45 bg-cyan-600 px-3 text-sm font-semibold text-white touch-manipulation"
              >
                {alertDialogState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <UploadProgressOverlay
        show={uploading}
        message={uploadSpinnerMessage}
        onCancel={() => setUploading(false)}
      />
    </>
  )
}
