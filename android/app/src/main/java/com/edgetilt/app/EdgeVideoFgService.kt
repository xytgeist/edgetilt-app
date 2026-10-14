package com.edgetilt.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground service for Lounge/Chat native video export + upload.
 * Uses [ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC] only (not phoneCall).
 */
class EdgeVideoFgService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_PROGRESS -> {
        val pct = intent.getIntExtra(EXTRA_PROGRESS, -1)
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "Uploading video"
        val text = intent.getStringExtra(EXTRA_TEXT) ?: if (pct in 0..100) "$pct%" else "Working…"
        startAsForeground(title, text, pct)
        return START_STICKY
      }
      else -> {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Preparing video"
        val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Working…"
        startAsForeground(title, text, -1)
        return START_STICKY
      }
    }
  }

  private fun startAsForeground(title: String, text: String, progress: Int) {
    ensureChannel(this)
    val open = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(open)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .setPriority(NotificationCompat.PRIORITY_LOW)
    if (progress in 0..100) {
      builder.setProgress(100, progress, false)
    } else {
      builder.setProgress(0, 0, true)
    }
    val notification = builder.build()
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      @Suppress("DEPRECATION")
      startForeground(NOTIF_ID, notification)
    }
  }

  companion object {
    const val ACTION_START = "com.edgetilt.app.video.FG_START"
    const val ACTION_PROGRESS = "com.edgetilt.app.video.FG_PROGRESS"
    const val ACTION_STOP = "com.edgetilt.app.video.FG_STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_PROGRESS = "progress"
    private const val NOTIF_ID = 4417
    /** Separate from live-session / call channels. */
    private const val CHANNEL_ID = "edge_video_jobs"

    private fun ensureChannel(ctx: Context) {
      if (Build.VERSION.SDK_INT < 26) return
      val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Video uploads", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Lounge and chat video prepare / upload"
          setShowBadge(false)
        },
      )
    }

    fun start(ctx: Context, title: String, text: String) {
      val i = Intent(ctx, EdgeVideoFgService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_TEXT, text)
      }
      if (Build.VERSION.SDK_INT >= 26) {
        ctx.startForegroundService(i)
      } else {
        ctx.startService(i)
      }
    }

    fun progress(ctx: Context, title: String, text: String, pct: Int) {
      val i = Intent(ctx, EdgeVideoFgService::class.java).apply {
        action = ACTION_PROGRESS
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_TEXT, text)
        putExtra(EXTRA_PROGRESS, pct)
      }
      ctx.startService(i)
    }

    fun stop(ctx: Context) {
      val i = Intent(ctx, EdgeVideoFgService::class.java).apply { action = ACTION_STOP }
      ctx.startService(i)
    }
  }
}
