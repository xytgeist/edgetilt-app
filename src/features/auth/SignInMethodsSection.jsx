import { useCallback, useState } from 'react'
import { isEdgeiOSShell } from '../../utils/edgeNative.js'
import { signInMethodLabel, userSignInMethods } from './deviceAccounts.js'
import { friendlyLinkError, linkAppleIdentity, linkGoogleIdentity } from './linkSignInMethod.js'

const CONNECT_BTN =
  'min-h-9 shrink-0 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 text-[13px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]'

export default function SignInMethodsSection({ supabaseClient, authUser, onAuthUserUpdated, onFocusPhone }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const methods = userSignInMethods(authUser)
  const canApple = isEdgeiOSShell()

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
        const { data } = await supabaseClient.auth.getUser()
        if (data?.user) onAuthUserUpdated?.(data.user)
        setMessage('Apple is now connected. You can sign in with it next time.')
      } catch (e) {
        setError(friendlyLinkError(e, signInMethodLabel(method)))
      } finally {
        setBusy('')
      }
    },
    [supabaseClient, busy, onAuthUserUpdated],
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
          return (
            <li
              key={id}
              className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3"
            >
              <span className="text-[14px] font-medium text-zinc-200">{signInMethodLabel(id)}</span>
              {linked ? (
                <span className="text-[12px] font-semibold text-emerald-400" data-sign-in-method-linked>
                  Connected
                </span>
              ) : id === 'phone' ? (
                <button type="button" className={CONNECT_BTN} onClick={() => onFocusPhone?.()}>
                  Add above
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
