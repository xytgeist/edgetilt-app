/**
 * Default name for accounts with no usable email (phone sign-up, Apple Hide My Email): adjective + noun + 10-999,
 * e.g. handle `tiltedwhale27`, display name `Tilted Whale`.
 * Derived from the user id so every caller of profileSeedFromUser agrees on the same name.
 * Keep words short (handle max 30) and App Store clean.
 */
const ADJECTIVES = [
  'tilted', 'juiced', 'salty', 'spicy', 'lucky', 'sweaty', 'stacked', 'clutch', 'sharp', 'square',
  'frisky', 'reckless', 'greasy', 'scrappy', 'feral', 'unhinged', 'cursed', 'blessed', 'loaded', 'wild',
  'sneaky', 'chalky', 'gritty', 'rowdy', 'heated', 'icy', 'steamy', 'shifty', 'cheeky', 'bold',
  'hungry', 'savage', 'slick', 'spazzy', 'goofy', 'mighty', 'dizzy', 'frosty', 'jumpy', 'zesty',
]

const NOUNS = [
  'whale', 'shark', 'fish', 'donkey', 'goat', 'grinder', 'punter', 'nit', 'maniac', 'hammer',
  'parlay', 'longshot', 'underdog', 'fader', 'hedger', 'chipper', 'stacker', 'jackpot', 'wildcard', 'ace',
  'joker', 'river', 'bluffer', 'sweater', 'lock', 'moonshot', 'hustler', 'rounder', 'squid', 'heater',
  'bookie', 'dealer', 'roller', 'spinner', 'baller', 'sniper', 'tout', 'railbird', 'boss', 'gambler',
]

function hashSeed(seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

export function degenNameFromSeed(seed) {
  const h = hashSeed(String(seed || 'edge'))
  const adj = ADJECTIVES[h % ADJECTIVES.length]
  const noun = NOUNS[Math.floor(h / ADJECTIVES.length) % NOUNS.length]
  const num = 10 + (Math.floor(h / (ADJECTIVES.length * NOUNS.length)) % 990)
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1)
  return { handle: `${adj}${noun}${num}`, displayName: `${cap(adj)} ${cap(noun)}` }
}
