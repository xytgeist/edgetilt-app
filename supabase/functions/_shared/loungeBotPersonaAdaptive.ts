/**
 * Bayesian Adaptive Calibration for Sharpe Syndicate Personas (Scott, Rocco, Chedda, Tank).
 *
 * Implements Empirical Bayes Shrinkage with:
 * 1. Prior Anchor Weight (Baseline = 1.0)
 * 2. Confidence Constant (K = 30 bets minimum gravity)
 * 3. Minimum Sample Gate (N_min = 10 graded picks before adjusting)
 * 4. Maximum Delta Clamp (Max +/-5% change per calibration cycle)
 * 5. Hard Floor & Ceiling Clamps (0.70 to 1.30 absolute weight bounds)
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { SharpPicker } from './loungeBotPredictivePick.ts'

export type PersonaFactorKey =
  | 'wind_unders'
  | 'travel_fatigue'
  | 'rest_advantage'
  | 'extreme_cold_unders'
  | 'dog_sweet_spot_130_175'
  | 'dog_longshot_180_plus'
  | 'home_dog_value'
  | 'short_favorites_1_to_4'
  | 'key_number_3_value'
  | 'home_favorite_dominance'
  | 'model_clv_high_ev'
  | 'market_consensus_edge'
  | 'reverse_line_movement'
  | 'sharp_money_divergence'

export type PersonaWeightRecord = {
  picker_name: SharpPicker
  factor_key: PersonaFactorKey
  prior_weight: number
  calibrated_weight: number
  sample_size: number
  wins: number
  losses: number
  pushes: number
  net_units: number
  roi_pct: number
}

// Calibration constants
export const CALIBRATION_CONFIG = {
  CONFIDENCE_CONSTANT_K: 30, // 30-bet prior shrinkage gravity
  MIN_SAMPLE_GATE: 10,       // Must have at least 10 graded picks for factor
  MAX_CYCLE_DELTA: 0.05,     // Max +/- 5% change per Tuesday calibration
  WEIGHT_FLOOR: 0.70,        // Absolute lower bound
  WEIGHT_CEILING: 1.30,       // Absolute upper bound
} as const

/**
 * Compute the Bayesian shrunk weight from empirical sample statistics.
 *
 * Shrinkage formula:
 * Raw Factor = 1.0 + (ROI_pct / 100) * 0.5
 * Shrunk Factor = (N / (N + K)) * Raw Factor + (K / (N + K)) * Prior
 * Cycle Delta clamped to [-0.05, +0.05]
 * Absolute Weight clamped to [0.70, 1.30]
 */
export function calculateBayesianShrunkWeight(params: {
  currentWeight: number
  priorWeight: number
  sampleSize: number
  netUnits: number
}): { newWeight: number; roiPct: number; isAdjusted: boolean } {
  const { currentWeight, priorWeight, sampleSize, netUnits } = params

  if (sampleSize < CALIBRATION_CONFIG.MIN_SAMPLE_GATE) {
    return {
      newWeight: currentWeight || priorWeight,
      roiPct: 0,
      isAdjusted: false,
    }
  }

  // ROI = Net Units Won / Total 1-Unit Risked
  const roiPct = Math.round((netUnits / sampleSize) * 10000) / 100 // e.g. +12.50%

  // Empirical factor scaled relative to 1.0
  // e.g. +20% ROI -> 1.0 + (0.20 * 0.5) = 1.10
  // e.g. -20% ROI -> 1.0 + (-0.20 * 0.5) = 0.90
  const empiricalFactor = 1.0 + (roiPct / 100) * 0.5

  const n = sampleSize
  const k = CALIBRATION_CONFIG.CONFIDENCE_CONSTANT_K

  // Bayesian shrinkage towards prior
  const shrunkTarget = (n / (n + k)) * empiricalFactor + (k / (n + k)) * priorWeight

  // Apply maximum delta per calibration cycle
  const maxDelta = CALIBRATION_CONFIG.MAX_CYCLE_DELTA
  let delta = shrunkTarget - currentWeight
  if (delta > maxDelta) delta = maxDelta
  if (delta < -maxDelta) delta = -maxDelta

  let newWeight = currentWeight + delta

  // Apply absolute floor & ceiling
  if (newWeight < CALIBRATION_CONFIG.WEIGHT_FLOOR) newWeight = CALIBRATION_CONFIG.WEIGHT_FLOOR
  if (newWeight > CALIBRATION_CONFIG.WEIGHT_CEILING) newWeight = CALIBRATION_CONFIG.WEIGHT_CEILING

  newWeight = Math.round(newWeight * 1000) / 1000

  return {
    newWeight,
    roiPct,
    isAdjusted: Math.abs(newWeight - currentWeight) > 0.001,
  }
}

