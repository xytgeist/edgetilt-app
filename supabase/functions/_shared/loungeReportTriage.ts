/** Silent Lounge report classifier. Not a public bot persona.
 * New reports insert needs_human=false. This module is what elevates. */

export const LOUNGE_REPORT_NEVER_AUTO_REASONS = new Set([
  'sexual',
  'illegal',
  'impersonation',
  'other',
  'harassment',
  'hate',
])

export const LOUNGE_REPORT_AUTO_DISMISS_MIN_CONFIDENCE = 0.85

export type LoungeReportTriageDecision = {
  triage_status: 'auto_dismissed' | 'needs_human' | 'skipped'
  triage_action: 'dismiss' | 'escalate' | 'skip'
  needs_human: boolean
  report_status?: 'dismissed'
  staff_note?: string
  reasons: string
  confidence?: number | null
}

type ModelGuess = {
  category?: string
  action?: string
  confidence?: number
  reasons?: string
}

export function decideLoungeReportTriage(
  reason: string,
  guess: ModelGuess | null,
): LoungeReportTriageDecision {
  const reported = String(reason || '').trim()
  if (LOUNGE_REPORT_NEVER_AUTO_REASONS.has(reported) || !guess) {
    return {
      triage_status: guess ? 'needs_human' : 'skipped',
      triage_action: 'escalate',
      needs_human: true,
      reasons: guess?.reasons || 'Legal or safety reason stays with a human.',
    }
  }

  const category = String(guess.category || '').trim().toLowerCase()
  const action = String(guess.action || '').trim().toLowerCase()
  const confidence = Number(guess.confidence)
  const confOk = Number.isFinite(confidence) && confidence >= LOUNGE_REPORT_AUTO_DISMISS_MIN_CONFIDENCE
  const reasons = String(guess.reasons || '').trim() || 'Classifier review.'

  if (reported === 'spam' && category === 'spam' && action === 'dismiss' && confOk) {
    return {
      triage_status: 'auto_dismissed',
      triage_action: 'dismiss',
      needs_human: false,
      report_status: 'dismissed',
      staff_note: `auto: ${reasons}`.slice(0, 1000),
      reasons,
      confidence,
    }
  }

  return {
    triage_status: 'needs_human',
    triage_action: 'escalate',
    needs_human: true,
    reasons,
    confidence: Number.isFinite(confidence) ? confidence : null,
  }
}
