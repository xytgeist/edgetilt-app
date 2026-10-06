import {
  DEFAULT_UNIT_SIZE_DOLLARS,
  readBankrollStart,
  readUnitSizeDollars,
  writeBankrollStart,
  writeUnitSizeDollars,
} from './sportsBetStake.js'

const SELECT = 'user_id, unit_size_dollars, bankroll_start, updated_at'

export function emptySportsBetSettings() {
  return {
    unit_size_dollars: readUnitSizeDollars(),
    bankroll_start: readBankrollStart(),
  }
}

export async function loadSportsBetSettings(supabaseClient) {
  const local = emptySportsBetSettings()
  if (!supabaseClient) return { settings: local, error: null }
  const { data, error } = await supabaseClient
    .from('sports_bet_settings')
    .select(SELECT)
    .maybeSingle()
  if (error) return { settings: local, error: error.message }
  if (!data) return { settings: local, error: null }
  const unit = Number(data.unit_size_dollars)
  const start = Number(data.bankroll_start)
  if (Number.isFinite(unit) && unit > 0) writeUnitSizeDollars(unit)
  if (Number.isFinite(start)) writeBankrollStart(start)
  return {
    settings: {
      unit_size_dollars: Number.isFinite(unit) && unit > 0 ? unit : DEFAULT_UNIT_SIZE_DOLLARS,
      bankroll_start: Number.isFinite(start) ? start : 0,
    },
    error: null,
  }
}

export async function saveSportsBetSettings(supabaseClient, userId, next) {
  const unit = Number(next?.unit_size_dollars)
  const start = Number(next?.bankroll_start)
  if (!Number.isFinite(unit) || unit <= 0) return { settings: null, error: 'Unit size must be > 0' }
  if (!Number.isFinite(start)) return { settings: null, error: 'Bankroll required' }
  writeUnitSizeDollars(unit)
  writeBankrollStart(start)
  const row = {
    unit_size_dollars: unit,
    bankroll_start: start,
  }
  if (!supabaseClient || !userId) return { settings: { ...row }, error: null }
  const { data, error } = await supabaseClient
    .from('sports_bet_settings')
    .upsert({ user_id: userId, ...row }, { onConflict: 'user_id' })
    .select(SELECT)
    .single()
  if (error) return { settings: { ...row }, error: error.message }
  return {
    settings: {
      unit_size_dollars: Number(data.unit_size_dollars) || unit,
      bankroll_start: Number(data.bankroll_start),
    },
    error: null,
  }
}
