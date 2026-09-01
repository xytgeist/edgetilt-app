/**
 * Kaggle auth helpers for UFC dataset fetch (new token + legacy kaggle.json).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function readTrimmed(filePath) {
  if (!fs.existsSync(filePath)) return null
  const text = fs.readFileSync(filePath, 'utf8').trim()
  return text || null
}

function kaggleConfigDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.USERPROFILE || os.homedir(), '.kaggle')
  }
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) return path.join(xdg, 'kaggle')
  return path.join(os.homedir(), '.kaggle')
}

/** @returns {{ type: 'bearer', token: string } | { type: 'basic', username: string, key: string } | null} */
export function loadKaggleAuth() {
  if (process.env.KAGGLE_API_TOKEN?.trim()) {
    return { type: 'bearer', token: process.env.KAGGLE_API_TOKEN.trim() }
  }

  const dir = kaggleConfigDir()
  const accessToken = readTrimmed(path.join(dir, 'access_token'))
  if (accessToken) return { type: 'bearer', token: accessToken }

  for (const envFile of ['.env', '.env.local']) {
    const envPath = path.join(process.cwd(), envFile)
    if (!fs.existsSync(envPath)) continue
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      if (line.startsWith('KAGGLE_API_TOKEN=')) {
        const token = line.slice('KAGGLE_API_TOKEN='.length).trim()
        if (token) return { type: 'bearer', token }
      }
    }
  }

  const legacyPath = path.join(dir, 'kaggle.json')
  if (fs.existsSync(legacyPath)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'))
      if (legacy.username && legacy.key) {
        return { type: 'basic', username: legacy.username, key: legacy.key }
      }
    } catch {
      /* ignore */
    }
  }

  if (process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY) {
    return {
      type: 'basic',
      username: process.env.KAGGLE_USERNAME.trim(),
      key: process.env.KAGGLE_KEY.trim(),
    }
  }

  return null
}

/** @param {{ type: 'bearer', token: string } | { type: 'basic', username: string, key: string }} auth */
export function kaggleAuthHeaders(auth) {
  if (auth.type === 'bearer') {
    return { Authorization: `Bearer ${auth.token}` }
  }
  const encoded = Buffer.from(`${auth.username}:${auth.key}`).toString('base64')
  return { Authorization: `Basic ${encoded}` }
}

export function kaggleAuthHelpText() {
  return [
    'Set up Kaggle API access: https://www.kaggle.com/settings/api',
    '',
    'New token (recommended):',
    '  export KAGGLE_API_TOKEN=KGAT_...',
    '  or save token to ~/.kaggle/access_token',
    '',
    'Or stable CLI:',
    '  pip install kaggle kagglehub',
    '  kaggle auth login',
    '',
    'Legacy:',
    '  ~/.kaggle/kaggle.json (username + key)',
  ].join('\n')
}
