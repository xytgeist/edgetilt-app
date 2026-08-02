import {
  POKER_STABLE_SMOKE_CHECKLIST_KEY,
  POKER_STABLE_SMOKE_CHECKLIST_VERSION,
} from './pokerStableSmokeChecklistItems.js'

export { POKER_STABLE_SMOKE_CHECKLIST_KEY, POKER_STABLE_SMOKE_CHECKLIST_VERSION }

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase @param {string} checklistKey */
export async function loadSmokeChecklistSubmission(supabase, checklistKey) {
  const { data, error } = await supabase.rpc('admin_smoke_checklist_get_latest', {
    p_checklist_key: checklistKey,
  })
  return { submission: data || null, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 */
export async function saveSmokeChecklistSubmission(supabase, args) {
  const {
    checklistKey = POKER_STABLE_SMOKE_CHECKLIST_KEY,
    checklistVersion = POKER_STABLE_SMOKE_CHECKLIST_VERSION,
    responses,
    status = 'draft',
    runLabel = '',
  } = args

  const { data, error } = await supabase.rpc('admin_smoke_checklist_save', {
    p_checklist_key: checklistKey,
    p_checklist_version: checklistVersion,
    p_responses: responses,
    p_status: status,
    p_run_label: runLabel?.trim() || null,
  })

  return { submissionId: data, error }
}
