package com.edgetilt.app

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.Base64
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * On-disk cache for native pick/export assets.
 * Preview URL is same-origin HTTPS (`/__edge_native_video__/<id>`) so Android WebView
 * media can load it via `shouldInterceptRequest` (custom `edge-video://` is unreliable).
 */
object EdgeVideoStore {
  /** Path prefix on [BuildConfig.BASE_URL] for trim-player intercept. */
  const val PREVIEW_PATH_PREFIX = "/__edge_native_video__/"
  data class Asset(
    val id: String,
    val file: File,
    val byteSize: Long,
    val originalFilename: String = "",
  )

  private val assets = ConcurrentHashMap<String, Asset>()

  fun root(ctx: Context): File = File(ctx.cacheDir, "edge-video").also { it.mkdirs() }

  fun fileURL(ctx: Context, id: String): File? {
    val key = id.trim()
    if (key.isEmpty()) return null
    assets[key]?.file?.takeIf { it.isFile }?.let { return it }
    val recovered = File(root(ctx), "$key.mp4")
    if (!recovered.isFile) return null
    val size = recovered.length()
    assets[key] = Asset(key, recovered, size)
    return recovered
  }

  fun asset(id: String): Asset? = assets[id.trim()]

  fun insertCopy(ctx: Context, source: Uri, maxSourceBytes: Long): Asset {
    val id = UUID.randomUUID().toString().lowercase().replace("-", "")
    val dest = File(root(ctx), "$id.mp4")
    ctx.contentResolver.openInputStream(source)?.use { input ->
      FileOutputStream(dest).use { output ->
        val buf = ByteArray(1024 * 256)
        var total = 0L
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          total += n
          if (maxSourceBytes > 0 && total > maxSourceBytes) {
            dest.delete()
            throw IllegalArgumentException("Video is too large.")
          }
          output.write(buf, 0, n)
        }
      }
    } ?: throw IllegalArgumentException("Could not read that video.")
    val name = source.lastPathSegment ?: ""
    val asset = Asset(id, dest, dest.length(), name)
    assets[id] = asset
    return asset
  }

  fun adoptExported(ctx: Context, exported: File, byteSize: Long): Asset {
    val id = UUID.randomUUID().toString().lowercase().replace("-", "")
    val dest = File(root(ctx), "$id.mp4")
    if (exported.absolutePath != dest.absolutePath) {
      exported.copyTo(dest, overwrite = true)
      exported.delete()
    }
    val asset = Asset(id, dest, if (byteSize > 0) byteSize else dest.length())
    assets[id] = asset
    return asset
  }

  fun probe(ctx: Context, file: File): Probe {
    val r = MediaMetadataRetriever()
    return try {
      r.setDataSource(file.absolutePath)
      val durationMs = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
      val w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      val h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      val rotation = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      val displayW = if (rotation == 90 || rotation == 270) h else w
      val displayH = if (rotation == 90 || rotation == 270) w else h
      val frame = try {
        r.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
      } catch (_: Exception) {
        null
      }
      val poster = frame?.let { bitmapToJpegBase64(it, 0.72f) } ?: ""
      frame?.recycle()
      Probe(durationMs / 1000.0, displayW, displayH, poster)
    } catch (e: Exception) {
      Log.w(TAG, "probe failed", e)
      Probe(0.0, 0, 0, "")
    } finally {
      try {
        r.release()
      } catch (_: Exception) {
      }
    }
  }

  fun sweepStale(ctx: Context, maxAgeMs: Long = 48L * 60 * 60 * 1000) {
    val now = System.currentTimeMillis()
    root(ctx).listFiles()?.forEach { f ->
      if (f.isFile && now - f.lastModified() > maxAgeMs) {
        val id = f.nameWithoutExtension
        assets.remove(id)
        f.delete()
      }
    }
  }

  fun previewUrl(id: String): String {
    val base = BuildConfig.BASE_URL.trimEnd('/')
    return "$base$PREVIEW_PATH_PREFIX${id.trim()}"
  }

  /** Asset id from `edge-video://local/<id>` or `https://…/__edge_native_video__/<id>`. */
  fun assetIdFromPreviewUri(uri: android.net.Uri): String? {
    val scheme = uri.scheme?.lowercase() ?: return null
    if (scheme == "edge-video") {
      if ((uri.host ?: "") != "local") return null
      return uri.path?.trim('/')?.takeIf { it.isNotEmpty() }
    }
    if (scheme == "https" || scheme == "http") {
      val path = uri.path ?: return null
      if (!path.startsWith(PREVIEW_PATH_PREFIX)) return null
      return path.removePrefix(PREVIEW_PATH_PREFIX).trim('/').takeIf { it.isNotEmpty() }
    }
    return null
  }

  data class Probe(val durationSec: Double, val width: Int, val height: Int, val posterJpegBase64: String)

  private fun bitmapToJpegBase64(bmp: Bitmap, quality: Float): String {
    val maxSide = 720
    val scaled = if (maxOf(bmp.width, bmp.height) > maxSide) {
      val scale = maxSide.toFloat() / maxOf(bmp.width, bmp.height)
      Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt().coerceAtLeast(1), (bmp.height * scale).toInt().coerceAtLeast(1), true)
    } else {
      bmp
    }
    val stream = java.io.ByteArrayOutputStream()
    scaled.compress(Bitmap.CompressFormat.JPEG, (quality * 100).toInt().coerceIn(40, 92), stream)
    if (scaled !== bmp) scaled.recycle()
    return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
  }

  private const val TAG = "EdgeVideoStore"
}
