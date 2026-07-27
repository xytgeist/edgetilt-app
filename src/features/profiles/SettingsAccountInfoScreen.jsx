import { useCallback, useEffect, useMemo, useState } from 'react'
import ProfileHandleConflictDialog from './ProfileHandleConflictDialog.jsx'
import {
  checkProfileHandleAvailability,
  fetchOwnProfile,
  formatProfileSaveDebugError,
  handleSlugFromAtInput,
  normalizeHandle,
  normalizePhoneNumber,
  saveProfilePhoneNumber,
  saveProfileWithHandleFallback,
} from './profileGate.js'

const HANDLE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

function handleCooldownUnlockAt(handleChangedAt) {
  const lastAt = handleChangedAt ? new Date(handleChangedAt) : null
  if (!lastAt || Number.isNaN(lastAt.getTime())) return null
  return new Date(lastAt.getTime() + HANDLE_COOLDOWN_MS)
}

/**
 * Settings sub-screen: handle, email, phone, delete account.
 */
export default function SettingsAccountInfoScreen({
  supabaseClient,
  authUser,
  initialEmail = '',
  onBack,
  onUpdated,
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

  const [saveBusy, setSaveBusy] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')

  const [handleChangeDialog, setHandleChangeDialog] = useState(null)
  const [handleConflictDialog, setHandleConflictDialog] = useState(null)

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
      setServerPhone(String(data.phone_number || '').trim())
      setHandleDraft(String(data.handle || '').trim())
      setPhoneDraft(String(data.phone_number || '').trim())
      setEmailDraft(String(initialEmail || authUser?.email || '').trim())
    } catch (e) {
      setLoadError(formatProfileSaveDebugError(e, 'Load account'))
    } finally {
      setLoading(false)
    }
  }, [authUser?.email, initialEmail, supabaseClient, userId])

  useEffect(() => {
    void reloadProfile()
  }, [reloadProfile])

  const normalizedHandleDraft = useMemo(() => normalizeHandle(handleDraft), [handleDraft])
  const normalizedPhoneDraft = useMemo(() => normalizePhoneNumber(phoneDraft), [phoneDraft])
  const trimmedEmailDraft = useMemo(() => String(emailDraft || '').trim(), [emailDraft])

  const handleDirty = normalizedHandleDraft !== serverHandle
  const emailDirty = trimmedEmailDraft !== String(initialEmail || authUser?.email || '').trim()
  const phoneDirty = normalizedPhoneDraft !== serverPhone
  const formDirty = handleDirty || emailDirty || phoneDirty

  const onHandleInputChange = useCallback((e) => {
    setHandleDraft(handleSlugFromAtInput(e.target.value))
    setSaveMessage('')
    setSaveError('')
  }, [])

  const persistAccountInfo = useCallback(
    async (opts = {}) => {
      if (!supabaseClient || !authUser?.id || saveBusy) return
      setSaveMessage('')
      setSaveError('')

      const nextHandle = normalizeHandle(opts.forcedHandle ?? handleDraft)
      const nextEmail = String(emailDraft || '').trim()
      const nextPhone = normalizePhoneNumber(phoneDraft)

      if (handleDirty && !nextHandle) {
        setSaveError('Handle must be at least 2 characters (letters, numbers, underscore).')
        return
      }

      if (phoneDirty && phoneDraft.trim() && !nextPhone) {
        setSaveError('Enter a valid phone number (7–15 digits).')
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

        if (phoneDirty) {
          const { data: phoneRow, error: phoneErr } = await saveProfilePhoneNumber({
            supabaseClient,
            userId: authUser.id,
            phoneNumber: nextPhone,
          })
          if (phoneErr) throw phoneErr
          profilePatch = { ...(profilePatch || {}), ...phoneRow }
          setServerPhone(String(phoneRow.phone_number || '').trim())
          setPhoneDraft(String(phoneRow.phone_number || '').trim())
        }

        if (emailDirty) {
          const { error: emailErr } = await supabaseClient.auth.updateUser({ email: nextEmail })
          if (emailErr) throw emailErr
          setSaveMessage(
            'Check your inbox to confirm your new email address. Your login email updates after you confirm.',
          )
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
      phoneDirty,
      phoneDraft,
      saveBusy,
      supabaseClient,
    ],
  )

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

  return (
    <div className="px-3 py-4" data-settings-account-info>
      <button
        type="button"
        onClick={() => onBack?.()}
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
        Update your handle, sign-in email, and contact phone.
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
                value={handleDraft}
                onChange={onHandleInputChange}
                className="min-h-11 w-full rounded-xl border border-zinc-700/90 bg-zinc-900/80 py-2 pl-8 pr-3 text-[15px] text-zinc-100 outline-none focus:border-cyan-500/50"
              />
            </div>
            <p className="mt-1.5 text-[12px] leading-snug text-zinc-500">
              You can change your handle at most once every 7 days.
            </p>
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
              value={emailDraft}
              onChange={(e) => {
                setEmailDraft(e.target.value)
                setSaveMessage('')
                setSaveError('')
              }}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-zinc-700/90 bg-zinc-900/80 px-3 text-[15px] text-zinc-100 outline-none focus:border-cyan-500/50"
            />
            <p className="mt-1.5 text-[12px] leading-snug text-zinc-500">
              We&apos;ll send a confirmation link when you change your login email.
            </p>
          </div>

          <div>
            <label htmlFor="settings-account-phone" className="block text-[13px] font-semibold text-zinc-300">
              Phone number
            </label>
            <input
              id="settings-account-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Optional"
              value={phoneDraft}
              onChange={(e) => {
                setPhoneDraft(e.target.value)
                setSaveMessage('')
                setSaveError('')
              }}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-zinc-700/90 bg-zinc-900/80 px-3 text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-500/50"
            />
            <p className="mt-1.5 text-[12px] leading-snug text-zinc-500">
              Optional contact number for your account. Not used for sign-in today.
            </p>
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
          {saveError ? <p className="text-[13px] leading-relaxed text-red-300/90">{saveError}</p> : null}

          {typeof onDeleteAccount === 'function' ? (
            <div className="border-t border-zinc-800/90 pt-5">
              <button
                type="button"
                disabled={deleteAccountBusy}
                onClick={() => void onDeleteAccount()}
                className="text-[14px] font-semibold text-red-400 underline underline-offset-2 touch-manipulation hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
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

      {handleChangeDialog ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
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
                You already changed your handle within the last 7 days. The next change is allowed after{' '}
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
                Cancel
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
        </div>
      ) : null}

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
    </div>
  )
}
