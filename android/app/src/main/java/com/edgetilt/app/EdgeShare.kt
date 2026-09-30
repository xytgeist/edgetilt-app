package com.edgetilt.app

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Base64
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** System share sheet for `EdgeAndroid.share` (same payload as the IPA's `share`). */
object EdgeShare {
  private const val DIR = "share"
  private const val MAX_IMAGES = 4

  /** Chooser intent, or null when there is nothing to share. Does file I/O ... call off the UI thread. */
  fun chooser(ctx: Context, payload: JSONObject): Intent? {
    val url = payload.optString("url").trim()
    val text = payload.optString("text").trim()
    val title = payload.optString("title").trim()
    val body = when {
      url.isEmpty() -> text
      text.isEmpty() || text.contains(url) -> text.ifEmpty { url }
      else -> "$text\n$url"
    }
    val images = writeImages(ctx, payload.optJSONArray("images"))
    if (body.isEmpty() && images.isEmpty()) return null

    val send = when (images.size) {
      0 -> Intent(Intent.ACTION_SEND).setType("text/plain")
      1 -> Intent(Intent.ACTION_SEND).setType(images[0].second).putExtra(Intent.EXTRA_STREAM, images[0].first)
      else -> Intent(Intent.ACTION_SEND_MULTIPLE)
        .setType("image/*")
        .putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(images.map { it.first }))
    }
    if (body.isNotEmpty()) send.putExtra(Intent.EXTRA_TEXT, body)
    if (title.isNotEmpty()) {
      send.putExtra(Intent.EXTRA_TITLE, title)
      send.putExtra(Intent.EXTRA_SUBJECT, title)
    }
    if (images.isNotEmpty()) {
      // ClipData carries the read grant to the chooser and gives it a thumbnail preview.
      val clip = ClipData.newRawUri(null, images[0].first)
      images.drop(1).forEach { clip.addItem(ClipData.Item(it.first)) }
      send.clipData = clip
      send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    return Intent.createChooser(send, title.ifEmpty { null })
  }

  private fun writeImages(ctx: Context, rows: JSONArray?): List<Pair<Uri, String>> {
    val dir = File(ctx.cacheDir, DIR)
    dir.deleteRecursively()
    if (rows == null || rows.length() == 0) return emptyList()
    dir.mkdirs()
    val out = mutableListOf<Pair<Uri, String>>()
    for (i in 0 until minOf(rows.length(), MAX_IMAGES)) {
      val row = rows.optJSONObject(i) ?: continue
      val b64 = row.optString("base64").trim()
      if (b64.isEmpty()) continue
      val mime = row.optString("mimeType").ifEmpty { "image/jpeg" }
      val ext = if (mime == "image/png") "png" else "jpg"
      val bytes = try {
        Base64.decode(b64, Base64.DEFAULT)
      } catch (e: IllegalArgumentException) {
        continue
      }
      val file = File(dir, "edge-share-${i + 1}.$ext")
      file.writeBytes(bytes)
      out += FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", file) to mime
    }
    return out
  }
}
