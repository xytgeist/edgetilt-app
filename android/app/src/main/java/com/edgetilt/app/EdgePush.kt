package com.edgetilt.app

import android.Manifest
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

/** FCM token cache, notification permission state, and alert display. */
object EdgePush {
  private const val CHANNEL_ID = "edge_alerts"
  private const val PREFS = "edge_push"
  private const val KEY_TOKEN = "fcm_token"
  private const val KEY_ASKED = "asked_permission"

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** False until app/google-services.json ships in the build. */
  fun firebaseReady(ctx: Context): Boolean = FirebaseApp.getApps(ctx).isNotEmpty()

  fun token(ctx: Context): String = prefs(ctx).getString(KEY_TOKEN, "") ?: ""

  fun saveToken(ctx: Context, token: String) {
    prefs(ctx).edit().putString(KEY_TOKEN, token).apply()
  }

  fun refreshToken(ctx: Context) {
    if (!firebaseReady(ctx)) return
    val app = ctx.applicationContext
    FirebaseMessaging.getInstance().token.addOnSuccessListener { saveToken(app, it) }
  }

  fun markAsked(ctx: Context) {
    prefs(ctx).edit().putBoolean(KEY_ASKED, true).apply()
  }

  /** `granted` / `denied` / `prompt`, matching the iOS bridge. */
  fun status(activity: Activity): String {
    val nm = activity.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT < 33) return if (nm.areNotificationsEnabled()) "granted" else "denied"
    val granted = activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    if (granted) return if (nm.areNotificationsEnabled()) "granted" else "denied"
    // After a second "Don't allow" Android stops showing the dialog and the rationale flag drops.
    val asked = prefs(activity).getBoolean(KEY_ASKED, false)
    return if (asked && !activity.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
      "denied"
    } else {
      "prompt"
    }
  }

  fun show(ctx: Context, title: String, body: String, url: String?, tag: String?) {
    val nm = ctx.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL_ID) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Alerts", NotificationManager.IMPORTANCE_HIGH),
      )
    }
    val open = Intent(ctx, MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      data = url?.takeIf { it.isNotBlank() }?.let(Uri::parse)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val key = tag ?: url ?: title
    val pending = PendingIntent.getActivity(
      ctx,
      key.hashCode(),
      open,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val notification = Notification.Builder(ctx, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_edge)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setAutoCancel(true)
      .setContentIntent(pending)
      .build()
    nm.notify(key, 0, notification)
  }
}