/**
 * Fetch all calibrated weights for personas from the database.
 * Returns a fast in-memory lookup map.
 */
export async function loadPersonaWeights(
  admin: SupabaseClient,
): Promise<Map<string, number>> {
  const weightsMap = new Map<string, number>()

  const { data, error } = await admin
    .from('lounge_bot_persona_weights')
    .select('picker_name, factor_key, calibrated_weight')

  if (error || !data) {
    return weightsMap
  }

  for (const row of data) {
    weightsMap.set(`${row.picker_name}:${row.factor_key}`, Number(row.calibrated_weight) || 1.0)
  }

  return weightsMap
}

/**
 * Run the automated Tuesday morning Bayesian calibration across all graded picks in lounge_bot_picks.
 */
export async function runPersonaAdaptiveCalibration(
  admin: SupabaseClient,
): Promise<{
  success: boolean
  updatedCount: number
  summary: Array<{ picker: string; factor: string; oldWeight: number; newWeight: number; n: number; roi: number }>
  error?: string
}> {
  // 1. Fetch all graded picks with metadata
  const { data: picks, error: picksErr } = await admin
    .from('lounge_bot_picks')
    .select('id, picker_name, market_key, pick_name, pick_line, pick_price, status, units_net, metadata')
    .in('status', ['won', 'lost', 'push'])

  if (picksErr) {
    return { success: false, updatedCount: 0, summary: [], error: picksErr.message }
  }

  // 2. Fetch existing weights records
  const { data: currentRows, error: weightsErr } = await admin
    .from('lounge_bot_persona_weights')
    .select('*')

  if (weightsErr || !currentRows) {
    return { success: false, updatedCount: 0, summary: [], error: weightsErr?.message || 'Failed to fetch weights' }
  }

  const summary: Array<{ picker: string; factor: string; oldWeight: number; newWeight: number; n: number; roi: number }> = []
  let updatedCount = 0

  for (const row of currentRows) {
    const picker = row.picker_name as SharpPicker
    const factor = row.factor_key as PersonaFactorKey

    // Filter picks matching this persona and factor
    const matchingPicks = (picks || []).filter((p) => {
      if (p.picker_name !== picker) return false
      const meta = (p.metadata || {}) as Record<string, any>
      const factorTags: string[] = Array.isArray(meta.factors) ? meta.factors : []

      // Match based on factor tags or market classification
      if (factorTags.includes(factor)) return true

      if (factor === 'wind_unders' && meta.is_high_wind && p.market_key === 'totals') return true
      if (factor === 'travel_fatigue' && meta.has_travel_fatigue) return true
      if (factor === 'rest_advantage' && meta.has_rest_advantage) return true
      if (factor === 'extreme_cold_unders' && meta.is_extreme_cold && p.market_key === 'totals') return true
      if (factor === 'dog_sweet_spot_130_175' && Number(p.pick_price) >= 130 && Number(p.pick_price) <= 175) return true
      if (factor === 'dog_longshot_180_plus' && Number(p.pick_price) > 175) return true
      if (factor === 'short_favorites_1_to_4' && Number(p.pick_line) <= -1 && Number(p.pick_line) >= -4) return true
      if (factor === 'key_number_3_value' && Math.abs(Number(p.pick_line)) === 3) return true
      if (factor === 'model_clv_high_ev' && p.picker_name === 'Scott') return true

      return false
    })

    const sampleSize = matchingPicks.length
    const wins = matchingPicks.filter((p) => p.status === 'won').length
    const losses = matchingPicks.filter((p) => p.status === 'lost').length
    const pushes = matchingPicks.filter((p) => p.status === 'push').length
    const netUnits = matchingPicks.reduce((acc, p) => acc + (Number(p.units_net) || 0), 0)

    const prior = Number(row.prior_weight) || 1.0
    const current = Number(row.calibrated_weight) || prior

    const { newWeight, roiPct, isAdjusted } = calculateBayesianShrunkWeight({
      currentWeight: current,
      priorWeight: prior,
      sampleSize,
      netUnits,
    })

    // Update in database
    const { error: updErr } = await admin
      .from('lounge_bot_persona_weights')
      .update({
        calibrated_weight: newWeight,
        sample_size: sampleSize,
        wins,
        losses,
        pushes,
        net_units: Math.round(netUnits * 100) / 100,
        roi_pct: roiPct,
        last_calibrated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    if (!updErr) {
      if (isAdjusted || sampleSize > 0) updatedCount++
      summary.push({
        picker,
        factor,
        oldWeight: current,
        newWeight,
        n: sampleSize,
        roi: roiPct,
      })
    }
  }

  return {
    success: true,
    updatedCount,
    summary,
  }
}
