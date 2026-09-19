import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import ProfileHandleConflictDialog from './ProfileHandleConflictDialog.jsx'
import {
  checkProfileHandleAvailability,
  fetchOwnProfile,
  formatProfileSaveDebugError,
  handleSlugFromAtInput,
  normalizeHandle,
  saveProfilePhoneNumber,
  saveProfileWithHandleFallback,
} from './profileGate.js'
import { countryFromE164, formatPhoneDisplay, nationalFromE164, toE164ForCountry } from '../auth/phoneSignIn.js'
import PhoneCountryField from '../auth/PhoneCountryField.jsx'
import { dismissEdgeKeyboard } from '../../utils/edgeNative.js'

const HANDLE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const PHONE_ACTION_CLASS =
  'account-phone-action inline-flex min-h-11 items-center text-[15px] font-semibold text-cyan-300 underline underline-offset-4 touch-manipulation hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]'

function handleCooldownUnlockAt(handleChangedAt) {
  const lastAt = handleChangedAt ? new Date(handleChangedAt) : null
  if (!lastAt || Number.isNaN(lastAt.getTime())) return null
  return new Date(lastAt.getTime() + HANDLE_COOLDOWN_MS)
}

function phoneKey(raw, country) {
  return toE164ForCountry(raw, country) || ''
}

function nationalDraft(raw) {
  const stored = toE164ForCountry(raw)
  if (!stored) return String(raw || '').replace(/\D/g, '')
  const country = countryFromE164(stored)
  return nationalFromE164(stored, country) || stored
}

function phoneLinkError(error) {
  const lower = String(error?.message || error || '').toLowerCase()
  if (lower.includes('already') && (lower.includes('registered') || lower.includes('exists'))) {
    return 'That number is already on another account.'
  }
  if (lower.includes('expired') || lower.includes('otp') || lower.includes('token')) {
    return 'That code is incorrect or expired.'
  }
  if (
    lower.includes('not configured') ||
    lower.includes('could not send') ||
    lower.includes('status code') ||
    lower.includes('hook') ||
    lower.includes('error sending')
  ) {
    return 'Could not send the text right now. Try again in a minute.'
  }
  const raw = String(error?.message || '').trim()
  return raw || 'Could not update the phone number.'
}

/**
 * Settings sub-screen: handle, email, phone, delete account.
 */
