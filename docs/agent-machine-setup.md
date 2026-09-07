# Agent machine setup (Windows / Mac)

## GitHub GH007 … private email block

GitHub setting **Block command line pushes that expose my email** rejects any commit whose author or committer is a private address on the account. This repo was committing as `investigence@gmail.com`, which is private on **xytgeist**, so `git push` died with **GH007**.

**This repo’s commit email** is GitHub’s allowed noreply:

`5695681+xytgeist@users.noreply.github.com`

Set **local to this repo only** (do not change a machine-wide identity unless Ryan asks):

```bash
git config user.email "5695681+xytgeist@users.noreply.github.com"
git config user.name "Ryan Franklin"
```

Alternative: GitHub → Settings → Emails → uncheck the block. Then gmail commits would push, but they would also publish that address on GitHub.

## Dual Cloudflare Wrangler

Two accounts. Bare `npx wrangler` uses the last `wrangler login` OAuth session and will hit the wrong account.

| Wrapper | Account | Use for |
| --- | --- | --- |
| `npm run cf:ops` | Operations (`e8b180b08329ff5de73fba3066e9c1ad`) | `sharpesyndicate.com`, `lvslotpro.com` |
| `npm run cf:digiverse` | Investigence (`dda7b47930eac57521c13cfa4efba3cd`) | `digiverse.ventures`, `edgetilt.com` DNS/Pages |

Tokens: copy `.env.cloudflare.example` → `.env.cloudflare.operations` and `.env.cloudflare.investigence` (gitignored). Paste a Pages-edit **account API token** for that login.

```bash
npm run syndicate:deploy
npm run digiverse:deploy
```

If `syndicate:deploy` 404s the project name, run `npm run cf:ops -- pages project list` and fix `--project-name`.

**Syndicate live domain:** Pages project **`sharpe-syndicate`** is git-connected. **Production branch is `test`**, not `main`. Pushing **`origin/test`** publishes **https://sharpesyndicate.com**. `main` builds are Preview. `npm run syndicate:deploy` is Direct Upload when you need a local `dist-syndicate` without waiting on Git.
