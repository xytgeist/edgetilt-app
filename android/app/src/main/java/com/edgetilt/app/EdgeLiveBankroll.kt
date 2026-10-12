package com.edgetilt.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import org.json.JSONObject

/**
 * Live slots / poker session status (iOS ActivityKit twin).
 * Ongoing notification on all API levels; Android 16+ requests Live Update promotion
 * (status-bar chip via chronometer / short critical text).
 *
 * JS: `EdgeAndroid.syncLiveBankrollActivity` ← `syncEdgeLiveBankrollActivity`.
 */
object EdgeLiveBankroll {
  private const val TAG = "EdgeLiveBankroll"
  private const val CHANNEL_ID = "edge_live_sessions"
  private const val NOTIFY_ID = 71001
  private const val EXTRA_REQUEST_PROMOTED = "android.requestPromotedOngoing"

  fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    nm.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        "Live sessions",
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = "Active slots and poker sessions"
        setShowBadge(false)
        // Live Updates require a channel that is not IMPORTANCE_MIN.
      },
    )
  }

  /** JSON `{ slots?, poker? }` … null / empty ids ends the notification. */
  fun sync(ctx: Context, json: String): JSONObject {
    ensureChannel(ctx)
    val o = try {
      JSONObject(json.ifBlank { "{}" })
    } catch (_: Exception) {
      return JSONObject().put("ok", false).put("error", "bad json")
    }
    val slots = o.optJSONObject("slots")
    val poker = o.optJSONObject("poker")
    val slotsId = slots?.optString("id")?.trim().orEmpty()
    val pokerId = poker?.optString("id")?.trim().orEmpty()

    if (slotsId.isEmpty() && pokerId.isEmpty()) {
      val ended = clear(ctx)
      return JSONObject()
        .put("ok", true)
        .put("supported", true)
        .put("ended", if (ended) 1 else 0)
    }

    val slotsLabel = slots?.optString("label")?.trim().orEmpty().ifEmpty { "Slots" }
    val pokerLabel = poker?.optString("label")?.trim().orEmpty().ifEmpty { "Poker" }
    val pokerPaused = poker?.optBoolean("paused") == true
    val dual = slotsId.isNotEmpty() && pokerId.isNotEmpty()

    val title = when {
      dual -> "2 live sessions"
      slotsId.isNotEmpty() -> slotsLabel
      else -> pokerLabel
    }
    val text = when {
      dual -> "$slotsLabel · $pokerLabel"
      pokerId.isNotEmpty() && pokerPaused -> "Paused"
      else -> "In play"
    }
    val tab = if (pokerId.isNotEmpty() && slotsId.isEmpty()) "poker-bankroll" else "bankroll"
    val chronometerStartMs = chronometerBaseMs(slots, poker, pokerPaused)
    val shortChip = shortCritical(dual, pokerPaused, chronometerStartMs)

    return try {
      val nm = ctx.getSystemService(NotificationManager::class.java)
        ?: return JSONObject().put("ok", false).put("error", "no nm")
      val notification = buildNotification(
        ctx,
        title = title,
        text = text,
        tab = tab,
        chronometerStartMs = chronometerStartMs,
        shortCritical = shortChip,
        pokerPaused = pokerPaused && slotsId.isEmpty(),
      )
      nm.notify(NOTIFY_ID, notification)
      JSONObject()
        .put("ok", true)
        .put("supported", true)
        .put("started", true)
        .put("updated", true)
        .put("promoted", Build.VERSION.SDK_INT >= 36)
    } catch (e: Exception) {
      Log.w(TAG, "sync failed", e)
      JSONObject().put("ok", false).put("supported", true).put("error", e.message ?: "failed")
    }
  }

  fun clear(ctx: Context): Boolean {
    val nm = ctx.getSystemService(NotificationManager::class.java) ?: return false
    nm.cancel(NOTIFY_ID)
    return true
  }

  private fun chronometerBaseMs(slots: JSONObject?, poker: JSONObject?, pokerPaused: Boolean): Long? {
    // Prefer slots clock when dual (matches iOS compact timer).
    slots?.let { return playClockBaseMs(it) }
    if (pokerPaused) return null
    poker?.let { return playClockBaseMs(it) }
    return null
  }

  /** `SystemClock.elapsedRealtime()`-style base for [Notification.Builder.setWhen] chronometer. */
  private fun playClockBaseMs(session: JSONObject): Long? {
    val elapsed = session.optDouble("elapsedSeconds", Double.NaN)
    if (!elapsed.isNaN() && elapsed >= 0) {
      return System.currentTimeMillis() - (elapsed * 1000.0).toLong()
    }
    val startAt = session.optString("startAt").trim()
    if (startAt.isNotEmpty()) {
      return parseIsoMs(startAt)
    }
    return null
  }

  private fun parseIsoMs(iso: String): Long? {
    return try {
      // Accept Instant-style strings from the web.
      java.time.Instant.parse(iso).toEpochMilli()
    } catch (_: Exception) {
      try {
        // Fallback: epoch millis as string
        iso.toLongOrNull()
      } catch (_: Exception) {
        null
      }
    }
  }

  private fun shortCritical(dual: Boolean, pokerPaused: Boolean, chronometerStartMs: Long?): String? {
    if (dual) return "2 LIVE"
    if (pokerPaused) return "PAUSED"
    // When chronometer is set, chip can use it; short text is optional highest-precedence.
    // Leave null so the system chronometer owns the chip when promoted.
    if (chronometerStartMs != null) return null
    return "LIVE"
  }

  private fun buildNotification(
    ctx: Context,
    title: String,
    text: String,
    tab: String,
    chronometerStartMs: Long?,
    shortCritical: String?,
    pokerPaused: Boolean,
  ): Notification {
    val openUri = Uri.parse("edgetilt://live-session?tab=${Uri.encode(tab)}")
    val open = PendingIntent.getActivity(
      ctx,
      NOTIFY_ID,
      Intent(ctx, MainActivity::class.java).apply {
        action = Intent.ACTION_VIEW
        data = openUri
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder = if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(ctx, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(ctx)
    }

    builder
      .setSmallIcon(R.drawable.ic_stat_edge)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(open)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_STATUS)
      .setVisibility(Notification.VISIBILITY_PUBLIC)

    if (chronometerStartMs != null && !pokerPaused) {
      builder
        .setWhen(chronometerStartMs)
        .setShowWhen(true)
        .setUsesChronometer(true)
    } else {
      builder.setShowWhen(false)
    }

    if (Build.VERSION.SDK_INT >= 36) {
      if (!shortCritical.isNullOrBlank()) {
        builder.setShortCriticalText(shortCritical.take(7))
      }
      // compileSdk 36: request promotion via extras key (API 36.1 setter may be absent).
      builder.addExtras(Bundle().apply { putBoolean(EXTRA_REQUEST_PROMOTED, true) })
    }

    return builder.build()
  }
}
