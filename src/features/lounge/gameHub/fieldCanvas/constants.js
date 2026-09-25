/** Field units: 1 unit ≈ 5 yards. Full slab = 120 yd × 53⅓ yd. */
export const FIELD_LEN = 24
export const FIELD_WID = 53.33 / 5
export const ENDZONE = 2
export const PLAYING_LEN = FIELD_LEN - ENDZONE * 2
export const FIELD_THICK = 0.35

/** Coliseum inner clearance around the field apron. */
export const APRON = 1.2
export const BOWL_INNER_LEN = FIELD_LEN + APRON * 2
export const BOWL_INNER_WID = FIELD_WID + APRON * 2
