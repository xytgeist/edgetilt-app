import { compressImageFileUnderMaxBytes } from '../../utils/compressImageForUpload.js'
import { uploadLoungeFeedPostImageToCfR2 } from '../../utils/loungeCfImageMedia.js'

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} userId
 * @param {File} file
 */
export async function uploadSmokeChecklistScreenshot(supabaseClient, userId, file) {
  const { file: prepared, error: compressErr } = await compressImageFileUnderMaxBytes(
    file,
    MAX_SCREENSHOT_BYTES,
  )
  if (compressErr || !prepared) {
    throw compressErr || new Error('Could not prepare screenshot.')
  }

  const { data, error, configured } = await uploadLoungeFeedPostImageToCfR2(
    supabaseClient,
    { id: userId },
    prepared,
  )
  if (!configured) {
    throw new Error('Screenshot upload is not configured on this environment (R2).')
  }
  if (error) throw error
  if (!data) throw new Error('Screenshot upload failed.')
  return String(data)
}
