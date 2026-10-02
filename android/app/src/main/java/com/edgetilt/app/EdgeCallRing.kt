package com.edgetilt.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import org.json.JSONObject

/**
 * Incoming chat-call ring (CallKit equivalent).
 * FCM `chat_call_invite` and JS `EdgeAndroid.reportIncomingCall` both land here.
 */
object EdgeCallRing {
  const val CHANNEL_ID = "edge_incoming_calls"
  const val EXTRA_CALL_ID = "edge_call_id"
  const val EXTRA_ROOM_ID = "edge_room_id"
  const val EXTRA_HANDLE = "edge_handle"
  const val EXTRA_HAS_VIDEO = "edge_has_video"
  const val EXTRA_URL = "edge_url"
  const val EXTRA_AVATAR = "edge_avatar"
  const val ACTION_ANSWER = "com.edgetilt.app.CALL_ANSWER"
  const val ACTION_DECLINE = "com.edgetilt.app.CALL_DECLINE"
  /** Finishes a live `EdgeIncomingCallActivity` after Answer / Decline from the pill. */
  const val ACTION_DISMISS_UI = "com.edgetilt.app.CALL_DISMISS_UI"

  private const val TAG = "EdgeCallRing"
  private const val ACCOUNT_ID = "edge_chat_calls"
  private const val PREFS = "edge_call_ring"
  /** Ignore re-reports (Realtime / `?call=` deep link / avatar refresh) after Answer or Decline. */
  private const val HANDLED_TTL_MS = 120_000L

  data class Invite(
    val callId: String,
    val roomId: String,
    val handle: String,
    val hasVideo: Boolean,
    val url: String,
    val avatarUrl: String?,
  )

  data class PendingEvent(val name: String, val detail: JSONObject)

  @Volatile private var active: Invite? = null
  @Volatile private var connection: EdgeCallConnection? = null
  @Volatile private var webReady = false
  @Volatile private var host: MainActivity? = null
  private val pendingEvents = ArrayDeque<PendingEvent>()
  /** callId → handled-at epoch ms (Answer / Decline / missed). */
  private val recentlyHandled = mutableMapOf<String, Long>()

  fun activeCallId(): String? = active?.callId

  fun activeInvite(): Invite? = active

  /** True when this call was already answered / declined (do not show a second ring UI). */
  fun isHandled(callId: String): Boolean {
    val id = callId.trim()
    if (id.isEmpty()) return false
    pruneHandled()
    return recentlyHandled.containsKey(id)
  }

  private fun markHandled(callId: String) {
    val id = callId.trim()
    if (id.isEmpty()) return
    recentlyHandled[id] = System.currentTimeMillis()
    pruneHandled()
  }

  private fun pruneHandled() {
    val cutoff = System.currentTimeMillis() - HANDLED_TTL_MS
    val stale = recentlyHandled.filterValues { it < cutoff }.keys
    stale.forEach { recentlyHandled.remove(it) }
  }

  private fun dismissIncomingUi(ctx: Context, callId: String) {
    ctx.sendBroadcast(
      Intent(ACTION_DISMISS_UI)
        .setPackage(ctx.packageName)
        .putExtra(EXTRA_CALL_ID, callId),
    )
  }

  fun bindHost(activity: MainActivity?) {
    host = activity
    if (activity == null) webReady = false
  }

  fun ensurePhoneAccount(ctx: Context) {
    val tm = ctx.getSystemService(TelecomManager::class.java) ?: return
    val handle = phoneAccountHandle(ctx)
    val existing = try {
      tm.getPhoneAccount(handle)
    } catch (_: SecurityException) {
      null
    }
    if (existing != null) return
    val account = PhoneAccount.builder(handle, ctx.getString(R.string.app_name))
      .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
      .setSupportedUriSchemes(listOf(PhoneAccount.SCHEME_SIP))
      .build()
    try {
      tm.registerPhoneAccount(account)
    } catch (e: Exception) {
      Log.w(TAG, "registerPhoneAccount failed", e)
    }
  }

  fun phoneAccountHandle(ctx: Context): PhoneAccountHandle {
    val component = ComponentName(ctx, EdgeCallConnectionService::class.java)
    return PhoneAccountHandle(component, ACCOUNT_ID)
  }

