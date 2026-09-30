import { useCallback, useState } from 'react'
import { isEdgeiOSShell } from '../../utils/edgeNative.js'
import { signInMethodLabel, userSignInMethods } from './deviceAccounts.js'
import { friendlyLinkError, linkAppleIdentity, linkGoogleIdentity } from './linkSignInMethod.js'

const ROW_LABEL = { google: 'Google', apple: 'Apple', phone: 'Phone', email: 'Email' }

const CONNECT_BTN =
  'min-h-9 shrink-0 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 text-[13px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]'
const TEXT_BTN =
  'min-h-9 shrink-0 px-1 text-[13px] font-semibold touch-manipulation disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]'

export default function SignInMethodsSection({
  supabaseClient,
  authUser,
  onAuthUserUpdated,
  onFocusPhone,
  onRemovePhone,
}) {
  const [busy, setBusy] = useState('')
  const [confirming, setConfirming] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const methods = userSignInMethods(authUser)
  const canApple = isEdgeiOSShell()
  const lastMethod = methods.length <= 1

  const refreshUser = useCallback(async () => {
    const { data } = await supabaseClient.auth.getUser()
    if (data?.user) onAuthUserUpdated?.(data.user)
  }, [supabaseClient, onAuthUserUpdated])

  const connect = useCallback(
    async (method) => {
      if (!supabaseClient || busy) return
      setBusy(method)
      setError('')
      setMessage('')
      try {
        if (method === 'google') {
          await linkGoogleIdentity(supabaseClient)
          return
        }
        const { cancelled } = await linkAppleIdentity(supabaseClient)
        if (cancelled) return
        await refreshUser()
        setMessage('Apple is now connected. You can sign in with it next time.')
      } catch (e) {
        setError(friendlyLinkError(e, signInMethodLabel(method)))
      } finally {
        setBusy('')
      }
    },
    [supabaseClient, busy, refreshUser],
  )

  const disconnect = useCallback(
    async (method) => {
      if (!supabaseClient || busy) return
      setConfirming('')
      setError('')
      setMessage('')
      if (method === 'phone') {
        onRemovePhone?.()
        return
      }
      setBusy(method)
      try {
        const { data, error: listErr } = await supabaseClient.auth.getUserIdentities()
        if (listErr) throw listErr
        const identity = (data?.identities || []).find((i) => String(i?.provider || '').toLowerCase() === method)
        if (!identity) throw new Error(`${ROW_LABEL[method]} is not connected.`)
        const { error: unlinkErr } = await supabaseClient.auth.unlinkIdentity(identity)
        if (unlinkErr) throw unlinkErr
        await supabaseClient.auth.refreshSession().catch(() => {})
        await refreshUser()
        setMessage(`${ROW_LABEL[method]} is disconnected. It will no longer sign in to this account.`)
      } catch (e) {
        const msg = String(e?.message || '')
        setError(
          /single identity|last identity|at least one/i.test(msg)
            ? 'This is your only way to sign in, so it can’t be disconnected.'
            : msg || 'Could not disconnect. Try again.',
        )
      } finally {
        setBusy('')
      }
    },
    [supabaseClient, busy, onRemovePhone, refreshUser],
  )

  const rows = [
    { id: 'google', show: true },
    { id: 'apple', show: methods.includes('apple') || canApple },
    { id: 'phone', show: true },
    { id: 'email', show: methods.includes('email') },
  ].filter((r) => r.show)

  return (
    <div className="border-t border-zinc-800/90 pt-5" data-settings-sign-in-methods>
      <p className="text-[13px] font-semibold text-zinc-300">Sign-in methods</p>
      <p className="mt-1 text-[12px] leading-snug text-zinc-500">
        Connect every way you sign in so they all open this account.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map(({ id }) => {
          const linked = methods.includes(id)
          // Email is the account's recovery address; change it in the Email field instead.
          const canDisconnect = linked && id !== 'email' && !lastMethod
          return (
            <li
              key={id}
              className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3"
            >
              <span className="text-[14px] font-medium text-zinc-200">{ROW_LABEL[id]}</span>
              {linked && confirming === id ? (
                <span className="flex items-center gap-2">
                  <span className="text-[12px] text-zinc-400">Disconnect?</span>
                  <button
                    type="button"
                    className={`${TEXT_BTN} text-red-400`}
                    data-sign-in-method-disconnect-confirm
                    onClick={() => void disconnect(id)}
                  >
                    Yes
                  </button>
                  <button type="button" className={`${TEXT_BTN} text-zinc-400`} onClick={() => setConfirming('')}>
                    Cancel
                  </button>
                </span>
              ) : linked ? (
                <span className="flex items-center gap-3">
                  <span className="text-[12px] font-semibold text-emerald-400" data-sign-in-method-linked>
                    {busy === id ? 'Disconnecting…' : 'Connected'}
                  </span>
                  {canDisconnect ? (
                    <button
                      type="button"
                      className={`${TEXT_BTN} text-zinc-400 underline underline-offset-2`}
                      disabled={Boolean(busy)}
                      data-sign-in-method-disconnect
                      onClick={() => {
                        setError('')
                        setMessage('')
                        setConfirming(id)
                      }}
                    >
                      Disconnect
                    </button>
                  ) : null}
                </span>
              ) : id === 'phone' ? (
                <button type="button" className={CONNECT_BTN} onClick={() => onFocusPhone?.()}>
                  Add
                </button>
              ) : id === 'google' || id === 'apple' ? (
                <button
                  type="button"
                  className={CONNECT_BTN}
                  disabled={Boolean(busy)}
                  onClick={() => void connect(id)}
                >
                  {busy === id ? 'Connecting…' : 'Connect'}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {message ? <p className="mt-2 text-[13px] leading-relaxed text-cyan-200/90">{message}</p> : null}
      {error ? <p className="mt-2 text-[13px] leading-relaxed text-red-300/90">{error}</p> : null}
    </div>
  )
}
