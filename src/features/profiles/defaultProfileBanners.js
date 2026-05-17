/**
 * Default profile banner images (static files under `public/profile-banner-placeholders/`).
 * Assigned once on new `profiles` insert; replace files in that folder to change art.
 */
export const DEFAULT_PROFILE_BANNER_PATHS = [
  '/profile-banner-placeholders/01-lowpoly-blue.png',
  '/profile-banner-placeholders/02-lowpoly-neutral.png',
  '/profile-banner-placeholders/03-network-light.png',
  '/profile-banner-placeholders/04-network-dark.png',
  '/profile-banner-placeholders/05-network-slate.png',
  '/profile-banner-placeholders/06-network-teal.png',
  '/profile-banner-placeholders/07-network-red.png',
  '/profile-banner-placeholders/08-hex-light-warm.png',
  '/profile-banner-placeholders/09-hex-light-gradient.png',
  '/profile-banner-placeholders/10-hex-dark-rainbow.png',
  '/profile-banner-placeholders/11-hex-teal-light.png',
  '/profile-banner-placeholders/12-hex-teal-dark.png',
  '/profile-banner-placeholders/13-hex-rainbow-light.png',
  '/profile-banner-placeholders/14-hex-rainbow-dark.png',
  '/profile-banner-placeholders/15-network-blue-dark.png',
  '/profile-banner-placeholders/16-lowpoly-dark.png',
]

/** Stable pick per user id (same user always gets the same placeholder). */
export function pickDefaultProfileBannerUrl(userId) {
  const paths = DEFAULT_PROFILE_BANNER_PATHS
  if (!paths.length) return null
  let hash = 0
  const seed = String(userId || '')
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return paths[hash % paths.length]
}