  /** FCM / notification payload → invite, or null when not a call ring. */
  fun inviteFromPush(data: Map<String, String>): Invite? {
    if (data["eventType"] != "chat_call_invite") return null
    val callId = data["chatCallId"]?.trim().orEmpty()
    if (callId.isEmpty()) return null
    val url = data["url"]?.trim().orEmpty()
    val uri = url.takeIf { it.isNotEmpty() }?.let(Uri::parse)
    val roomId = data["roomId"]?.trim().orEmpty()
      .ifEmpty { uri?.getQueryParameter("room").orEmpty() }
    val handle = data["callerName"]?.trim().orEmpty()
      .ifEmpty {
        data["body"]?.replace(Regex("\\s+is calling(?: you)?\\.?$", RegexOption.IGNORE_CASE), "")?.trim().orEmpty()
      }
      .ifEmpty { data["title"]?.trim().orEmpty() }
      .ifEmpty { "Incoming call" }
    val hasVideo = data["hasVideo"] == "true" || data["hasVideo"] == "1"
    val avatar = data["avatarUrl"]?.trim()?.takeIf { it.startsWith("https://") }
    val openUrl = url.ifEmpty {
      val base = BuildConfig.BASE_URL.trimEnd('/')
      val q = buildString {
        append("tab=chat")
        if (roomId.isNotEmpty()) append("&room=").append(Uri.encode(roomId))
        append("&call=").append(Uri.encode(callId))
      }
      "$base/?$q"
    }
    return Invite(callId, roomId, handle, hasVideo, openUrl, avatar)
  }

  fun inviteFromJson(raw: String): Invite? {
    return try {
      val o = JSONObject(raw)
      val callId = o.optString("callId").trim()
      if (callId.isEmpty()) return null
      val roomId = o.optString("roomId").trim()
      val handle = o.optString("handle").trim().ifEmpty { "Incoming call" }
      val hasVideo = o.optBoolean("hasVideo", false)
      val avatar = o.optString("avatarUrl").trim().takeIf { it.startsWith("https://") }
      val base = BuildConfig.BASE_URL.trimEnd('/')
      val url = buildString {
        append(base).append("/?tab=chat")
        if (roomId.isNotEmpty()) append("&room=").append(Uri.encode(roomId))
        append("&call=").append(Uri.encode(callId))
      }
      Invite(callId, roomId, handle, hasVideo, url, avatar)
    } catch (_: Exception) {
      null
    }
  }

