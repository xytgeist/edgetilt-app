import { LOUNGE_CF_R2_OBJECT_CACHE_CONTROL, requestCfR2DirectUpload, uploadFileToCfR2PresignedUrl } from './loungeCfImageMedia.js'
import { uploadEdgeVideoPut } from './edgeNative.js'

/**
 * Mint a presigned PUT URL for a chat video MP4 from the lounge-chat-r2-video-upload Edge Function.
 */
async function requestChatVideoR2Upload(supabaseClient, byteSize) {
  const { data, error } = await supabaseClient.functions.invoke('lounge-chat-r2-video-upload', {
    body: { contentType: 'video/mp4', byteSize },
  })
  if (error || !data?.uploadURL || !data?.publicUrl) {
    let msg = (data && typeof data.error === 'string' && data.error) || error?.message || 'Failed to mint video upload URL.'
    const ctx = error && typeof error === 'object' ? error.context : null
    if (ctx && typeof ctx.clone === 'function') {
      try {
        const body = await ctx.clone().json()
        if (body && typeof body.error === 'string' && body.error.trim()) msg = body.error.trim()
      } catch {
        // non-JSON body
      }
    }
    throw new Error(msg)
  }
  return { uploadURL: String(data.uploadURL), publicUrl: String(data.publicUrl) }
}

/**
 * Upload an already-encoded MP4 file to Cloudflare R2 for chat.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {File} videoFile  compressed MP4 produced by encodeVideoForChat()
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<string>}  public URL of the stored video
 */
/**
 * PUT an on-device encoded MP4. The bytes stay in the IPA cache, not JS memory.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} assetId
 * @returns {Promise<string>}
 */
export async function uploadNativeChatVideoToR2(supabaseClient, assetId, byteSize) {
  const { uploadURL, publicUrl } = await requestChatVideoR2Upload(supabaseClient, byteSize)
  const result = await uploadEdgeVideoPut({
    assetId,
    uploadURL,
    contentType: 'video/mp4',
    cacheControl: LOUNGE_CF_R2_OBJECT_CACHE_CONTROL,
  })
  if (!result?.ok) {
    throw new Error(result?.error || 'Could not upload your video.')
  }
  return publicUrl
}

export async function uploadChatVideoToR2(supabaseClient, videoFile, opts = {}) {
  const { uploadURL, publicUrl } = await requestChatVideoR2Upload(supabaseClient, videoFile?.size || 0)
  await uploadFileToCfR2PresignedUrl(uploadURL, videoFile, { signal: opts.signal })
  return publicUrl
}

/**
 * Upload a poster frame blob URL to Cloudflare R2.
 * Re-uses the existing lounge-cf-r2-direct-upload Edge Function (accepts image/*).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} posterBlobUrl  object-URL pointing at an in-memory JPEG
 * @returns {Promise<string | null>}  public URL, or null when R2 is not configured
 */
export async function uploadChatPosterToR2(supabaseClient, posterBlobUrl) {
  const blob = await fetch(posterBlobUrl).then((r) => r.blob())
  const file = new File([blob], 'poster.jpg', { type: 'image/jpeg' })
  const mint = await requestCfR2DirectUpload(supabaseClient, { contentType: 'image/jpeg' })
  if (!mint.configured || !mint.data) return null
  await uploadFileToCfR2PresignedUrl(mint.data.uploadURL, file)
  return mint.data.publicUrl
}
