import { useCallback, useEffect, useState } from 'react'
import AuthModalShell from './AuthModalShell.jsx'
import { friendlyLinkError, linkAppleIdentity, linkGoogleIdentity } from './linkSignInMethod.js'
import { createAppleIdTokenNonce } from './appleIdTokenNonce.js'
import { reloadAfterAuthSession } from './authPostLoginReload.js'
import { edgeNativeInvoke, isEdgeiOSShell } from '../../utils/edgeNative.js'
import { isLikelyNewAuthUser } from '../lounge/firstRunChromeTour.js'
import {
  ensureDefaultProfileRow,
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate.js'
import {
  forgetDeviceAccount,
  listDeviceAccounts,
  markConnectPromptShown,
  readConnectPending,
  rememberDeviceAccount,
  signInMethodLabel,
  userSignInMethods,
  wasConnectPromptShown,
  writeConnectPending,
} from './deviceAccounts.js'

/** Drop remembered accounts that were deleted (or banned); refresh name / avatar from the live profile. */
async function liveDeviceAccounts(supabase, accounts) {
  const ids = accounts.map((a) => a.user_id)
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url')
    .in('user_id', ids)
  if (error || !Array.isArray(data)) return accounts
  const live = new Map(data.map((row) => [row.user_id, row]))
  const kept = []
  for (const account of accounts) {
    const row = live.get(account.user_id)
    if (!row) {
      forgetDeviceAccount(account.user_id)
      continue
    }
    kept.push({
      ...account,
      handle: row.handle || account.handle,
      display_name: row.display_name || account.display_name,
      avatar_url: row.avatar_url || account.avatar_url,
    })
  }
  return kept
}

function preferredTargetMethod(account) {
  const methods = account?.methods || []
  const order = [account?.last_method, 'google', 'apple', 'phone', 'email']
  return order.find((m) => m && methods.includes(m) && (m !== 'apple' || isEdgeiOSShell())) || ''
}

/**
 * Jump straight into the remembered account's own sign-in (Google redirect / native Apple).
 * Returns false when it needs the sign-in modal (phone, email, or Apple cancelled).
 */
async function signInToRemembered(supabase, account) {
  const method = preferredTargetMethod(account)
  try {
    if (method === 'google') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/` },
      })
      return !error
    }
    if (method === 'apple') {
      const { raw, hashed } = await createAppleIdTokenNonce()
      const native = await edgeNativeInvoke('signInWithApple', { nonce: hashed })
      if (native?.cancelled || !native?.identityToken) return false
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: native.identityToken,
        nonce: raw,
      })
      if (error) return false
      await reloadAfterAuthSession((u) => ensureDefaultProfileRow(supabase, u), data.user)
      return true
    }
  } catch {
    return false
  }
  return false
}

async function attachVerifiedTransfer(supabase, transferToken) {
  const { data, error } = await supabase.functions.invoke('account-connect-attach', {
    body: { transfer_token: transferToken },
  })
  if (!error && data?.ok) return { ok: true }
  let message = 'Could not connect automatically. Confirm below.'
  try {
    const body = await error?.context?.json?.()
    if (body?.error) message = body.error
  } catch {
    /* keep default */
  }
  return { ok: false, error: message }
}

function methodsText(methods) {
  const labels = (methods || []).map(signInMethodLabel)
  if (labels.length <= 1) return labels[0] || 'your usual sign-in'
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`
}

function AccountRow({ account, onConnect, onForget, busy }) {
  const hint = account.email_hint || account.phone_hint
  return (
    <li data-account-connect-row className="flex items-center gap-3 rounded-2xl border border-zinc-700/60 bg-zinc-800/60 p-3">
      {account.avatar_url ? (
        <img src={account.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
      ) : (
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${profileAvatarToneClass(account.user_id)}`}
        >
          {profileAvatarInitials(account.display_name, account.handle)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-white">{account.display_name || `@${account.handle}`}</p>
        <p className="truncate text-[12px] text-zinc-400">
          {account.handle ? `@${account.handle} · ` : ''}
          {methodsText(account.methods)}
          {hint ? ` · ${hint}` : ''}
        </p>
        <button
          type="button"
          onClick={() => onForget(account)}
          disabled={busy}
          className="mt-1 text-[11px] font-medium text-zinc-500 underline-offset-2 hover:underline"
        >
          Remove from this device
        </button>
      </div>
      <button
        type="button"
        onClick={() => onConnect(account)}
        disabled={busy}
        className="shrink-0 rounded-full bg-orange-600 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
      >
        Connect
      </button>
    </li>
  )
}

/**
 * After a sign-in creates a brand-new account on a device that remembers another account:
 * "Connect account? / Continue with new". Connect signs them straight in to the remembered
 * account; only then does `account-connect-attach` delete the empty new account and hand its
 * verified phone / email over (Apple / Google still link via `linkIdentity`).
 */
export default function AccountConnectSheet({ supabase, user, onRequestSignIn, onNotice }) {
  const [offer, setOffer] = useState(null)
  const [finish, setFinish] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [phoneCodeSent, setPhoneCodeSent] = useState(false)
  const [phoneCode, setPhoneCode] = useState('')

  useEffect(() => {
    if (!user?.id) return undefined
    let cancelled = false
    const run = async () => {
      const pending = readConnectPending()
      if (pending) {
        if (pending.targetUserId === user.id) {
          if (pending.transferToken) {
            // Signed in to the old account: now the server deletes the new one and hands over its verified number.
            const result = await attachVerifiedTransfer(supabase, pending.transferToken)
            if (cancelled) return
            if (!result.ok) {
              writeConnectPending(null)
              setError(result.error)
              setFinish({ ...pending, transferToken: '', failed: true })
              return
            }
            await supabase.auth.refreshSession().catch(() => {})
            const { data } = await supabase.auth.getUser()
            if (cancelled) return
            const refreshed = data?.user || user
            const { data: profile } = await ensureDefaultProfileRow(supabase, refreshed)
            rememberDeviceAccount(refreshed, profile)
            if (pending.freshMethod === 'phone' || pending.freshMethod === 'email' || userSignInMethods(refreshed).includes(pending.freshMethod)) {
              writeConnectPending(null)
              onNotice?.(`Your ${signInMethodLabel(pending.freshMethod)} is now connected to @${pending.targetHandle}.`)
              return
            }
            const next = { ...pending, transferToken: '' }
            writeConnectPending(next)
            setFinish(next)
            return
          }
          if (userSignInMethods(user).includes(pending.freshMethod)) {
            writeConnectPending(null)
            onNotice?.(`${signInMethodLabel(pending.freshMethod)} is now connected to @${pending.targetHandle}.`)
            return
          }
          setFinish(pending)
          return
        }
        writeConnectPending(null)
      }
      const { data: profile } = await ensureDefaultProfileRow(supabase, user)
      if (cancelled) return
      const remembered = listDeviceAccounts().filter((a) => a.user_id !== user.id)
      const others = remembered.length ? await liveDeviceAccounts(supabase, remembered) : []
      if (cancelled) return
      // Marked shown only on an answer: phone / password sign-in hard-reloads right after SIGNED_IN.
      if (isLikelyNewAuthUser(user) && others.length && !wasConnectPromptShown(user.id)) {
        setOffer({ others, profile })
        return
      }
      rememberDeviceAccount(user, profile)
    }
    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per signed-in account
  }, [user?.id])

  const continueWithNew = useCallback(() => {
    if (user?.id) markConnectPromptShown(user.id)
    if (offer) rememberDeviceAccount(user, offer.profile)
    setOffer(null)
    setError('')
  }, [offer, user])

  const forget = useCallback(
    (account) => {
      forgetDeviceAccount(account.user_id)
      const others = (offer?.others || []).filter((a) => a.user_id !== account.user_id)
      if (others.length) setOffer({ ...offer, others })
      else continueWithNew()
    },
    [offer, continueWithNew],
  )

  const connect = useCallback(
    async (account) => {
      const freshMethod = userSignInMethods(user)[0]
      if (!freshMethod) {
        setError('Could not tell how you signed in. Connect it later in Settings → Account info.')
        return
      }
      setBusy(true)
      setError('')
      writeConnectPending({
        targetUserId: account.user_id,
        targetHandle: account.handle,
        targetMethods: account.methods,
        freshMethod,
        freshPhone: user.phone || '',
        freshEmail: user.email || '',
      })
      const { data, error: fnErr } = await supabase.functions.invoke('account-connect-prepare', {
        body: { target_user_id: account.user_id },
      })
      if (fnErr || !data?.ok || !data?.transfer_token) {
        writeConnectPending(null)
        let message = 'Could not connect right now. You can connect it later in Settings → Account info.'
        try {
          const body = await fnErr?.context?.json?.()
          if (body?.error) message = body.error
        } catch {
          /* keep default */
        }
        setError(message)
        setBusy(false)
        return
      }
      const pending = readConnectPending()
      if (pending) writeConnectPending({ ...pending, transferToken: data.transfer_token })
      setOffer(null)
      setBusy(false)
      await supabase.auth.signOut({ scope: 'local' })
      const started = await signInToRemembered(supabase, account)
      if (started) return
      onRequestSignIn?.(
        `Sign in to @${account.handle} with ${methodsText(account.methods)} to finish connecting ${signInMethodLabel(freshMethod)}.`,
      )
    },
    [supabase, user, onRequestSignIn],
  )

  const done = useCallback(
    async (message) => {
      writeConnectPending(null)
      setFinish(null)
      setPhoneCodeSent(false)
      setPhoneCode('')
      const { data } = await supabase.auth.getUser()
      if (data?.user) {
        const { data: profile } = await ensureDefaultProfileRow(supabase, data.user)
        rememberDeviceAccount(data.user, profile)
      }
      onNotice?.(message)
    },
    [supabase, onNotice],
  )

  const linkFresh = useCallback(async () => {
    if (!finish) return
    setBusy(true)
    setError('')
    try {
      const label = signInMethodLabel(finish.freshMethod)
      if (finish.freshMethod === 'apple') {
        const { cancelled } = await linkAppleIdentity(supabase)
        if (cancelled) return
        await done(`${label} is now connected to @${finish.targetHandle}.`)
      } else if (finish.freshMethod === 'google') {
        await linkGoogleIdentity(supabase)
      } else if (finish.freshMethod === 'phone') {
        const phone = `+${String(finish.freshPhone || '').replace(/\D/g, '')}`
        if (!phoneCodeSent) {
          const { data: updated, error: sendErr } = await supabase.auth.updateUser({ phone })
          if (sendErr) throw sendErr
          // SMS autoconfirm attaches the number with no code.
          if (String(updated?.user?.phone || '').replace(/\D/g, '') === phone.slice(1)) {
            await done(`Your phone number is now connected to @${finish.targetHandle}.`)
            return
          }
          setPhoneCodeSent(true)
        } else {
          const { error: verifyErr } = await supabase.auth.verifyOtp({ phone, token: phoneCode.trim(), type: 'phone_change' })
          if (verifyErr) throw verifyErr
          await done(`Your phone number is now connected to @${finish.targetHandle}.`)
        }
      } else if (finish.freshMethod === 'email') {
        const { error: emailErr } = await supabase.auth.updateUser({ email: finish.freshEmail })
        if (emailErr) throw emailErr
        await done(`Check ${finish.freshEmail} for a link to finish connecting it to @${finish.targetHandle}.`)
      }
    } catch (e) {
      setError(friendlyLinkError(e, signInMethodLabel(finish.freshMethod)))
    } finally {
      setBusy(false)
    }
  }, [finish, phoneCodeSent, phoneCode, supabase, done])

  const cancelFinish = useCallback(() => {
    writeConnectPending(null)
    setFinish(null)
    setPhoneCodeSent(false)
    setPhoneCode('')
    setError('')
  }, [])

  if (!offer && !finish) return null

  return (
    <AuthModalShell onClose={() => {}}>
      <div data-account-connect-sheet>
        {offer ? (
          <>
            <h2 id="account-connect-title" className="text-center text-lg font-bold text-white">Connect account?</h2>
            <p className="mt-1 text-center text-sm leading-relaxed text-zinc-400">
              This is a new account. {offer.others.length > 1 ? 'These accounts have' : 'This account has'} signed in on this device before.
              Connect to keep one account you can sign in to either way.
            </p>
            <ul className="mt-4 space-y-2">
              {offer.others.map((account) => (
                <AccountRow key={account.user_id} account={account} onConnect={connect} onForget={forget} busy={busy} />
              ))}
            </ul>
            {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
            <button
              type="button"
              onClick={continueWithNew}
              disabled={busy}
              className="mt-4 w-full rounded-full border border-zinc-600 py-3 text-[15px] font-semibold text-zinc-200 disabled:opacity-50"
            >
              Continue with new
            </button>
          </>
        ) : (
          <>
            <h2 id="account-connect-title" className="text-center text-lg font-bold text-white">
              {finish.failed ? 'Couldn’t connect' : `Connect ${signInMethodLabel(finish.freshMethod)} to @${finish.targetHandle}`}
            </h2>
            <p className="mt-1 text-center text-sm leading-relaxed text-zinc-400">
              {finish.failed
                ? `You’re signed in to @${finish.targetHandle}. Your other account was left as it was.`
                : finish.freshMethod === 'phone'
                ? 'We’ll text a code to confirm your number.'
                : finish.freshMethod === 'email'
                  ? 'We’ll email a link to confirm the address.'
                  : `Confirm with ${signInMethodLabel(finish.freshMethod)} once more and you’re done.`}
            </p>
            {finish.freshMethod === 'phone' && phoneCodeSent ? (
              <input
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Code"
                className="mt-4 w-full rounded-2xl bg-zinc-800 px-4 py-3 text-lg tracking-widest text-white outline-none"
              />
            ) : null}
            {error ? <p className="mt-3 text-center text-sm text-rose-300">{error}</p> : null}
            {finish.failed ? null : (
              <button
                type="button"
                onClick={linkFresh}
                disabled={busy || (finish.freshMethod === 'phone' && phoneCodeSent && phoneCode.length < 4)}
                className="mt-4 w-full rounded-full bg-orange-600 py-3 text-[15px] font-bold text-white disabled:opacity-50"
              >
                {finish.freshMethod === 'phone' ? (phoneCodeSent ? 'Confirm code' : 'Send code') : `Connect ${signInMethodLabel(finish.freshMethod)}`}
              </button>
            )}
            <button
              type="button"
              onClick={cancelFinish}
              disabled={busy}
              className="mt-2 w-full py-2 text-[13px] font-medium text-zinc-400"
            >
              {finish.failed ? 'OK' : 'Not now'}
            </button>
          </>
        )}
      </div>
    </AuthModalShell>
  )
}