export default function SettingsAccountInfoScreen({
  supabaseClient,
  authUser,
  initialEmail = '',
  focusPhone = false,
  onPhoneFocusHandled,
  onBack,
  onUpdated,
  onAuthUserUpdated,
  onDeleteAccount,
  deleteAccountBusy = false,
}) {
  const userId = String(authUser?.id || '').trim()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [serverHandle, setServerHandle] = useState('')
  const [handleChangedAt, setHandleChangedAt] = useState(null)
  const [serverPhone, setServerPhone] = useState('')

  const [handleDraft, setHandleDraft] = useState('')
  const [emailDraft, setEmailDraft] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [phoneCountry, setPhoneCountry] = useState('US')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneCodeFor, setPhoneCodeFor] = useState('')
  const [phoneVerifiedFor, setPhoneVerifiedFor] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailCodeFor, setEmailCodeFor] = useState('')
  const [phoneReleaseCode, setPhoneReleaseCode] = useState('')
  const [phoneReleaseFor, setPhoneReleaseFor] = useState('')
  const [phoneReleaseDialog, setPhoneReleaseDialog] = useState(null)

  const [saveBusy, setSaveBusy] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')

  const [handleChangeDialog, setHandleChangeDialog] = useState(null)
  const [handleConflictDialog, setHandleConflictDialog] = useState(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmArmed, setDeleteConfirmArmed] = useState(false)

  const reloadProfile = useCallback(async () => {
    if (!supabaseClient || !userId) {
      setLoadError('Sign in to edit account info.')
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const { data, error } = await fetchOwnProfile(supabaseClient, userId)
      if (error) throw error
      if (!data) throw new Error('Profile not found.')
      setDisplayName(String(data.display_name || '').trim())
      setServerHandle(String(data.handle || '').trim())
      setHandleChangedAt(data.handle_changed_at || null)
      setHandleDraft(String(data.handle || '').trim())
      let phoneRaw = String(data.phone_number || '').trim()
      const authE164 = toE164ForCountry(authUser?.phone || '')
      if (!phoneRaw && authE164) {
        const stamped = await saveProfilePhoneNumber({
          supabaseClient,
          userId,
          phoneNumber: authE164,
        })
        if (!stamped.error && stamped.data?.phone_number) {
          phoneRaw = String(stamped.data.phone_number).trim()
        } else {
          phoneRaw = authE164
        }
      }
      const stored = toE164ForCountry(phoneRaw) || phoneRaw
      setServerPhone(toE164ForCountry(stored) || '')
      setPhoneCountry(countryFromE164(stored))
      setPhoneDraft(nationalDraft(stored))
      setEmailDraft(String(initialEmail || authUser?.email || '').trim())
    } catch (e) {
      setLoadError(formatProfileSaveDebugError(e, 'Load account'))
    } finally {
      setLoading(false)
    }
  }, [authUser?.email, authUser?.phone, initialEmail, supabaseClient, userId])

  useEffect(() => {
    void reloadProfile()
  }, [reloadProfile])

  useEffect(() => {
    if (loading || !focusPhone) return undefined
    const input = document.getElementById('settings-account-phone')
    if (!(input instanceof HTMLInputElement)) return undefined
    input.focus()
    const end = input.value.length
    try {
      input.setSelectionRange(end, end)
    } catch {
      // Some mobile tel inputs refuse a selection range.
    }
    input.scrollIntoView({ block: 'center' })
    onPhoneFocusHandled?.()
    return undefined
  }, [focusPhone, loading, onPhoneFocusHandled])

  useEffect(() => {
    if (!deleteDialogOpen) {
      setDeleteConfirmArmed(false)
      return undefined
    }
    // IPA: the same tap that opens this portal can land on Confirm. Arm after a beat.
    const timer = window.setTimeout(() => setDeleteConfirmArmed(true), 450)
    return () => window.clearTimeout(timer)
  }, [deleteDialogOpen])

  const normalizedHandleDraft = useMemo(() => normalizeHandle(handleDraft), [handleDraft])
  const trimmedEmailDraft = useMemo(() => String(emailDraft || '').trim(), [emailDraft])

  const handleDirty = normalizedHandleDraft !== serverHandle
  const emailDirty = trimmedEmailDraft !== String(initialEmail || authUser?.email || '').trim()
  const phoneDirty = phoneKey(phoneDraft, phoneCountry) !== phoneKey(serverPhone, phoneCountry)
  const formDirty = handleDirty || emailDirty || phoneDirty
  const loginPhoneVerified =
    Boolean(toE164ForCountry(authUser?.phone || '')) && Boolean(authUser?.phone_confirmed_at)
  const accountEmail = String(authUser?.email || '').trim()

  const onHandleInputChange = useCallback((e) => {
    setHandleDraft(handleSlugFromAtInput(e.target.value))
    setSaveMessage('')
    setSaveError('')
  }, [])

  const requestPhoneCode = useCallback(async (nextE164) => {
    const { data, error: sendErr } = await supabaseClient.auth.updateUser({ phone: nextE164 })
    if (sendErr) {
      setSaveError(phoneLinkError(sendErr))
      return false
    }
    const digits = (value) => String(value || '').replace(/\D/g, '')
    const target = digits(nextE164)
    const pending = data?.user?.new_phone
    const current = digits(data?.user?.phone)
    if (current === target && (pending == null || digits(pending) === '')) {
      setSaveError('That number is already on this account, so no new text was sent.')
      return false
    }
    setPhoneCode('')
    setPhoneCodeFor(nextE164)
    setPhoneReleaseFor('')
    setPhoneReleaseCode('')
    setSaveMessage(`Code sent to ${formatPhoneDisplay(nextE164)}. Enter it below.`)
    return true
  }, [supabaseClient])

  const persistAccountInfo = useCallback(
    async (opts = {}) => {
      if (!supabaseClient || !authUser?.id || saveBusy) return
      setSaveMessage('')
      setSaveError('')

      const nextHandle = normalizeHandle(opts.forcedHandle ?? handleDraft)
      const nextEmail = String(emailDraft || '').trim()

      if (handleDirty && !nextHandle) {
        setSaveError('Handle must be at least 2 characters (letters, numbers, underscore).')
        return
      }

      if (phoneDirty && phoneDraft.trim() && !toE164ForCountry(phoneDraft, phoneCountry)) {
        setSaveError('Enter a valid mobile number.')
        return
      }

      if (emailDirty) {
        if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
          setSaveError('Enter a valid email address.')
          return
        }
      }

      setSaveBusy(true)
      try {
        let profilePatch = null

        if (handleDirty) {
          const availability = await checkProfileHandleAvailability({
            supabaseClient,
            requestedHandle: nextHandle,
            excludeUserId: authUser.id,
          })
          if (!availability.ok) {
            setHandleConflictDialog({
              requestedHandle: availability.handle,
              reason: availability.reason,
              suggestedHandle: availability.suggestedHandle,
            })
            return
          }

          const { data: identityRow, error: idErr } = await saveProfileWithHandleFallback({
            supabaseClient,
            user: authUser,
            displayName,
            requestedHandle: nextHandle,
            strictHandle: true,
          })
          if (idErr) {
            const raw = formatProfileSaveDebugError(idErr, 'Handle')
            if (/PROFILE_HANDLE_CHANGE_COOLDOWN|once every 7 days|handle change cooldown/i.test(raw)) {
              setSaveError('You can only change your handle once every 7 days. Try again later.')
              return
            }
            throw idErr
          }
          profilePatch = identityRow
          setServerHandle(String(identityRow.handle || '').trim())
          setHandleDraft(String(identityRow.handle || '').trim())
          setHandleChangedAt(identityRow.handle_changed_at || null)
        }

        let phoneNotice = ''
        if (phoneDirty) {
          const nextE164 = toE164ForCountry(phoneDraft, phoneCountry)
          const authE164 = toE164ForCountry(authUser?.phone || '')
          const serverE164 = toE164ForCountry(serverPhone)

          if (!nextE164) {
            if (authE164 || serverE164) {
              setSaveError('This number signs you in. Enter a new number to replace it.')
              return
            }
            if (serverPhone) {
              const { data: phoneRow, error: phoneErr } = await saveProfilePhoneNumber({
                supabaseClient,
                userId: authUser.id,
                phoneNumber: '',
              })
              if (phoneErr) throw phoneErr
              profilePatch = { ...(profilePatch || {}), ...phoneRow }
              setServerPhone('')
              setPhoneDraft('')
              setPhoneCodeFor('')
              setPhoneCode('')
            }
          } else if (nextE164 === authE164) {
            const { data: phoneRow, error: phoneErr } = await saveProfilePhoneNumber({
              supabaseClient,
              userId: authUser.id,
              phoneNumber: nextE164,
            })
            if (phoneErr) throw phoneErr
            profilePatch = { ...(profilePatch || {}), ...phoneRow }
            setServerPhone(nextE164)
            setPhoneDraft(nationalDraft(nextE164))
            setPhoneCodeFor('')
            setPhoneCode('')
          } else {
            const sent = await requestPhoneCode(nextE164)
            if (!sent) return
            phoneNotice = `Code sent to ${formatPhoneDisplay(nextE164)}. Enter it below. The number is not linked until you confirm.`
          }
        }

        if (emailDirty) {
          const { error: emailErr } = await supabaseClient.auth.updateUser({ email: nextEmail })
          if (emailErr) throw emailErr
          setEmailCode('')
          setEmailCodeFor(nextEmail)
          setSaveMessage(
            phoneNotice
              ? `Code sent to ${nextEmail}. Enter it below. ${phoneNotice}`
              : `Code sent to ${nextEmail}. Enter it below. The link in that email still works.`,
          )
        } else if (phoneNotice) {
          setSaveMessage(phoneNotice)
        } else if (handleDirty || phoneDirty) {
          setSaveMessage('Account info saved.')
        }

        if (profilePatch) onUpdated?.(profilePatch)
      } catch (e) {
        setSaveError(formatProfileSaveDebugError(e, 'Save account'))
      } finally {
        setSaveBusy(false)
      }
    },
    [
      authUser,
      displayName,
      emailDirty,
      emailDraft,
      handleDirty,
      handleDraft,
      onUpdated,
      phoneCountry,
      phoneDirty,
      phoneDraft,
      requestPhoneCode,
      saveBusy,
      serverPhone,
      supabaseClient,
    ],
  )

  const confirmPhoneCode = useCallback(async () => {
    if (!supabaseClient || !authUser?.id || saveBusy || !phoneCodeFor) return
    const token = phoneCode.replace(/\D/g, '')
    if (token.length < 4) {
      setSaveError('Enter the code from the text.')
      return
    }
    setSaveBusy(true)
    setSaveError('')
    setSaveMessage('')
    try {
      const { data, error } = await supabaseClient.auth.verifyOtp({
        phone: phoneCodeFor,
        token,
        type: 'phone_change',
      })
      if (error) {
        setSaveError(phoneLinkError(error))
        return
      }
      const { data: phoneRow, error: phoneErr } = await saveProfilePhoneNumber({
        supabaseClient,
        userId: authUser.id,
        phoneNumber: phoneCodeFor,
      })
      if (phoneErr) throw phoneErr
      const { data: sessionData } = await supabaseClient.auth.getSession()
      const rawUser = sessionData?.session?.user || data?.user || authUser
      onAuthUserUpdated?.({
        ...rawUser,
        phone: rawUser?.phone || phoneCodeFor,
        phone_confirmed_at: rawUser?.phone_confirmed_at || new Date().toISOString(),
      })
      setServerPhone(phoneCodeFor)
      setPhoneDraft(nationalDraft(phoneCodeFor))
      setPhoneCode('')
      setPhoneCodeFor('')
      dismissEdgeKeyboard()
      setPhoneVerifiedFor(phoneCodeFor)
      if (phoneRow) onUpdated?.(phoneRow)
    } catch (e) {
      setSaveError(formatProfileSaveDebugError(e, 'Phone'))
    } finally {
      setSaveBusy(false)
    }
  }, [authUser?.id, onAuthUserUpdated, onUpdated, phoneCode, phoneCodeFor, saveBusy, supabaseClient])

  const confirmEmailCode = useCallback(async () => {
    if (!supabaseClient || !authUser?.id || saveBusy || !emailCodeFor) return
    const token = emailCode.replace(/\D/g, '')
    if (token.length < 4) {
      setSaveError('Enter the code from the email.')
      return
    }
    setSaveBusy(true)
    setSaveError('')
    setSaveMessage('')
    try {
      const { error } = await supabaseClient.auth.verifyOtp({
        email: emailCodeFor,
        token,
        type: 'email_change',
      })
      if (error) {
        setSaveError(phoneLinkError(error))
        return
      }
      const { data: userData } = await supabaseClient.auth.getUser()
      const nextUser = userData?.user
      if (nextUser) onAuthUserUpdated?.(nextUser)
      setEmailDraft(String(nextUser?.email || emailCodeFor).trim())
      setEmailCode('')
      setEmailCodeFor('')
      dismissEdgeKeyboard()
      setSaveMessage('Email confirmed.')
    } catch (e) {
      setSaveError(formatProfileSaveDebugError(e, 'Email'))
    } finally {
      setSaveBusy(false)
    }
  }, [authUser?.id, emailCode, emailCodeFor, onAuthUserUpdated, saveBusy, supabaseClient])

  const startPhoneRelease = useCallback(async () => {
    if (!supabaseClient || !authUser?.id || saveBusy) return
    const loginPhone = toE164ForCountry(authUser?.phone || '')
    if (!loginPhone) {
      setSaveError('This account has no phone number to remove.')
      setSaveMessage('')
      return
    }
    if (!authUser?.email_confirmed_at) {
      setSaveError('Add an email and confirm the code before you can remove this number.')
      setSaveMessage('')
      return
    }
    setSaveBusy(true)
    setSaveError('')
    setSaveMessage('')
    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        phone: loginPhone,
        options: { channel: 'sms', shouldCreateUser: false },
      })
      if (error) {
        setSaveError(phoneLinkError(error))
        return
      }
      setPhoneCodeFor('')
      setPhoneCode('')
      setPhoneReleaseCode('')
      setPhoneReleaseFor(loginPhone)
      setPhoneReleaseDialog(null)
      setSaveMessage(`Code sent to ${formatPhoneDisplay(loginPhone)}. Enter it below.`)
    } finally {
      setSaveBusy(false)
    }
  }, [authUser?.email_confirmed_at, authUser?.id, authUser?.phone, saveBusy, supabaseClient])

  const confirmPhoneRelease = useCallback(async () => {
    if (!supabaseClient || !authUser?.id || saveBusy || !phoneReleaseFor) return
    const token = phoneReleaseCode.replace(/\D/g, '')
    if (token.length < 4) {
      setSaveError('Enter the code from the text.')
      return
    }
    setSaveBusy(true)
    setSaveError('')
    setSaveMessage('')
    try {
      const { data, error, response } = await supabaseClient.functions.invoke('account-phone-release', {
        method: 'POST',
        body: { token },
      })
      if (error) {
        let detail = typeof error.message === 'string' ? error.message.trim() : ''
        if (response) {
          try {
            const body = await response.clone().json()
            if (body && typeof body === 'object' && body.error) detail = String(body.error).trim()
          } catch {
            /* keep the invoke message */
          }
        }
        setSaveError(detail || 'Could not remove this number.')
        return
      }
      if (data && typeof data === 'object' && data.error) {
        setSaveError(String(data.error))
        return
      }
      const { data: refreshed } = await supabaseClient.auth.refreshSession()
      const refreshedUser = refreshed?.user || refreshed?.session?.user || authUser
      const nextUser = { ...refreshedUser, phone: null, phone_confirmed_at: null }
      onAuthUserUpdated?.(nextUser)
      onUpdated?.({ phone_number: null })
      setServerPhone('')
      setPhoneDraft('')
      setPhoneCode('')
      setPhoneCodeFor('')
      setPhoneReleaseCode('')
      setPhoneReleaseFor('')
      dismissEdgeKeyboard()
      setSaveMessage('Phone number removed. Continue with Phone no longer opens this account.')
    } catch (e) {
      setSaveError(formatProfileSaveDebugError(e, 'Phone'))
    } finally {
      setSaveBusy(false)
    }
  }, [authUser, onAuthUserUpdated, onUpdated, phoneReleaseCode, phoneReleaseFor, saveBusy, supabaseClient])

  const onSendPhoneCode = useCallback(async () => {
    if (!supabaseClient || !authUser?.id || saveBusy) return
    const nextE164 = toE164ForCountry(phoneDraft, phoneCountry)
    if (!nextE164) {
      setSaveError('Enter a valid mobile number.')
      setSaveMessage('')
      return
    }
    setSaveBusy(true)
    setSaveError('')
    setSaveMessage('')
    try {
      await requestPhoneCode(nextE164)
    } finally {
      setSaveBusy(false)
    }
  }, [authUser?.id, phoneCountry, phoneDraft, requestPhoneCode, saveBusy, supabaseClient])

  const onSaveClick = useCallback(() => {
    if (!formDirty || saveBusy) return

    if (handleDirty) {
      const unlockAt = handleCooldownUnlockAt(handleChangedAt)
      if (unlockAt && unlockAt.getTime() > Date.now()) {
        setHandleChangeDialog({ kind: 'cooldown', unlockAt: unlockAt.toISOString() })
        return
      }
      setHandleChangeDialog({ kind: 'confirm' })
      return
    }

    void persistAccountInfo()
  }, [formDirty, handleChangedAt, handleDirty, persistAccountInfo, saveBusy])

  const onFieldKeyDown = useCallback((e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    dismissEdgeKeyboard()
  }, [])

  const onNonFieldPointerDown = useCallback((e) => {
    const t = e.target
    if (t instanceof Element && t.closest('input, textarea, select, label')) return
    dismissEdgeKeyboard()
  }, [])

  const onConfirmDeleteAccount = useCallback(async () => {
    if (typeof onDeleteAccount !== 'function' || deleteAccountBusy) return
    setSaveError('')
    try {
      await onDeleteAccount()
    } catch (e) {
      const raw = typeof e?.message === 'string' ? e.message.trim() : ''
      const useless =
        !raw ||
        raw === '{}' ||
        raw === '[]' ||
        raw === '[object Object]' ||
        /^edge function returned a non-2xx status code$/i.test(raw)
      setSaveError(useless ? 'Could not delete account. Try again in a moment.' : raw)
    }
  }, [deleteAccountBusy, onDeleteAccount])

  return (
    <div
      className="px-3 py-4"
      data-settings-account-info
      onPointerDown={onNonFieldPointerDown}
    >
      <button
        type="button"
        onClick={() => {
          dismissEdgeKeyboard()
          onBack?.()
        }}
        className="mb-4 flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-[14px] font-semibold text-zinc-300 touch-manipulation hover:text-zinc-100 [-webkit-tap-highlight-color:transparent]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
          <path
            d="M15 6l-6 6 6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back
      </button>

      <h2 className="text-[17px] font-semibold text-zinc-100">Account info</h2>
      <p className="mt-1 text-[14px] leading-relaxed text-zinc-500">
        Update your handle, sign-in email, and phone.
      </p>

      {loading ? (
        <p className="mt-6 text-[14px] text-zinc-500">Loading…</p>
      ) : loadError ? (
        <p className="mt-6 text-[14px] leading-relaxed text-red-300/90">{loadError}</p>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="settings-account-handle" className="block text-[13px] font-semibold text-zinc-300">
              Handle
            </label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-zinc-500">
                @
              </span>
              <input
                id="settings-account-handle"
                type="text"
                inputMode="text"
                autoComplete="username"
                spellCheck={false}
                enterKeyHint="done"
                value={handleDraft}
                onKeyDown={onFieldKeyDown}
                onChange={onHandleInputChange}
                className="min-h-11 w-full rounded-xl border border-zinc-700/90 bg-zinc-900/80 py-2 pl-8 pr-3 text-[15px] text-zinc-100 outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>

          <div>
            <label htmlFor="settings-account-email" className="block text-[13px] font-semibold text-zinc-300">
              Email
            </label>
            <input
              id="settings-account-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              enterKeyHint="done"
              value={emailDraft}
              onKeyDown={onFieldKeyDown}
              onChange={(e) => {
                setEmailDraft(e.target.value)
                setSaveMessage('')
                setSaveError('')
              }}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-zinc-700/90 bg-zinc-900/80 px-3 text-[15px] text-zinc-100 outline-none focus:border-cyan-500/50"
            />
            {emailCodeFor ? (
              <div className="mt-3 space-y-2">
                <label htmlFor="settings-account-email-code" className="block text-[13px] font-semibold text-zinc-300">
                  Email code
                </label>
                <input
                  id="settings-account-email-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  enterKeyHint="go"
                  value={emailCode}
                  onChange={(e) => {
                    setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 10))
                    setSaveError('')
                  }}
                  className="min-h-11 w-full rounded-xl border border-zinc-700/90 bg-zinc-900/80 px-3 text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-500/50"
                />
                <div className="flex flex-wrap gap-x-4">
                  <button
                    type="button"
                    disabled={saveBusy}
                    onClick={() => void confirmEmailCode()}
                    className={PHONE_ACTION_CLASS}
                  >
                    {saveBusy ? 'Checking…' : 'Confirm email code'}
                  </button>
                  <button
                    type="button"
                    disabled={saveBusy}
                    onClick={() => {
                      if (!supabaseClient || !emailCodeFor) return
                      setSaveBusy(true)
                      setSaveError('')
                      setSaveMessage('')
                      void supabaseClient.auth.updateUser({ email: emailCodeFor }).then(({ error }) => {
                        setSaveBusy(false)
                        if (error) setSaveError(phoneLinkError(error))
                        else setSaveMessage(`Code sent to ${emailCodeFor}. Enter it below.`)
                      })
                    }}
                    className={PHONE_ACTION_CLASS}
                  >
                    Send again
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <label htmlFor="settings-account-phone" className="block text-[13px] font-semibold text-zinc-300">
              Phone number
            </label>
            <PhoneCountryField
              id="settings-account-phone"
              tone="account"
              value={phoneDraft}
              country={phoneCountry}
              onCountryChange={setPhoneCountry}
              enterKeyHint="done"
              onKeyDown={onFieldKeyDown}
              onChange={(e) => {
                setPhoneDraft(e.target.value)
                setPhoneCodeFor('')
                setPhoneCode('')
                setSaveMessage('')
                setSaveError('')
              }}
            />
            {!loginPhoneVerified ? (
              <button
                type="button"
                disabled={saveBusy || !toE164ForCountry(phoneDraft, phoneCountry)}
                onClick={() => void onSendPhoneCode()}
                className={`mt-2 ${PHONE_ACTION_CLASS}`}
              >
                {saveBusy && !phoneCode ? 'Sending…' : phoneCodeFor ? 'Send again' : 'Send code'}
              </button>
            ) : null}
            {phoneCodeFor ? (
              <div className="mt-3 space-y-2">
                <label htmlFor="settings-account-phone-code" className="block text-[13px] font-semibold text-zinc-300">
                  Text code
                </label>
                <input
                  id="settings-account-phone-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  enterKeyHint="go"
                  value={phoneCode}
                  onChange={(e) => {
                    setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 10))
                    setSaveError('')
                  }}
                  className="min-h-11 w-full rounded-xl border border-zinc-700/90 bg-zinc-900/80 px-3 text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-500/50"
                />
                <button
                  type="button"
                  disabled={saveBusy}
                  onClick={() => void confirmPhoneCode()}
                  className={PHONE_ACTION_CLASS}
                >
                  {saveBusy ? 'Checking…' : 'Confirm code'}
                </button>
              </div>
            ) : null}
            {!loginPhoneVerified ? (
              <p className="mt-1.5 text-[12px] leading-snug text-zinc-500">
                Enter a mobile number, then Send code. Confirm the text to use it for sign-in.
              </p>
            ) : null}
            {toE164ForCountry(authUser?.phone || '') ? (
              <div className="mt-3">
                <button
                  type="button"
                  disabled={saveBusy}
                  onClick={() => {
                    dismissEdgeKeyboard()
                    setSaveError('')
                    setSaveMessage('')
                    setPhoneReleaseDialog(
                      accountEmail && authUser?.email_confirmed_at ? 'confirm' : 'need-email',
                    )
                  }}
                  className="inline-flex min-h-11 items-center text-[14px] font-semibold text-zinc-400 underline underline-offset-2 touch-manipulation hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
                >
                  Remove number
                </button>
                {phoneReleaseFor ? (
                  <div className="mt-3 space-y-2">
                    <label htmlFor="settings-account-phone-release-code" className="block text-[13px] font-semibold text-zinc-300">
                      Text code to remove
                    </label>
                    <input
                      id="settings-account-phone-release-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6-digit code"
                      enterKeyHint="go"
                      value={phoneReleaseCode}
                      onChange={(e) => {
                        setPhoneReleaseCode(e.target.value.replace(/\D/g, '').slice(0, 10))
                        setSaveError('')
                      }}
                      className="min-h-11 w-full rounded-xl border border-zinc-700/90 bg-zinc-900/80 px-3 text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-500/50"
                    />
                    <button
                      type="button"
                      disabled={saveBusy}
                      onClick={() => void confirmPhoneRelease()}
                      className={PHONE_ACTION_CLASS}
                    >
                      {saveBusy ? 'Removing…' : 'Confirm and remove'}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            disabled={!formDirty || saveBusy}
            onClick={() => onSaveClick()}
            className="min-h-11 w-full rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white touch-manipulation hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
          >
            {saveBusy ? 'Saving…' : 'Save changes'}
          </button>

          {saveMessage ? (
            <p className="text-[13px] leading-relaxed text-cyan-200/90">{saveMessage}</p>
          ) : null}
          {saveError ? (
            <p className="text-[13px] leading-relaxed text-red-300/90">
              {typeof saveError === 'string' ? saveError : 'Could not save account info.'}
            </p>
          ) : null}

          {typeof onDeleteAccount === 'function' ? (
            <div className="border-t border-zinc-800/90 pt-5">
              <button
                type="button"
                disabled={deleteAccountBusy}
                onClick={() => {
                  dismissEdgeKeyboard()
                  setSaveError('')
                  setDeleteDialogOpen(true)
                }}
                className="inline-flex min-h-11 items-center text-[14px] font-semibold text-red-400 underline underline-offset-2 touch-manipulation hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
              >
                {deleteAccountBusy ? 'Deleting account…' : 'Delete account'}
              </button>
              <p className="mt-2 text-[12px] leading-snug text-zinc-500">
                Permanently removes your login and cascaded profile data. This cannot be undone.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {handleChangeDialog && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              data-settings-account-info-dialog
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="settings-handle-change-title"
            >
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-default touch-manipulation"
            aria-label="Dismiss"
            disabled={saveBusy}
            onClick={() => {
              if (saveBusy) return
              setHandleChangeDialog(null)
            }}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-600 bg-zinc-900 p-5 shadow-2xl">
            <h2 id="settings-handle-change-title" className="text-[16px] font-bold text-white">
              {handleChangeDialog.kind === 'confirm' ? 'Change handle?' : 'Handle change limit'}
            </h2>
            {handleChangeDialog.kind === 'confirm' ? (
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-200">
                You can change your handle at most once every 7 days. After you save, you will not be able to change it
                again until the cooldown ends.
              </p>
            ) : (
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-200">
                You can only change your handle once in a 7 day period. You can change it again after{' '}
                <span className="font-semibold text-zinc-100">
                  {new Date(handleChangeDialog.unlockAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
                .
              </p>
            )}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => setHandleChangeDialog(null)}
                className="min-h-11 w-full rounded-xl border border-zinc-600 bg-zinc-800/90 px-4 text-[15px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-700 disabled:opacity-50 sm:w-auto"
              >
                {handleChangeDialog.kind === 'confirm' ? 'Cancel' : 'OK'}
              </button>
              {handleChangeDialog.kind === 'confirm' ? (
                <button
                  type="button"
                  disabled={saveBusy}
                  onClick={() => {
                    setHandleChangeDialog(null)
                    void persistAccountInfo()
                  }}
                  className="min-h-11 w-full rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white touch-manipulation hover:bg-cyan-500 disabled:opacity-50 sm:w-auto"
                >
                  Save handle
                </button>
              ) : null}
            </div>
          </div>
            </div>,
            document.body,
          )
        : null}

      <ProfileHandleConflictDialog
        open={Boolean(handleConflictDialog)}
        busy={saveBusy}
        requestedHandle={handleConflictDialog?.requestedHandle}
        reason={handleConflictDialog?.reason}
        suggestedHandle={handleConflictDialog?.suggestedHandle}
        onCancel={() => setHandleConflictDialog(null)}
        onUseSuggested={(suggested) => {
          setHandleConflictDialog(null)
          setHandleDraft(String(suggested || '').trim())
          void persistAccountInfo({ forcedHandle: suggested })
        }}
      />

      {phoneReleaseDialog && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              data-settings-account-info-dialog
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="settings-phone-release-title"
            >
              <button
                type="button"
                className="absolute inset-0 z-0 cursor-default touch-manipulation"
                aria-label="Dismiss"
                disabled={saveBusy}
                onClick={() => {
                  if (saveBusy) return
                  setPhoneReleaseDialog(null)
                }}
              />
              <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-600 bg-zinc-900 p-5 shadow-2xl">
                <h2 id="settings-phone-release-title" className="text-[16px] font-bold text-white">
                  {phoneReleaseDialog === 'confirm' ? 'Remove number?' : 'Add an email first'}
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-200">
                  {phoneReleaseDialog === 'confirm'
                    ? 'You will lose your verified status and will no longer be able to sign in with this phone.'
                    : accountEmail
                      ? 'Confirm your email before you can remove this number.'
                      : 'Add an email address before you can remove this number.'}
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={saveBusy}
                    onClick={() => setPhoneReleaseDialog(null)}
                    className="min-h-11 w-full rounded-xl border border-zinc-600 bg-zinc-800/90 px-4 text-[15px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-700 disabled:opacity-50 sm:w-auto"
                  >
                    {phoneReleaseDialog === 'confirm' ? 'Cancel' : 'OK'}
                  </button>
                  {phoneReleaseDialog === 'confirm' ? (
                    <button
                      type="button"
                      disabled={saveBusy}
                      onClick={() => {
                        setPhoneReleaseDialog(null)
                        void startPhoneRelease()
                      }}
                      className="min-h-11 w-full rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white touch-manipulation hover:bg-cyan-500 disabled:opacity-50 sm:w-auto"
                    >
                      Remove number
                    </button>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {phoneVerifiedFor && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              data-settings-account-info-dialog
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-phone-verified-title"
            >
              <button
                type="button"
                className="absolute inset-0 z-0 cursor-default touch-manipulation"
                aria-label="Dismiss"
                onClick={() => setPhoneVerifiedFor('')}
              />
              <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-600 bg-zinc-900 p-5 text-center shadow-2xl">
                <div
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-600 text-white"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 id="settings-phone-verified-title" className="mt-4 text-[16px] font-bold text-white">
                  Phone verified
                </h2>
                <p className="mt-2 text-[15px] font-semibold text-zinc-100">
                  {formatPhoneDisplay(phoneVerifiedFor)}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-zinc-200">
                  Continue with Phone now opens this account.
                </p>
                <button
                  type="button"
                  onClick={() => setPhoneVerifiedFor('')}
                  className="mt-5 min-h-11 w-full rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white touch-manipulation hover:bg-cyan-500 [-webkit-tap-highlight-color:transparent]"
                >
                  Done
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {deleteDialogOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              data-settings-account-info-dialog
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="settings-delete-account-title"
            >
              <button
                type="button"
                className="absolute inset-0 z-0 cursor-default touch-manipulation"
                aria-label="Dismiss"
                disabled={deleteAccountBusy}
                onClick={() => {
                  if (deleteAccountBusy) return
                  setDeleteDialogOpen(false)
                }}
              />
              <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-600 bg-zinc-900 p-5 shadow-2xl">
                <h2 id="settings-delete-account-title" className="text-[16px] font-bold text-white">
                  Delete this account?
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-200">
                  Permanently removes your login, profile, Lounge posts, and other data tied to this
                  account. This cannot be undone.
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={deleteAccountBusy}
                    onClick={() => setDeleteDialogOpen(false)}
                    className="min-h-11 w-full rounded-xl border border-zinc-600 bg-zinc-800/90 px-4 text-[15px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-700 disabled:opacity-50 sm:w-auto"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleteAccountBusy || !deleteConfirmArmed}
                    onClick={() => void onConfirmDeleteAccount()}
                    className="min-h-11 w-full rounded-xl bg-red-600 px-4 text-[15px] font-semibold text-white touch-manipulation hover:bg-red-500 disabled:opacity-50 sm:w-auto"
                  >
                    {deleteAccountBusy ? 'Deleting…' : 'Delete account'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
