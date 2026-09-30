package com.edgetilt.app

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.core.content.FileProvider
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import java.io.File

/**
 * Converts iPhone QuickTime videos (HEVC / Dolby Vision HDR, spatial audio) picked in the file chooser into a
 * 1080p SDR H.264 MP4 with the hardware codecs before WebView sees them. Cloudflare Stream rejects the raw MOVs,
 * and browser-side conversion (ffmpeg wasm, WebCodecs) never worked for them on Android.
 * Anything else passes through untouched. A failed conversion hands back the original, so the web's
 * "not supported on Android" alert still covers it.
 */
class EdgeVideoPrep(private val activity: Activity, private val host: FrameLayout) {
  private val main = Handler(Looper.getMainLooper())
  private var transformer: Transformer? = null
  private var overlay: View? = null
  private var label: TextView? = null
  private var bar: ProgressBar? = null
  private var finish: ((Array<Uri>?) -> Unit)? = null

  val running: Boolean get() = transformer != null

  /** Replaces QuickTime entries in [uris], then calls [done] (null = user cancelled). */
  fun prepare(uris: Array<Uri>, done: (Array<Uri>?) -> Unit) {
    val queue = uris.indices.filter { isQuickTime(uris[it]) }
    if (queue.isEmpty()) {
      done(uris)
      return
    }
    outputDir().deleteRecursively()
    outputDir().mkdirs()
    val out = uris.copyOf()
    finish = done
    showOverlay()
    convertNext(out, queue, 0)
  }

  /** Back / Cancel while converting. Returns false when idle. */
  fun cancel(): Boolean {
    val t = transformer ?: return false
    t.cancel()
    complete(null)
    return true
  }

  private fun convertNext(out: Array<Uri>, queue: List<Int>, pos: Int) {
    if (pos >= queue.size) {
      complete(out)
      return
    }
    val index = queue[pos]
    val source = out[index]
    val target = File(outputDir(), "edge-video-${System.currentTimeMillis()}.mp4")
    val step = if (queue.size > 1) " (${pos + 1}/${queue.size})" else ""
    setProgress(0, "Preparing video$step")

    val videoEffects = if (shortSide(source) > MAX_SHORT_SIDE) {
      listOf(Presentation.createForShortSide(MAX_SHORT_SIDE))
    } else {
      emptyList()
    }
    val edited = EditedMediaItem.Builder(MediaItem.fromUri(source))
      .setEffects(Effects(emptyList(), videoEffects))
      .build()
    val composition = Composition.Builder(EditedMediaItemSequence.Builder(edited).build())
      .setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
      .build()

    val t = Transformer.Builder(activity)
      .setVideoMimeType(MimeTypes.VIDEO_H264)
      .setAudioMimeType(MimeTypes.AUDIO_AAC)
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, result: ExportResult) {
          if (transformer == null) return
          out[index] = FileProvider.getUriForFile(activity, "${activity.packageName}.files", target)
          convertNext(out, queue, pos + 1)
        }

        override fun onError(composition: Composition, result: ExportResult, exception: ExportException) {
          if (transformer == null) return
          Log.w(TAG, "convert failed ${exception.errorCodeName}", exception)
          target.delete()
          convertNext(out, queue, pos + 1)
        }
      })
      .build()
    transformer = t
    t.start(composition, target.absolutePath)
    pollProgress(t, step)
  }

  private fun pollProgress(t: Transformer, step: String) {
    val holder = ProgressHolder()
    main.postDelayed(object : Runnable {
      override fun run() {
        if (transformer !== t) return
        if (t.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
          setProgress(holder.progress, "Preparing video$step")
        }
        main.postDelayed(this, 250)
      }
    }, 250)
  }

  private fun complete(result: Array<Uri>?) {
    transformer = null
    hideOverlay()
    val done = finish
    finish = null
    done?.invoke(result)
  }

  private fun isQuickTime(uri: Uri): Boolean = try {
    activity.contentResolver.openInputStream(uri)?.use { input ->
      val head = ByteArray(12)
      var read = 0
      while (read < 12) {
        val n = input.read(head, read, 12 - read)
        if (n < 0) break
        read += n
      }
      read == 12 && String(head, 4, 4, Charsets.US_ASCII) == "ftyp" && String(head, 8, 4, Charsets.US_ASCII) == "qt  "
    } ?: false
  } catch (e: Exception) {
    false
  }

  private fun shortSide(uri: Uri): Int = try {
    MediaMetadataRetriever().run {
      try {
        setDataSource(activity, uri)
        val w = extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
        val h = extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
        minOf(w, h)
      } finally {
        release()
      }
    }
  } catch (e: Exception) {
    0
  }

  private fun outputDir() = File(activity.cacheDir, "video")

  // MARK: - Overlay

  private fun showOverlay() {
    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    val density = activity.resources.displayMetrics.density
    fun dp(v: Int) = (v * density).toInt()
    val title = TextView(activity).apply {
      setTextColor(Color.WHITE)
      textSize = 16f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    }
    val sub = TextView(activity).apply {
      text = "Converting for upload"
      setTextColor(Color.argb(170, 255, 255, 255))
      textSize = 13f
      gravity = Gravity.CENTER
    }
    val progress = ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal).apply {
      max = 100
      progressTintList = android.content.res.ColorStateList.valueOf(Color.rgb(52, 211, 153))
    }
    val cancel = Button(activity, null, android.R.attr.borderlessButtonStyle).apply {
      text = "Cancel"
      setTextColor(Color.rgb(248, 113, 113))
      isAllCaps = false
      setOnClickListener { cancel() }
    }
    val card = LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(24), dp(20), dp(24), dp(8))
      background = GradientDrawable().apply {
        cornerRadius = dp(22).toFloat()
        setColor(Color.rgb(24, 24, 27))
        setStroke(dp(1), Color.rgb(63, 63, 70))
      }
      addView(title)
      addView(sub, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(4) })
      addView(progress, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) })
      addView(cancel, LinearLayout.LayoutParams(-2, -2).apply {
        gravity = Gravity.CENTER_HORIZONTAL
        topMargin = dp(8)
      })
    }
    val scrim = FrameLayout(activity).apply {
      setBackgroundColor(Color.argb(150, 0, 0, 0))
      isClickable = true
      addView(card, FrameLayout.LayoutParams(dp(280), -2, Gravity.CENTER))
    }
    host.addView(scrim, FrameLayout.LayoutParams(-1, -1))
    overlay = scrim
    label = title
    bar = progress
  }

  private fun setProgress(pct: Int, text: String) {
    label?.text = if (pct > 0) "$text… $pct%" else "$text…"
    bar?.progress = pct
  }

  private fun hideOverlay() {
    activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    overlay?.let { host.removeView(it) }
    overlay = null
    label = null
    bar = null
  }

  private companion object {
    const val TAG = "EdgeVideoPrep"
    const val MAX_SHORT_SIDE = 1080
  }
}
