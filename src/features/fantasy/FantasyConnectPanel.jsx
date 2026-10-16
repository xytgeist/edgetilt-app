function ConnectionCard({ title, subtitle, statusLine, errorLine, children }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold">{title}</div>
          {subtitle ? <p className="mt-1 text-[13px] text-zinc-400">{subtitle}</p> : null}
        </div>
        {statusLine ? (
          <div className="shrink-0 text-right text-[11px] text-zinc-500">{statusLine}</div>
        ) : null}
      </div>
      {errorLine ? <div className="mt-2 text-[12px] text-rose-400">{errorLine}</div> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  )
}

function syncedLine(row) {
  if (!row?.last_sync_at) return 'Not synced'
  try {
    return `Synced ${new Date(row.last_sync_at).toLocaleString()}`
  } catch {
    return 'Synced'
  }
}

/**
 * Host connect cards. Full page before the first link. Inside the manage sheet after.
 */
export default function FantasyConnectPanel({
  sleeper,
  yahoo,
  espn,
  cbs,
  username,
  setUsername,
  busy,
  espnInApp,
  cbsInApp,
  onLinkSleeper,
  onConnectYahoo,
  onConnectEspn,
  onConnectCbs,
}) {
  return (
    <div className="space-y-4">
      {sleeper ? (
        <ConnectionCard
          title="Sleeper"
          subtitle={`@${sleeper.external_username}`}
          statusLine={syncedLine(sleeper)}
          errorLine={sleeper.status === 'error' ? sleeper.last_error || 'Sync error' : ''}
        />
      ) : (
        <ConnectionCard
          title="Connect Sleeper"
          subtitle="Enter the username you use on sleeper.app (public … no password)."
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="sleeper username"
              autoCapitalize="none"
              autoCorrect="off"
              className="min-w-0 flex-1 rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-zinc-600"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onLinkSleeper()
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void onLinkSleeper()}
              className="shrink-0 rounded-full bg-sky-500 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? '…' : 'Link'}
            </button>
          </div>
        </ConnectionCard>
      )}

      {yahoo ? (
        <ConnectionCard
          title="Yahoo"
          subtitle={yahoo.external_username || 'Connected'}
          statusLine={syncedLine(yahoo)}
          errorLine={yahoo.status === 'error' ? yahoo.last_error || 'Sync error' : ''}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConnectYahoo()}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            Reconnect Yahoo
          </button>
        </ConnectionCard>
      ) : (
        <ConnectionCard
          title="Connect Yahoo"
          subtitle="Authorize EdgeTilt to read your Yahoo Fantasy NFL leagues (OAuth ... no password stored)."
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConnectYahoo()}
            className="rounded-full bg-violet-500 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? '…' : 'Connect Yahoo'}
          </button>
        </ConnectionCard>
      )}

      {espn ? (
        <ConnectionCard
          title="ESPN"
          subtitle={espn.external_username || 'Connected'}
          statusLine={syncedLine(espn)}
          errorLine={espn.status === 'error' ? espn.last_error || 'Sync error' : ''}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConnectEspn()}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            Reconnect ESPN
          </button>
        </ConnectionCard>
      ) : (
        <ConnectionCard
          title="Connect ESPN"
          subtitle={
            espnInApp
              ? 'Log in on the ESPN page inside EdgeTilt. We keep the session cookie and never store your password.'
              : 'Available in the EdgeTilt iPhone or Android app after this update. A normal browser cannot read an ESPN login.'
          }
        >
          <button
            type="button"
            disabled={busy || !espnInApp}
            onClick={() => void onConnectEspn()}
            className="rounded-full bg-sky-500 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? '…' : 'Connect ESPN'}
          </button>
        </ConnectionCard>
      )}

      {cbs ? (
        <ConnectionCard
          title="CBS"
          subtitle={cbs.external_username || 'Connected'}
          statusLine={syncedLine(cbs)}
          errorLine={cbs.status === 'error' ? cbs.last_error || 'Sync error' : ''}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConnectCbs()}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            Reconnect CBS
          </button>
        </ConnectionCard>
      ) : (
        <ConnectionCard
          title="Connect CBS"
          subtitle={
            cbsInApp
              ? 'Log in on the CBS page inside EdgeTilt. We keep the session and never store your password.'
              : 'Available in the EdgeTilt iPhone or Android app after this update. A normal browser cannot read a CBS login.'
          }
        >
          <button
            type="button"
            disabled={busy || !cbsInApp}
            onClick={() => void onConnectCbs()}
            className="rounded-full bg-sky-500 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? '…' : 'Connect CBS'}
          </button>
        </ConnectionCard>
      )}
    </div>
  )
}
