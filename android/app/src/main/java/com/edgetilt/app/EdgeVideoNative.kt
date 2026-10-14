package com.edgetilt.app

import android.app.Activity
import android.content.Intent
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.Crop
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.FilterInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Lounge / Chat native video: pick → Media3 trim/crop → tus or PUT.
 * Completes via `edge-android-video-result`; progress via `edge-native-video-progress`.
 * Contract: `android/README.md` + IPA twin in `docs/ios-native-bridge.md`.
 */
class EdgeVideoNative(
  private val activity: Activity,
  private val deliver: (event: String, detail: JSONObject) -> Unit,
) {
  private val main = Handler(Looper.getMainLooper())
  private val io: ExecutorService = Executors.newCachedThreadPool()
  private val cancelled = AtomicBoolean(false)
  private val cancelAssetId = AtomicReference<String?>(null)
  private val activeTransformer = AtomicReference<Transformer?>(null)
  private val activeUpload = AtomicReference<HttpURLConnection?>(null)
  private val activeJob = AtomicReference<Future<*>?>(null)
  private var pendingPickRequestId: String? = null
  private var pendingMaxSourceBytes: Long = Limits.legacySourceBytes

  fun pick(json: String): String {
    val o = parse(json)
    val requestId = o.optString("requestId").trim().ifEmpty { newRequestId() }
    pendingPickRequestId = requestId
    pendingMaxSourceBytes = Limits.resolvedSourceBytes(o)
    cancelled.set(false)
    cancelAssetId.set(null)
    EdgeVideoStore.sweepStale(activity)
    main.post {
      try {
        val intent = if (Build.VERSION.SDK_INT >= 33) {
          Intent(MediaStore.ACTION_PICK_IMAGES).apply { type = "video/*" }
        } else {
          Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "video/*"
            addCategory(Intent.CATEGORY_OPENABLE)
          }
        }
        activity.startActivityForResult(intent, REQ_PICK)
      } catch (e: Exception) {
        Log.w(TAG, "pick launch failed", e)
        complete(requestId, JSONObject().put("ok", false).put("error", "Could not open the video picker."))
        pendingPickRequestId = null
      }
    }
    return JSONObject().put("ok", true).put("started", true).put("requestId", requestId).toString()
  }

  fun onPickResult(resultCode: Int, data: Intent?) {
    val requestId = pendingPickRequestId ?: return
    pendingPickRequestId = null
    if (resultCode != Activity.RESULT_OK || data?.data == null) {
      complete(requestId, JSONObject().put("ok", false).put("cancelled", true))
      return
    }
    val uri = data.data!!
    val maxBytes = pendingMaxSourceBytes
    activeJob.set(io.submit {
      try {
        if (isCancelled(null)) {
          complete(requestId, JSONObject().put("ok", false).put("cancelled", true))
          return@submit
        }
        val asset = EdgeVideoStore.insertCopy(activity, uri, maxBytes)
        val probe = EdgeVideoStore.probe(activity, asset.file)
        complete(
          requestId,
          JSONObject()
            .put("ok", true)
            .put("assetId", asset.id)
            .put("previewUrl", EdgeVideoStore.previewUrl(asset.id))
            .put("byteSize", asset.byteSize)
            .put("duration", probe.durationSec)
            .put("width", probe.width)
            .put("height", probe.height)
            .put("posterJpegBase64", probe.posterJpegBase64),
        )
      } catch (e: Exception) {
        Log.w(TAG, "pick copy failed", e)
        val msg = e.message?.takeIf { it.isNotBlank() } ?: "Could not open that video."
        complete(requestId, JSONObject().put("ok", false).put("error", msg))
      }
    })
  }

  fun export(json: String): String {
    val o = parse(json)
    val requestId = o.optString("requestId").trim().ifEmpty { newRequestId() }
    val assetId = o.optString("assetId").trim()
    cancelled.set(false)
    cancelAssetId.set(null)
    activeJob.set(io.submit {
      try {
        val result = runExport(o, assetId)
        complete(requestId, result)
      } catch (e: Cancelled) {
        complete(requestId, JSONObject().put("ok", false).put("cancelled", true))
      } catch (e: Exception) {
        Log.w(TAG, "export failed", e)
        complete(requestId, JSONObject().put("ok", false).put("error", e.message ?: "Could not prepare that video."))
      } finally {
        stopFg()
        activeTransformer.set(null)
      }
    })
    return JSONObject().put("ok", true).put("started", true).put("requestId", requestId).toString()
  }

  fun uploadTus(json: String): String {
    val o = parse(json)
    val requestId = o.optString("requestId").trim().ifEmpty { newRequestId() }
    val assetId = o.optString("assetId").trim()
    cancelled.set(false)
    cancelAssetId.set(null)
    activeJob.set(io.submit {
      try {
        startFg("Uploading video", "Working…")
        val result = runTus(o, assetId)
        complete(requestId, result)
      } catch (e: Cancelled) {
        complete(requestId, JSONObject().put("ok", false).put("cancelled", true))
      } catch (e: Exception) {
        Log.w(TAG, "tus failed", e)
        complete(requestId, JSONObject().put("ok", false).put("error", e.message ?: "Video upload failed. Try again."))
      } finally {
        stopFg()
        activeUpload.set(null)
      }
    })
    return JSONObject().put("ok", true).put("started", true).put("requestId", requestId).toString()
  }

  fun uploadPut(json: String): String {
    val o = parse(json)
    val requestId = o.optString("requestId").trim().ifEmpty { newRequestId() }
    val assetId = o.optString("assetId").trim()
    cancelled.set(false)
    cancelAssetId.set(null)
    activeJob.set(io.submit {
      try {
        startFg("Uploading video", "Working…")
        val result = runPut(o, assetId)
        complete(requestId, result)
      } catch (e: Cancelled) {
        complete(requestId, JSONObject().put("ok", false).put("cancelled", true))
      } catch (e: Exception) {
        Log.w(TAG, "put failed", e)
        complete(requestId, JSONObject().put("ok", false).put("error", e.message ?: "Video upload failed. Try again."))
      } finally {
        stopFg()
        activeUpload.set(null)
      }
    })
    return JSONObject().put("ok", true).put("started", true).put("requestId", requestId).toString()
  }

  fun cancel(json: String): String {
    val o = parse(json)
    val id = o.optString("assetId").trim()
    cancelAssetId.set(id.ifEmpty { null })
    cancelled.set(true)
    if (pendingPickRequestId != null) {
      val rid = pendingPickRequestId
      pendingPickRequestId = null
      if (rid != null) complete(rid, JSONObject().put("ok", false).put("cancelled", true))
    }
    // Transformer must be cancelled on the main thread (same as create/start).
    main.post {
      try {
        activeTransformer.get()?.cancel()
      } catch (_: Exception) {
      }
    }
    try {
      activeUpload.get()?.disconnect()
    } catch (_: Exception) {
    }
    activeJob.get()?.cancel(true)
    stopFg()
    return JSONObject().put("ok", true).toString()
  }

  /**
   * Serve native trim-player bytes.
   * Prefer same-origin HTTPS `/__edge_native_video__/<id>` (HTML5 media works).
   * Also keeps `edge-video://local/<id>` for older payloads.
   *
   * Android WebView re-applies `Range` by skipping into the intercepted stream even when
   * we already returned a 206 slice (Chromium / wry#1864). Pad 206 bodies so that skip
   * lands on the real first byte.
   */
  fun intercept(request: WebResourceRequest): WebResourceResponse? {
    val url = request.url ?: return null
    val id = EdgeVideoStore.assetIdFromPreviewUri(url) ?: return null
    val accept = (request.requestHeaders["Accept"] ?: request.requestHeaders["accept"] ?: "").lowercase()
    if (accept.contains("image/") && !accept.contains("video/")) {
      return WebResourceResponse("text/plain", "utf-8", null)
    }
    val file = EdgeVideoStore.fileURL(activity, id) ?: return WebResourceResponse("text/plain", "utf-8", null)
    val totalLong = file.length()
    if (totalLong <= 0L) return WebResourceResponse("text/plain", "utf-8", null)
    val mime = when (file.extension.lowercase()) {
      "mp4", "m4v" -> "video/mp4"
      "mov" -> "video/quicktime"
      else -> "application/octet-stream"
    }
    val range = request.requestHeaders["Range"] ?: request.requestHeaders["range"]
    var start = 0L
    var end = totalLong - 1
    var status = 200
    if (!range.isNullOrBlank()) {
      val parsed = parseRange(range, totalLong)
      if (parsed == null) {
        val headers = mapOf("Content-Range" to "bytes */$totalLong")
        return WebResourceResponse("text/plain", "utf-8", 416, "Range Not Satisfiable", headers, null)
      }
      start = parsed.first
      end = parsed.second
      status = 206
    }
    val length = (end - start + 1).coerceAtLeast(0)
    val raw = FileInputStream(file).also { it.skip(start) }
    val bounded = BoundedInputStream(raw, length)
    // WebView will skip `start` bytes again on our already-sliced 206 body.
    val body: java.io.InputStream =
      if (status == 206 && start > 0) RangeDoubleSkipPadStream(bounded, start) else bounded
    val headers = mutableMapOf(
      "Content-Type" to mime,
      "Accept-Ranges" to "bytes",
      "Content-Length" to length.toString(),
      "Access-Control-Allow-Origin" to "*",
      "Cache-Control" to "no-store",
    )
    if (status == 206) headers["Content-Range"] = "bytes $start-$end/$totalLong"
    val reason = if (status == 206) "Partial Content" else "OK"
    return WebResourceResponse(mime, null, status, reason, headers, body)
  }

  // MARK: - Export

  private fun runExport(o: JSONObject, assetId: String): JSONObject {
    val source = EdgeVideoStore.asset(assetId) ?: EdgeVideoStore.fileURL(activity, assetId)?.let {
      EdgeVideoStore.Asset(assetId, it, it.length())
    } ?: throw IllegalArgumentException("Could not open that video.")
    checkCancelled(assetId)
    startFg("Preparing video", "Working…")
    postProgress("checking", 0.05, assetId)

    val probe = EdgeVideoStore.probe(activity, source.file)
    val full = probe.durationSec
    val startSec = min(max(0.0, o.optDouble("startSec", 0.0)), max(0.0, full))
    var endSec = o.optDouble("endSec", full)
    if (!endSec.isFinite() || endSec <= startSec) endSec = full
    endSec = min(endSec, full)
    val maxClip = Limits.resolvedClipSeconds(o)
    val maxUpload = Limits.resolvedUploadBytes(o)
    if (endSec - startSec > maxClip) {
      throw IllegalArgumentException("Video must be ${Limits.durationLabel(maxClip)} or shorter.")
    }
    val crop = cropRect(
      o.optJSONObject("cropPx"),
      probe.width,
      probe.height,
      o.optDouble("intrinsicWidth", probe.width.toDouble()),
      o.optDouble("intrinsicHeight", probe.height.toDouble()),
    )
    if (canPassthrough(source, full, startSec, endSec, crop, probe.width, probe.height, maxUpload)) {
      return JSONObject()
        .put("ok", true)
        .put("passthrough", true)
        .put("assetId", assetId)
        .put("sourceAssetId", assetId)
        .put("byteSize", source.byteSize)
        .put("previewUrl", EdgeVideoStore.previewUrl(assetId))
    }

    checkCancelled(assetId)
    val outFile = File(activity.cacheDir, "edge-export-${UUID.randomUUID().toString().lowercase()}.mp4")
    if (outFile.exists()) outFile.delete()

    val clipping = MediaItem.ClippingConfiguration.Builder()
      .setStartPositionMs((startSec * 1000).toLong().coerceAtLeast(0))
      .setEndPositionMs((endSec * 1000).toLong().coerceAtLeast(1))
      .build()
    val mediaItem = MediaItem.Builder()
      .setUri(Uri.fromFile(source.file))
      .setClippingConfiguration(clipping)
      .build()

    val videoEffects = mutableListOf<androidx.media3.common.Effect>()
    if (crop != null) {
      val left = ((2.0 * crop.x / crop.displayW) - 1.0).toFloat()
      val right = ((2.0 * (crop.x + crop.w) / crop.displayW) - 1.0).toFloat()
      val top = (1.0 - (2.0 * crop.y / crop.displayH)).toFloat()
      val bottom = (1.0 - (2.0 * (crop.y + crop.h) / crop.displayH)).toFloat()
      videoEffects.add(Crop(left, right, bottom, top))
    }
    val shortSide = min(probe.width, probe.height)
    if (shortSide > 1080) {
      videoEffects.add(Presentation.createForShortSide(1080))
    }

    val edited = EditedMediaItem.Builder(mediaItem)
      .setEffects(Effects(emptyList(), videoEffects))
      .build()
    val composition = Composition.Builder(EditedMediaItemSequence.Builder(edited).build())
      .setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
      .build()

    val done = AtomicBoolean(false)
    val errorRef = AtomicReference<Exception?>(null)
    val latch = java.util.concurrent.CountDownLatch(1)

    // Media3 Transformer must be created, started, polled, and cancelled on one Looper
    // (main). Access from the upload IO thread throws "Transformer is accessed on the wrong thread."
    runOnMain {
      checkCancelled(assetId)
      val transformer = Transformer.Builder(activity)
        .setVideoMimeType(MimeTypes.VIDEO_H264)
        .setAudioMimeType(MimeTypes.AUDIO_AAC)
        .addListener(object : Transformer.Listener {
          override fun onCompleted(composition: Composition, result: ExportResult) {
            done.set(true)
            latch.countDown()
          }

          override fun onError(composition: Composition, result: ExportResult, exception: ExportException) {
            errorRef.set(exception)
            latch.countDown()
          }
        })
        .build()
      activeTransformer.set(transformer)
      transformer.start(composition, outFile.absolutePath)
    }

    val holder = ProgressHolder()
    while (!latch.await(200, java.util.concurrent.TimeUnit.MILLISECONDS)) {
      checkCancelled(assetId)
      var pct = -1
      runOnMain {
        val t = activeTransformer.get() ?: return@runOnMain
        if (t.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
          pct = holder.progress
        }
      }
      if (pct in 0..100) {
        postProgress("encoding", pct / 100.0, assetId)
        EdgeVideoFgService.progress(activity, "Preparing video", "$pct%", pct)
      }
    }
    runOnMain { activeTransformer.set(null) }
    checkCancelled(assetId)
    errorRef.get()?.let {
      outFile.delete()
      throw IllegalArgumentException(it.message ?: "Could not prepare that video.")
    }
    if (!done.get() || !outFile.isFile || outFile.length() <= 0) {
      outFile.delete()
      throw IllegalArgumentException("Could not prepare that video.")
    }
    val size = outFile.length()
    if (size > maxUpload) {
      outFile.delete()
      throw IllegalArgumentException("That video is too large to import. Pick a shorter clip.")
    }
    val stored = EdgeVideoStore.adoptExported(activity, outFile, size)
    postProgress("encoding", 1.0, assetId)
    return JSONObject()
      .put("ok", true)
      .put("assetId", stored.id)
      .put("sourceAssetId", assetId)
      .put("byteSize", size)
      .put("previewUrl", EdgeVideoStore.previewUrl(stored.id))
  }

  private fun canPassthrough(
    source: EdgeVideoStore.Asset,
    full: Double,
    startSec: Double,
    endSec: Double,
    crop: CropPx?,
    width: Int,
    height: Int,
    maxUploadBytes: Long,
  ): Boolean {
    if (crop != null) return false
    if (startSec > 0.25) return false
    if (full.isFinite() && full - endSec > 0.35) return false
    if (source.byteSize > maxUploadBytes) return false
    val ext = source.file.extension.lowercase()
    if (ext == "mov") return false
    val name = source.originalFilename
    if (name.contains(Regex("screen\\s*record|rpreplay|simulator\\s*screen", RegexOption.IGNORE_CASE))) return false
    val key = "${width}x$height"
    if (key in SCREEN_RECORDING_SIZES) return false
    // Prefer H.264 mp4 for Stream; unknown containers re-encode.
    if (ext != "mp4" && ext != "m4v") return false
    return true
  }

  // MARK: - Upload

  private fun runTus(o: JSONObject, assetId: String): JSONObject {
    val stored = EdgeVideoStore.asset(assetId) ?: throw IllegalArgumentException("Could not open that video.")
    val token = o.optString("accessToken").trim()
    val supabaseURL = o.optString("supabaseUrl").trim().trimEnd('/')
    val anonKey = o.optString("anonKey").trim()
    if (token.isEmpty() || supabaseURL.isEmpty() || anonKey.isEmpty()) {
      throw IllegalArgumentException("You must be signed in to post a video.")
    }
    val maxUpload = Limits.resolvedUploadBytes(o)
    if (stored.byteSize > maxUpload) throw IllegalArgumentException("That video is too large to import. Pick a shorter clip.")
    checkCancelled(assetId)
    val created = createTus(stored.byteSize, token, supabaseURL, anonKey, Limits.resolvedStreamDuration(o))
    patchFile(stored.file, created.location, assetId, stored.byteSize)
    postProgress("upload", 1.0, assetId)
    return JSONObject().put("ok", true).put("streamVideoUid", created.uid).put("assetId", assetId)
  }

  private fun runPut(o: JSONObject, assetId: String): JSONObject {
    val stored = EdgeVideoStore.asset(assetId) ?: throw IllegalArgumentException("Could not open that video.")
    val uploadURL = o.optString("uploadURL").trim()
    if (uploadURL.isEmpty()) throw IllegalArgumentException("Could not start the upload.")
    checkCancelled(assetId)
    val contentType = o.optString("contentType").trim().ifEmpty { "video/mp4" }
    val cacheControl = o.optString("cacheControl").trim()
    val conn = (URL(uploadURL).openConnection() as HttpURLConnection).apply {
      requestMethod = "PUT"
      doOutput = true
      setRequestProperty("Content-Type", contentType)
      if (cacheControl.isNotEmpty()) setRequestProperty("Cache-Control", cacheControl)
      setFixedLengthStreamingMode(stored.byteSize)
      connectTimeout = 60_000
      readTimeout = 0
    }
    activeUpload.set(conn)
    try {
      FileInputStream(stored.file).use { input ->
        conn.outputStream.use { output ->
          val buf = ByteArray(256 * 1024)
          var sent = 0L
          while (true) {
            checkCancelled(assetId)
            val n = input.read(buf)
            if (n < 0) break
            output.write(buf, 0, n)
            sent += n
            val p = if (stored.byteSize > 0) sent.toDouble() / stored.byteSize else 0.0
            postProgress("upload", p, assetId)
            EdgeVideoFgService.progress(activity, "Uploading video", "${(p * 100).toInt()}%", (p * 100).toInt())
          }
        }
      }
      val code = conn.responseCode
      if (code !in 200..299) throw IllegalArgumentException("Video upload failed ($code).")
    } finally {
      try {
        conn.disconnect()
      } catch (_: Exception) {
      }
      activeUpload.compareAndSet(conn, null)
    }
    postProgress("upload", 1.0, assetId)
    return JSONObject().put("ok", true).put("assetId", assetId)
  }

  private data class TusCreate(val location: String, val uid: String)

  private fun createTus(
    fileSize: Long,
    token: String,
    supabaseURL: String,
    anonKey: String,
    streamMaxDurationSeconds: Int,
  ): TusCreate {
    val url = URL("$supabaseURL/functions/v1/lounge-cf-stream-tus-create")
    val conn = (url.openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      doOutput = true
      setRequestProperty("Authorization", "Bearer $token")
      setRequestProperty("apikey", anonKey)
      setRequestProperty("Tus-Resumable", "1.0.0")
      setRequestProperty("Upload-Length", fileSize.toString())
      setRequestProperty("Upload-Metadata", tusMetadata(streamMaxDurationSeconds))
      setRequestProperty("Content-Length", "0")
      connectTimeout = 60_000
      readTimeout = 60_000
    }
    try {
      conn.outputStream.close()
      val code = conn.responseCode
      val body = try {
        (if (code in 200..299) conn.inputStream else conn.errorStream)?.readBytes() ?: ByteArray(0)
      } catch (_: Exception) {
        ByteArray(0)
      }
      if (code == 401 || code == 403) throw IllegalArgumentException("You must be signed in to post a video.")
      if (code !in 200..299) throw IllegalArgumentException(messageFrom(body, code))
      val uid = (conn.getHeaderField("stream-media-id") ?: "").trim()
      if (!uid.matches(Regex("^[0-9a-fA-F]{32}$"))) {
        throw IllegalArgumentException("Video upload finished but the service did not return a video id.")
      }
      val locationHeader = conn.getHeaderField("Location")
        ?: throw IllegalArgumentException("Could not start the upload.")
      val location = URL(url, locationHeader).toString()
      return TusCreate(location, uid)
    } finally {
      conn.disconnect()
    }
  }

  private fun patchFile(file: File, location: String, assetId: String, byteSize: Long) {
    if (byteSize <= Limits.cfSingleRequestMaxBytes) {
      patchChunk(file, location, assetId, byteSize, offset = 0, length = byteSize, sentBefore = 0)
      return
    }
    var offset = 0L
    while (offset < byteSize) {
      checkCancelled(assetId)
      val length = Limits.nextChunkLength(offset, byteSize)
      val slice = sliceFile(file, offset, length)
      try {
        patchChunk(slice, location, assetId, byteSize, offset = offset, length = length, sentBefore = offset)
      } finally {
        slice.delete()
      }
      offset += length
    }
  }

  private fun patchChunk(
    file: File,
    location: String,
    assetId: String,
    totalBytes: Long,
    offset: Long,
    length: Long,
    sentBefore: Long,
  ) {
    val conn = (URL(location).openConnection() as HttpURLConnection).apply {
      requestMethod = "PATCH"
      doOutput = true
      setRequestProperty("Tus-Resumable", "1.0.0")
      setRequestProperty("Upload-Offset", offset.toString())
      setRequestProperty("Content-Type", "application/offset+octet-stream")
      setFixedLengthStreamingMode(length)
      connectTimeout = 60_000
      readTimeout = 0
    }
    activeUpload.set(conn)
    try {
      FileInputStream(file).use { input ->
        conn.outputStream.use { output ->
          val buf = ByteArray(256 * 1024)
          var sent = 0L
          while (sent < length) {
            checkCancelled(assetId)
            val n = input.read(buf, 0, min(buf.size.toLong(), length - sent).toInt())
            if (n < 0) break
            output.write(buf, 0, n)
            sent += n
            val overall = sentBefore + sent
            val p = if (totalBytes > 0) overall.toDouble() / totalBytes else 0.0
            postProgress("upload", p, assetId)
            EdgeVideoFgService.progress(activity, "Uploading video", "${(p * 100).toInt()}%", (p * 100).toInt())
          }
        }
      }
      val code = conn.responseCode
      if (code !in 200..299) throw IllegalArgumentException("Video upload failed ($code).")
    } finally {
      try {
        conn.disconnect()
      } catch (_: Exception) {
      }
      activeUpload.compareAndSet(conn, null)
    }
  }

  private fun sliceFile(file: File, offset: Long, length: Long): File {
    val dest = File(activity.cacheDir, "edge-tus-${UUID.randomUUID().toString().lowercase()}.part")
    FileInputStream(file).use { input ->
      input.skip(offset)
      FileOutputStream(dest).use { output ->
        val buf = ByteArray(1024 * 1024)
        var remaining = length
        while (remaining > 0) {
          val n = input.read(buf, 0, min(buf.size.toLong(), remaining).toInt())
          if (n < 0) break
          output.write(buf, 0, n)
          remaining -= n
        }
        if (remaining != 0L) {
          dest.delete()
          throw IllegalArgumentException("Could not read that video.")
        }
      }
    }
    return dest
  }

  // MARK: - Helpers

  private fun complete(requestId: String, detail: JSONObject) {
    detail.put("requestId", requestId)
    main.post { deliver(RESULT_EVENT, detail) }
  }

  private fun postProgress(phase: String, progress: Double, assetId: String) {
    val clamped = min(1.0, max(0.0, progress))
    val detail = JSONObject()
      .put("phase", phase)
      .put("progress", clamped)
      .put("assetId", assetId)
    main.post { deliver(PROGRESS_EVENT, detail) }
  }

  /** Run [block] on the main looper and wait (Transformer / UI-bound APIs). */
  private fun <T> runOnMain(block: () -> T): T {
    if (Looper.myLooper() == Looper.getMainLooper()) return block()
    val box = AtomicReference<Any?>()
    val err = AtomicReference<Exception?>()
    val done = java.util.concurrent.CountDownLatch(1)
    main.post {
      try {
        box.set(block())
      } catch (e: Exception) {
        err.set(e)
      } finally {
        done.countDown()
      }
    }
    done.await()
    err.get()?.let { throw it }
    @Suppress("UNCHECKED_CAST")
    return box.get() as T
  }

  private fun startFg(title: String, text: String) {
    try {
      EdgeVideoFgService.start(activity, title, text)
    } catch (e: Exception) {
      Log.w(TAG, "fg start failed", e)
    }
  }

  private fun stopFg() {
    try {
      EdgeVideoFgService.stop(activity)
    } catch (_: Exception) {
    }
  }

  private fun checkCancelled(assetId: String?) {
    if (isCancelled(assetId)) throw Cancelled()
  }

  private fun isCancelled(assetId: String?): Boolean {
    if (!cancelled.get()) return false
    val only = cancelAssetId.get()
    if (only.isNullOrEmpty()) return true
    return assetId != null && only == assetId
  }

  private fun parse(json: String): JSONObject = try {
    JSONObject(json.ifBlank { "{}" })
  } catch (_: Exception) {
    JSONObject()
  }

  private fun newRequestId(): String = UUID.randomUUID().toString().lowercase().replace("-", "")

  private data class CropPx(val x: Double, val y: Double, val w: Double, val h: Double, val displayW: Double, val displayH: Double)

  private fun cropRect(
    raw: JSONObject?,
    displayW: Int,
    displayH: Int,
    intrinsicWidth: Double,
    intrinsicHeight: Double,
  ): CropPx? {
    if (raw == null) return null
    val iw = if (intrinsicWidth > 1) intrinsicWidth else displayW.toDouble()
    val ih = if (intrinsicHeight > 1) intrinsicHeight else displayH.toDouble()
    if (iw <= 1 || ih <= 1 || displayW <= 1 || displayH <= 1) return null
    val scaleX = displayW / iw
    val scaleY = displayH / ih
    val x = raw.optDouble("x", 0.0) * scaleX
    val y = raw.optDouble("y", 0.0) * scaleY
    val w = raw.optDouble("w", 0.0) * scaleX
    val h = raw.optDouble("h", 0.0) * scaleY
    if (w <= 2 || h <= 2) return null
    val fittedX = max(0.0, x)
    val fittedY = max(0.0, y)
    val fittedW = min(w, displayW - fittedX)
    val fittedH = min(h, displayH - fittedY)
    if (fittedW < 2 || fittedH < 2) return null
    if (abs(fittedX) < 2 && abs(fittedY) < 2 && abs(fittedW - displayW) < 4 && abs(fittedH - displayH) < 4) {
      return null
    }
    return CropPx(fittedX, fittedY, even(fittedW), even(fittedH), displayW.toDouble(), displayH.toDouble())
  }

  private fun even(value: Double): Double {
    var n = floor(value)
    if (n < 2) n = 2.0
    if (n.toInt() % 2 != 0) n -= 1
    return n
  }

  private fun parseRange(header: String, total: Long): Pair<Long, Long>? {
    val raw = header.trim()
    if (!raw.lowercase().startsWith("bytes=")) return null
    val spec = raw.substring(6).split(",").firstOrNull() ?: return null
    val parts = spec.split("-", limit = 2)
    if (parts.size != 2) return null
    if (parts[0].isEmpty()) {
      val suffix = parts[1].toLongOrNull() ?: return null
      if (suffix <= 0) return null
      val len = min(suffix, total)
      return (total - len) to (total - 1)
    }
    val start = parts[0].toLongOrNull() ?: return null
    if (start < 0 || start >= total) return null
    val end = if (parts[1].isEmpty()) total - 1 else min(parts[1].toLongOrNull() ?: (total - 1), total - 1)
    if (end < start) return null
    return start to end
  }

  private fun tusMetadata(streamMaxDurationSeconds: Int): String {
    val stamp = java.time.Instant.now().plusSeconds(6 * 60 * 60).toString()
    val pairs = listOf(
      "name" to "video.mp4",
      "maxDurationSeconds" to streamMaxDurationSeconds.toString(),
      "expiry" to stamp,
    )
    return pairs.joinToString(",") { (k, v) ->
      val b64 = Base64.encodeToString(v.toByteArray(StandardCharsets.UTF_8), Base64.NO_WRAP)
      "$k $b64"
    }
  }

  private fun messageFrom(body: ByteArray, status: Int): String {
    try {
      val obj = JSONObject(String(body, StandardCharsets.UTF_8))
      val err = obj.optString("error").trim()
      if (err.isNotEmpty()) return err
    } catch (_: Exception) {
    }
    return "Video upload failed ($status)."
  }

  private class BoundedInputStream(inner: FileInputStream, private var remaining: Long) :
    FilterInputStream(inner) {
    override fun read(): Int {
      if (remaining <= 0) return -1
      val n = super.read()
      if (n >= 0) remaining--
      return n
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
      if (remaining <= 0) return -1
      val n = super.read(b, off, min(len.toLong(), remaining).toInt())
      if (n > 0) remaining -= n
      return n
    }

    override fun available(): Int = 0
  }

  /**
   * Chromium skips `rangeStart` bytes on intercepted responses even when the body is
   * already a 206 slice. Expose that many skippable pad bytes first.
   */
  private class RangeDoubleSkipPadStream(
    private val sliced: java.io.InputStream,
    rangeStart: Long,
  ) : java.io.InputStream() {
    private var padLeft = rangeStart.coerceAtLeast(0)

    override fun read(): Int {
      if (padLeft > 0) {
        padLeft--
        return 0
      }
      return sliced.read()
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
      if (len <= 0) return 0
      if (padLeft > 0) {
        val n = min(len.toLong(), padLeft).toInt()
        java.util.Arrays.fill(b, off, off + n, 0)
        padLeft -= n
        if (padLeft > 0 || n == len) return n
        val m = sliced.read(b, off + n, len - n)
        return if (m < 0) n else n + m
      }
      return sliced.read(b, off, len)
    }

    override fun skip(n: Long): Long {
      if (n <= 0) return 0
      if (padLeft > 0) {
        val fromPad = min(n, padLeft)
        padLeft -= fromPad
        if (fromPad == n) return fromPad
        return fromPad + sliced.skip(n - fromPad)
      }
      return sliced.skip(n)
    }

    override fun available(): Int = 0

    override fun close() {
      sliced.close()
    }
  }

  private class Cancelled : Exception("Cancelled.")

  private object Limits {
    const val legacySourceBytes: Long = 1_500_000_000L
    const val legacyUploadBytes: Long = 200L * 1024 * 1024
    const val legacyClipSeconds: Double = 60.35
    const val legacyStreamMaxDurationSeconds = 75
    const val absoluteMaxSourceBytes: Long = 8L * 1024 * 1024 * 1024
    const val absoluteMaxUploadBytes: Long = 8L * 1024 * 1024 * 1024
    const val absoluteMaxClipSeconds: Double = 1200.35
    const val absoluteStreamMaxDurationSeconds = 1215
    const val cfSingleRequestMaxBytes: Long = 200L * 1024 * 1024
    const val cfChunkBytes: Long = 100L * 1024 * 1024
    const val cfMinChunkBytes: Long = 5_242_880
    const val cfChunkUnit: Long = 262_144

    fun resolvedSourceBytes(o: JSONObject): Long =
      min(positiveLong(o, "maxSourceBytes") ?: legacySourceBytes, absoluteMaxSourceBytes)

    fun resolvedUploadBytes(o: JSONObject): Long =
      min(positiveLong(o, "maxUploadBytes") ?: legacyUploadBytes, absoluteMaxUploadBytes)

    fun resolvedClipSeconds(o: JSONObject): Double {
      val raw = o.optDouble("maxClipSeconds", Double.NaN)
      val parsed = if (raw.isFinite() && raw > 0) raw else null
      return min(parsed ?: legacyClipSeconds, absoluteMaxClipSeconds)
    }

    fun resolvedStreamDuration(o: JSONObject): Int {
      val raw = positiveLong(o, "streamMaxDurationSeconds") ?: legacyStreamMaxDurationSeconds.toLong()
      return min(raw, absoluteStreamMaxDurationSeconds.toLong()).toInt()
    }

    fun durationLabel(seconds: Double): String {
      val whole = floor(seconds).toInt()
      val minutes = whole / 60
      val remain = whole % 60
      if (whole in 1 until 120 && remain == 0) return "$whole seconds"
      if (remain == 0) return if (minutes == 1) "1 minute" else "$minutes minutes"
      return String.format("%d:%02d", minutes, remain)
    }

    fun nextChunkLength(offset: Long, total: Long): Long {
      val left = total - offset
      if (offset == 0L && left <= cfSingleRequestMaxBytes) return left
      if (left <= cfChunkBytes) return left
      var take = cfChunkBytes
      val after = left - take
      if (after > 0 && after < cfMinChunkBytes) {
        take = ((left - cfMinChunkBytes) / cfChunkUnit) * cfChunkUnit
        if (take < cfMinChunkBytes) take = cfMinChunkBytes
      }
      return min(take, left)
    }

    private fun positiveLong(o: JSONObject, key: String): Long? {
      if (!o.has(key) || o.isNull(key)) return null
      val n = o.optLong(key, -1)
      return if (n > 0) n else null
    }
  }

  companion object {
    const val RESULT_EVENT = "edge-android-video-result"
    const val PROGRESS_EVENT = "edge-native-video-progress"
    const val REQ_PICK = 46
    private const val TAG = "EdgeVideoNative"
    private val SCREEN_RECORDING_SIZES = setOf(
      "1170x2532", "2532x1170",
      "1179x2556", "2556x1179",
      "1284x2778", "2778x1284",
      "1290x2796", "2796x1290",
      "1320x2868", "2868x1320",
      "1080x2340", "2340x1080",
      "1125x2436", "2436x1125",
      "1242x2688", "2688x1242",
    )
  }
}
