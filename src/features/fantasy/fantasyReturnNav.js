/** Sports Hub filter to reopen when Fantasy closes, if Fantasy was opened from that hub. */
let pendingHubFilter = null

export function markFantasyOpenedFromSportsHub(filter) {
  pendingHubFilter = filter ? String(filter) : null
}

export function takeFantasyHubReturn() {
  const filter = pendingHubFilter
  pendingHubFilter = null
  return filter
}