  fun reportIncoming(ctx: Context, invite: Invite): JSONObject {
    ensurePhoneAccount(ctx)
    if (isHandled(invite.callId)) {
      return JSONObject().put("ok", true).put("deduped", true).put("skipped", "already-handled")
    }
    val current = active
    if (current?.callId == invite.callId) {
      return JSONObject().put("ok", true).put("deduped", true)
    }
    if (current != null && current.callId != invite.callId) {
      endInternal(ctx, current.callId, remote = true, emitEvent = false)
    }
    active = invite
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString("callId", invite.callId)
      .putString("roomId", invite.roomId)
      .putString("handle", invite.handle)
      .putBoolean("hasVideo", invite.hasVideo)
      .putString("url", invite.url)
      .putString("avatar", invite.avatarUrl ?: "")
      .apply()

    val tm = ctx.getSystemService(TelecomManager::class.java)
    if (tm == null) {
      showIncomingUi(ctx, invite)
      return JSONObject().put("ok", true).put("via", "notification")
    }
    val extras = Bundle().apply {
      putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccountHandle(ctx))
      putString(EXTRA_CALL_ID, invite.callId)
      putString(EXTRA_ROOM_ID, invite.roomId)
      putString(EXTRA_HANDLE, invite.handle)
      putBoolean(EXTRA_HAS_VIDEO, invite.hasVideo)
      putString(EXTRA_URL, invite.url)
      putString(EXTRA_AVATAR, invite.avatarUrl ?: "")
    }
    return try {
      tm.addNewIncomingCall(phoneAccountHandle(ctx), extras)
      JSONObject().put("ok", true)
    } catch (e: Exception) {
      Log.w(TAG, "addNewIncomingCall failed; notification fallback", e)
      showIncomingUi(ctx, invite)
      JSONObject().put("ok", true).put("via", "notification")
    }
  }

  fun attachConnection(conn: EdgeCallConnection) {
    connection = conn
  }

  fun showIncomingUi(ctx: Context, invite: Invite? = null) {
    val call = invite ?: active ?: return
    if (isHandled(call.callId)) return
    val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
    ensureChannel(nm)
    val fullScreen = Intent(ctx, EdgeIncomingCallActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION or
        Intent.FLAG_ACTIVITY_CLEAR_TOP
      putExtras(inviteExtras(call))
    }
    val fullPending = PendingIntent.getActivity(
      ctx,
      call.callId.hashCode(),
      fullScreen,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val answer = PendingIntent.getBroadcast(
      ctx,
      call.callId.hashCode() + 1,
      Intent(ctx, EdgeCallActionReceiver::class.java).setAction(ACTION_ANSWER).putExtras(inviteExtras(call)),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val decline = PendingIntent.getBroadcast(
      ctx,
      call.callId.hashCode() + 2,
      Intent(ctx, EdgeCallActionReceiver::class.java).setAction(ACTION_DECLINE).putExtras(inviteExtras(call)),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val kind = if (call.hasVideo) "Video call" else "Voice call"
    val builder = Notification.Builder(ctx, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_edge)
      .setContentTitle(call.handle)
      .setContentText(kind)
      .setCategory(Notification.CATEGORY_CALL)
      .setOngoing(true)
      .setAutoCancel(false)
      .setTimeoutAfter(60_000)
      .setContentIntent(fullPending)
      .setFullScreenIntent(fullPending, true)
    val notification = if (Build.VERSION.SDK_INT >= 31) {
      builder
        .setStyle(
          Notification.CallStyle.forIncomingCall(
            android.app.Person.Builder().setName(call.handle).setImportant(true).build(),
            decline,
            answer,
          ),
        )
        .build()
    } else {
      builder
        .addAction(Notification.Action.Builder(null, "Decline", decline).build())
        .addAction(Notification.Action.Builder(null, "Answer", answer).build())
        .build()
    }
    nm.notify(notifyTag(call.callId), 0, notification)
  }

  fun answer(ctx: Context, callId: String) {
    val invite = active?.takeIf { it.callId == callId } ?: restoreInvite(ctx)?.takeIf { it.callId == callId }
    if (invite == null) {
      // Pill Answer raced a queued full-screen UI for an already-cleared invite.
      markHandled(callId)
      dismissIncomingUi(ctx, callId)
      cancelNotification(ctx, callId)
      return
    }
    markHandled(callId)
    dismissIncomingUi(ctx, callId)
    connection?.let {
      it.setActive()
      it.setDisconnected(android.telecom.DisconnectCause(android.telecom.DisconnectCause.LOCAL))
      it.destroy()
    }
    connection = null
    cancelNotification(ctx, callId)
    active = null
    clearPrefs(ctx)
    // Do NOT open `?call=` … that deep link re-runs presentIncoming → second native ring.
    // Join happens via `edge-callkit-answer` (same as CallKit).
    val base = BuildConfig.BASE_URL.trimEnd('/')
    val openUrl = if (invite.roomId.isNotEmpty()) {
      "$base/?tab=chat&room=${Uri.encode(invite.roomId)}"
    } else {
      base
    }
    val open = Intent(ctx, MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse(openUrl)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    ctx.startActivity(open)
    emit(
      "edge-callkit-answer",
      JSONObject()
        .put("callId", invite.callId)
        .put("roomId", invite.roomId)
        .put("handle", invite.handle)
        .put("callerName", invite.handle)
        .put("hasVideo", invite.hasVideo)
        .put("avatarUrl", invite.avatarUrl ?: ""),
    )
  }

  fun decline(ctx: Context, callId: String) {
    val invite = active?.takeIf { it.callId == callId } ?: restoreInvite(ctx)?.takeIf { it.callId == callId }
    markHandled(callId)
    dismissIncomingUi(ctx, callId)
    endInternal(ctx, callId, remote = false, emitEvent = false)
    if (invite != null) {
      emit(
        "edge-callkit-decline",
        JSONObject()
          .put("callId", invite.callId)
          .put("roomId", invite.roomId),
      )
      // Bring the shell up so web can run decline_call once listeners are ready.
      val base = BuildConfig.BASE_URL.trimEnd('/')
      val openUrl = if (invite.roomId.isNotEmpty()) {
        "$base/?tab=chat&room=${Uri.encode(invite.roomId)}"
      } else {
        base
      }
      val open = Intent(ctx, MainActivity::class.java).apply {
        action = Intent.ACTION_VIEW
        data = Uri.parse(openUrl)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      ctx.startActivity(open)
    }
  }

  fun end(ctx: Context, callId: String?, remote: Boolean = false): JSONObject {
    val id = callId?.trim().orEmpty().ifEmpty { active?.callId.orEmpty() }
    if (id.isEmpty()) return JSONObject().put("ok", true)
    endInternal(ctx, id, remote = remote, emitEvent = true)
    return JSONObject().put("ok", true)
  }

  /** Missed-call push replaces the ringing notification. */
  fun onMissed(ctx: Context, callId: String?) {
    val id = callId?.trim().orEmpty()
    if (id.isEmpty()) return
    if (active?.callId == id || restoreInvite(ctx)?.callId == id) {
      endInternal(ctx, id, remote = true, emitEvent = true)
    }
  }

  private fun endInternal(ctx: Context, callId: String, remote: Boolean, emitEvent: Boolean) {
    markHandled(callId)
    dismissIncomingUi(ctx, callId)
    val invite = active?.takeIf { it.callId == callId } ?: restoreInvite(ctx)?.takeIf { it.callId == callId }
    connection?.let {
      val cause = if (remote) {
        android.telecom.DisconnectCause(android.telecom.DisconnectCause.REMOTE)
      } else {
        android.telecom.DisconnectCause(android.telecom.DisconnectCause.REJECTED)
      }
      try {
        it.setDisconnected(cause)
        it.destroy()
      } catch (_: Exception) {
      }
    }
    connection = null
    cancelNotification(ctx, callId)
    if (active?.callId == callId) active = null
    clearPrefs(ctx)
    if (emitEvent && invite != null) {
      emit(
        "edge-callkit-end",
        JSONObject()
          .put("callId", invite.callId)
          .put("roomId", invite.roomId)
          .put("reason", if (remote) "remote" else "local"),
      )
    }
  }

  fun markWebReady(activity: MainActivity): JSONObject {
    host = activity
    webReady = true
    var n = 0
    while (pendingEvents.isNotEmpty()) {
      val ev = pendingEvents.removeFirst()
      dispatch(activity, ev)
      n += 1
    }
    return JSONObject().put("ok", true).put("replayed", n)
  }

  fun resetWebReady() {
    webReady = false
  }

  private fun emit(name: String, detail: JSONObject) {
    val activity = host
    if (webReady && activity != null) {
      dispatch(activity, PendingEvent(name, detail))
    } else {
      pendingEvents.addLast(PendingEvent(name, detail))
    }
  }

  private fun dispatch(activity: MainActivity, event: PendingEvent) {
    activity.deliverWindowEvent(event.name, event.detail)
  }

  private fun inviteExtras(invite: Invite) = Bundle().apply {
    putString(EXTRA_CALL_ID, invite.callId)
    putString(EXTRA_ROOM_ID, invite.roomId)
    putString(EXTRA_HANDLE, invite.handle)
    putBoolean(EXTRA_HAS_VIDEO, invite.hasVideo)
    putString(EXTRA_URL, invite.url)
    putString(EXTRA_AVATAR, invite.avatarUrl ?: "")
  }

  fun inviteFromIntent(intent: Intent?): Invite? {
    val callId = intent?.getStringExtra(EXTRA_CALL_ID)?.trim().orEmpty()
    if (callId.isEmpty()) return null
    return Invite(
      callId = callId,
      roomId = intent?.getStringExtra(EXTRA_ROOM_ID).orEmpty(),
      handle = intent?.getStringExtra(EXTRA_HANDLE)?.trim().orEmpty().ifEmpty { "Incoming call" },
      hasVideo = intent?.getBooleanExtra(EXTRA_HAS_VIDEO, false) == true,
      url = intent?.getStringExtra(EXTRA_URL).orEmpty(),
      avatarUrl = intent?.getStringExtra(EXTRA_AVATAR)?.trim()?.takeIf { it.startsWith("https://") },
    )
  }

  private fun restoreInvite(ctx: Context): Invite? {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val callId = p.getString("callId", "")?.trim().orEmpty()
    if (callId.isEmpty()) return null
    return Invite(
      callId = callId,
      roomId = p.getString("roomId", "") ?: "",
      handle = p.getString("handle", "Incoming call") ?: "Incoming call",
      hasVideo = p.getBoolean("hasVideo", false),
      url = p.getString("url", "") ?: "",
      avatarUrl = p.getString("avatar", "")?.takeIf { it.startsWith("https://") },
    )
  }

  private fun clearPrefs(ctx: Context) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }

  fun notifyTag(callId: String) = "edge_call_$callId"

  private fun cancelNotification(ctx: Context, callId: String) {
    ctx.getSystemService(NotificationManager::class.java)?.cancel(notifyTag(callId), 0)
  }

  private fun ensureChannel(nm: NotificationManager) {
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
        setSound(ringtone, attrs)
        enableVibration(true)
        setBypassDnd(true)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      },
    )
  }

  fun canUseFullScreenIntent(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    val nm = ctx.getSystemService(NotificationManager::class.java) ?: return true
    return nm.canUseFullScreenIntent()
  }

  fun notificationsGranted(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < 33) return true
    return ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
  }
}
