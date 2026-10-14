package com.edgetilt.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs
import kotlin.math.max

/**
 * On-device ML Kit Latin OCR. IPA twin: `EdgeNative.recognizeText`.
 * Returns the same JSON shape: `{ ok, text?, confidence?, lines?, error? }`.
 */
object EdgeTextRecognizer {
  private const val MAX_DECODED_BYTES = 8_000_000
  private const val MAX_EDGE = 2000
  private const val TAG = "EdgeTextRecognizer"

  fun recognize(json: String): String {
    return try {
      val o = JSONObject(json.ifBlank { "{}" })
      val data = imageBytes(o.optString("imageBase64"))
        ?: return JSONObject().put("ok", false).put("error", "Could not decode the image.").toString()
      if (data.size > MAX_DECODED_BYTES) {
        return JSONObject().put("ok", false).put("error", "Image is too large.").toString()
      }
      val raw = BitmapFactory.decodeByteArray(data, 0, data.size)
        ?: return JSONObject().put("ok", false).put("error", "Could not decode the image.").toString()
      val bmp = downscale(raw, MAX_EDGE)
      if (bmp !== raw) raw.recycle()
      val image = InputImage.fromBitmap(bmp, 0)
      val latch = CountDownLatch(1)
      val out = AtomicReference(JSONObject().put("ok", false).put("error", "OCR timed out."))
      val client = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      client.process(image)
        .addOnSuccessListener { visionText ->
          try {
            out.set(formatResult(visionText))
          } catch (e: Exception) {
            out.set(JSONObject().put("ok", false).put("error", e.message ?: "OCR failed."))
          } finally {
            latch.countDown()
          }
        }
        .addOnFailureListener { e ->
          Log.w(TAG, "OCR failed", e)
          out.set(JSONObject().put("ok", false).put("error", e.message ?: "OCR failed."))
          latch.countDown()
        }
      latch.await(30, TimeUnit.SECONDS)
      bmp.recycle()
      try {
        client.close()
      } catch (_: Exception) {
        // ignore
      }
      out.get().toString()
    } catch (e: Exception) {
      JSONObject().put("ok", false).put("error", e.message ?: "OCR failed.").toString()
    }
  }

  private fun formatResult(visionText: com.google.mlkit.vision.text.Text): JSONObject {
    data class Line(val text: String, val confidence: Float, val midY: Float, val minX: Float)

    val lines = mutableListOf<Line>()
    for (block in visionText.textBlocks) {
      for (line in block.lines) {
        val text = line.text.trim()
        if (text.isEmpty()) continue
        val box = line.boundingBox
        val midY = if (box != null) (box.top + box.bottom) / 2f else 0f
        val minX = box?.left?.toFloat() ?: 0f
        val conf = line.confidence ?: 0.8f
        lines.add(Line(text, conf, midY, minX))
      }
    }
    if (lines.isEmpty()) {
      return JSONObject().put("ok", false).put("error", "No text found.")
    }
    // Reading order: top→bottom, then left→right within a row band.
    val sorted = lines.sortedWith(compareBy({ it.midY }, { it.minX }))
    val rows = mutableListOf<MutableList<Line>>()
    val band = sorted.map { it.midY }.let { ys ->
      val span = (ys.maxOrNull() ?: 0f) - (ys.minOrNull() ?: 0f)
      max(12f, span * 0.02f)
    }
    for (line in sorted) {
      val last = rows.lastOrNull()
      if (last != null && abs(last.first().midY - line.midY) <= band) {
        last.add(line)
      } else {
        rows.add(mutableListOf(line))
      }
    }
    val ordered = rows.map { row -> row.sortedBy { it.minX } }
    val flat = ordered.flatten()
    val text = ordered.joinToString("\n") { row -> row.joinToString(" ") { it.text } }
    val mean = flat.map { it.confidence }.average().toFloat()
    val linesJson = JSONArray()
    for (line in flat) {
      linesJson.put(
        JSONObject()
          .put("text", line.text)
          .put("confidence", line.confidence.toDouble()),
      )
    }
    return JSONObject()
      .put("ok", true)
      .put("text", text)
      .put("confidence", mean.toDouble())
      .put("lines", linesJson)
  }

  private fun imageBytes(raw: String): ByteArray? {
    var encoded = raw.trim()
    if (encoded.isEmpty()) return null
    val marker = "base64,"
    val idx = encoded.indexOf(marker, ignoreCase = true)
    if (idx >= 0) encoded = encoded.substring(idx + marker.length)
    encoded = encoded.replace(Regex("\\s+"), "")
    return try {
      Base64.decode(encoded, Base64.DEFAULT)
    } catch (_: Exception) {
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
}
