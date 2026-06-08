/** Dedupe key for composer chart picker pills / attach rows. */
export function marketSymbolDedupeKey(row) {
  return `${row?.asset_class || 'stock'}:${row?.symbol || ''}`.toLowerCase()
}
