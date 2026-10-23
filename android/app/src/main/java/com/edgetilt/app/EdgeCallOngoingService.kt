package com.edgetilt.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * Ongoing chat call (answered or outgoing): `phoneCall` foreground service + CallStyle
 * notification with Hang up. Keeps the WebView call alive and visible while backgrounded.
 * Started / stopped by web via `EdgeAndroid.setOngoingCall`.
 */
class EdgeCallOngoingService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopForegroundCompat()
      stopSelf()
      return START_NOT_STICKY
    }
    val callId = intent?.getStringExtra(EXTRA_CALL_ID).orEmpty()
    val title = intent?.getStringExtra(EXTRA_TITLE)?.trim().orEmpty().ifEmpty { "Edge call" }
    val hasVideo = intent?.getBooleanExtra(EXTRA_HAS_VIDEO, false) == true
    val startedAt = intent?.getLongExtra(EXTRA_STARTED_AT, 0L)?.takeIf { it > 0 } ?: System.currentTimeMillis()
    try {
      val notification = build(callId, title, hasVideo, startedAt)
      if (Build.VERSION.SDK_INT >= 29) {
        startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
      } else {
        startForeground(NOTIF_ID, notification)
      }
    } catch (e: Exception) {
      Log.w(TAG, "startForeground failed", e)
      stopSelf()
    }
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    stopForegroundCompat()
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
  }

  private fun build(callId: String, title: String, hasVideo: Boolean, startedAt: Long): Notification {
    ensureChannel(this)
    val open = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java).apply {
        action = Intent.ACTION_MAIN
        addCategory(Intent.CATEGORY_LAUNCHER)
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val hangUp = PendingIntent.getBroadcast(
      this,
      callId.hashCode() + 3,
      Intent(this, EdgeCallActionReceiver::class.java)
        .setAction(EdgeCallRing.ACTION_HANGUP)
        .putExtra(EdgeCallRing.EXTRA_CALL_ID, callId),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.sym_call_outgoing)
      .setContentTitle(title)
      .setContentText(if (hasVideo) "Video call" else "Voice call")
      .setContentIntent(open)
      .setCategory(Notification.CATEGORY_CALL)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setWhen(startedAt)
      .setUsesChronometer(true)
      .setShowWhen(true)
    if (Build.VERSION.SDK_INT >= 31) {
      builder.setStyle(
        Notification.CallStyle.forOngoingCall(Person.Builder().setName(title).build(), hangUp),
      )
    } else {
      builder.addAction(Notification.Action.Builder(null, "Hang up", hangUp).build())
    }
    return builder.build()
  }

  companion object {
    private const val TAG = "EdgeCallOngoing"
    private const val NOTIF_ID = 4418
    /** Separate from the high-importance ring channel so the in-call pill does not buzz. */
    private const val CHANNEL_ID = "edge_ongoing_calls"
    private const val ACTION_START = "com.edgetilt.app.call.ONGOING_START"
    private const val ACTION_STOP = "com.edgetilt.app.call.ONGOING_STOP"
    private const val EXTRA_CALL_ID = "call_id"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_HAS_VIDEO = "has_video"
    private const val EXTRA_STARTED_AT = "started_at"

    @Volatile var runningCallId: String? = null
      private set

    private fun ensureChannel(ctx: Context) {
      if (Build.VERSION.SDK_INT < 26) return
      val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Ongoing calls", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "Shown while you are in a chat call"
          setSound(null, null)
          enableVibration(false)
          setShowBadge(false)
        },
      )
    }

    fun start(ctx: Context, callId: String, title: String, hasVideo: Boolean, startedAt: Long) {
      runningCallId = callId
      val i = Intent(ctx, EdgeCallOngoingService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_CALL_ID, callId)
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_HAS_VIDEO, hasVideo)
        putExtra(EXTRA_STARTED_AT, startedAt)
      }
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
    }

    fun stop(ctx: Context) {
      if (runningCallId == null) return
      runningCallId = null
      try {
        ctx.startService(Intent(ctx, EdgeCallOngoingService::class.java).setAction(ACTION_STOP))
      } catch (e: Exception) {
        Log.w(TAG, "stop failed", e)
      }
    }
  }
}
