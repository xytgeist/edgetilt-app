package com.edgetilt.app

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import android.util.Log
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.max

/**
 * ML Kit Document Scanner (Play services UI). IPA twin: `EdgeNative.scanDocument`.
 * Completes via window event [RESULT_EVENT] with the same `requestId`.
 */
class EdgeDocumentScanner(
  private val activity: Activity,
  private val deliver: (event: String, detail: JSONObject) -> Unit,
) {
  private val pendingRequestId = AtomicReference<String?>(null)

  fun scan(json: String): String {
    val o = try {
      JSONObject(json.ifBlank { "{}" })
    } catch (_: Exception) {
      JSONObject()
    }
    val requestId = o.optString("requestId").trim().ifEmpty {
      UUID.randomUUID().toString().lowercase().replace("-", "")
    }
    val maxPages = o.optInt("maxPages", 1).coerceIn(1, 8)
    if (pendingRequestId.get() != null) {
      return JSONObject()
        .put("ok", false)
        .put("error", "A scan is already in progress.")
        .put("requestId", requestId)
        .toString()
    }
    pendingRequestId.set(requestId)
    val options = GmsDocumentScannerOptions.Builder()
      .setGalleryImportAllowed(true)
      .setPageLimit(maxPages)
      .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
      .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
      .build()
    val scanner = GmsDocumentScanning.getClient(options)
    activity.runOnUiThread {
      scanner.getStartScanIntent(activity)
        .addOnSuccessListener { sender ->
          try {
            activity.startIntentSenderForResult(sender, REQ_SCAN, null, 0, 0, 0)
          } catch (e: Exception) {
            Log.w(TAG, "scan launch failed", e)
            complete(
              requestId,
              JSONObject().put("ok", false).put("error", "Could not open the document scanner."),
            )
          }
        }
        .addOnFailureListener { e ->
          Log.w(TAG, "getStartScanIntent failed", e)
          val msg = e.message ?: ""
          val unsupported =
            msg.contains("not available", ignoreCase = true) ||
              msg.contains("unsupported", ignoreCase = true) ||
              msg.contains("MODULE_NOT_AVAILABLE", ignoreCase = true)
          complete(
            requestId,
            JSONObject()
              .put("ok", false)
              .put("unsupported", unsupported)
              .put("error", if (unsupported) {
                "Document scanner is not available on this device."
              } else {
                msg.ifBlank { "Could not open the document scanner." }
              }),
          )
        }
    }
    return JSONObject().put("ok", true).put("started", true).put("requestId", requestId).toString()
  }

  fun onScanResult(resultCode: Int, data: Intent?) {
    val requestId = pendingRequestId.getAndSet(null) ?: return
    if (resultCode != Activity.RESULT_OK || data == null) {
      complete(requestId, JSONObject().put("ok", false).put("cancelled", true))
      return
    }
    val result = try {
      GmsDocumentScanningResult.fromActivityResultIntent(data)
    } catch (e: Exception) {
      Log.w(TAG, "parse scan result failed", e)
      null
    }
    val pages = result?.pages
    if (pages.isNullOrEmpty()) {
      complete(requestId, JSONObject().put("ok", false).put("error", "Could not read the scanned page."))
      return
    }
    val images = JSONArray()
    for (page in pages) {
      val uri = page.imageUri ?: continue
      val encoded = encodeJpegFromUri(uri) ?: continue
      images.put(encoded)
    }
    if (images.length() == 0) {
      complete(requestId, JSONObject().put("ok", false).put("error", "Could not read the scanned page."))
      return
    }
    complete(requestId, JSONObject().put("ok", true).put("images", images))
  }

  private fun encodeJpegFromUri(uri: android.net.Uri): JSONObject? {
    return try {
      activity.contentResolver.openInputStream(uri)?.use { input ->
        val raw = BitmapFactory.decodeStream(input) ?: return null
        val bmp = downscale(raw, MAX_EDGE)
        if (bmp !== raw) raw.recycle()
        val w = bmp.width
        val h = bmp.height
        val stream = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 85, stream)
        val bytes = stream.toByteArray()
        bmp.recycle()
        JSONObject()
          .put("mimeType", "image/jpeg")
          .put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
          .put("width", w)
          .put("height", h)
      }
    } catch (e: Exception) {
      Log.w(TAG, "encode page failed", e)
      null
    }
  }

  private fun downscale(src: Bitmap, maxEdge: Int): Bitmap {
    val longest = max(src.width, src.height)
    if (longest <= maxEdge || longest <= 0) return src
    val scale = maxEdge.toFloat() / longest
    val w = (src.width * scale).toInt().coerceAtLeast(1)
    val h = (src.height * scale).toInt().coerceAtLeast(1)
    return Bitmap.createScaledBitmap(src, w, h, true)
  }

  private fun complete(requestId: String, detail: JSONObject) {
    pendingRequestId.compareAndSet(requestId, null)
    detail.put("requestId", requestId)
    deliver(RESULT_EVENT, detail)
  }

  companion object {
    const val REQ_SCAN = 47
    const val RESULT_EVENT = "edge-android-scan-result"
    private const val MAX_EDGE = 2000
    private const val TAG = "EdgeDocumentScanner"
  }
}
