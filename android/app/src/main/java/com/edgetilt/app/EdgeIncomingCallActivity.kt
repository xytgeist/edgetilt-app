package com.edgetilt.app

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.window.OnBackInvokedDispatcher

/** Lock-screen / full-screen incoming chat call (Answer / Decline). */
class EdgeIncomingCallActivity : Activity() {
  private var invite: EdgeCallRing.Invite? = null

  private val dismissReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val id = intent?.getStringExtra(EdgeCallRing.EXTRA_CALL_ID).orEmpty()
      val mine = invite?.callId.orEmpty()
      if (id.isEmpty() || id == mine) finish()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    invite = EdgeCallRing.inviteFromIntent(intent) ?: EdgeCallRing.activeInvite()
    val call = invite
    // Pill Answer already handled this call; a queued full-screen intent must not ask again.
    if (call == null || EdgeCallRing.isHandled(call.callId) || EdgeCallRing.activeCallId() != call.callId) {
      finish()
      return
    }

    val filter = IntentFilter(EdgeCallRing.ACTION_DISMISS_UI)
    if (Build.VERSION.SDK_INT >= 33) {
      registerReceiver(dismissReceiver, filter, RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(dismissReceiver, filter)
    }

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.BLACK)
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(24), dp(72), dp(24), dp(48))
    }
    val kind = TextView(this).apply {
      text = if (call.hasVideo) "Video call" else "Incoming call"
      setTextColor(0xFFA1A1AA.toInt())
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      gravity = Gravity.CENTER
    }
    val name = TextView(this).apply {
      text = call.handle
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, dp(12), 0, dp(8))
    }
    val spacer = LinearLayout(this).apply {
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        0,
        1f,
      )
    }
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    val decline = Button(this).apply {
      text = "Decline"
      setBackgroundColor(0xFFDC2626.toInt())
      setTextColor(Color.WHITE)
      setOnClickListener {
        EdgeCallRing.decline(this@EdgeIncomingCallActivity, call.callId)
        finish()
      }
    }
    val answer = Button(this).apply {
      text = "Answer"
      setBackgroundColor(0xFF16A34A.toInt())
      setTextColor(Color.WHITE)
      setOnClickListener {
        EdgeCallRing.answer(this@EdgeIncomingCallActivity, call.callId)
        finish()
      }
    }
    val btnLp = LinearLayout.LayoutParams(0, dp(52), 1f).apply { setMargins(dp(8), 0, dp(8), 0) }
    row.addView(decline, btnLp)
    row.addView(answer, btnLp)
    root.addView(kind)
    root.addView(name)
    root.addView(spacer)
    root.addView(row)
    setContentView(root)

    if (Build.VERSION.SDK_INT >= 33) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
        EdgeCallRing.decline(this, call.callId)
        finish()
      }
    }
  }

  override fun onResume() {
    super.onResume()
    val id = invite?.callId.orEmpty()
    if (id.isNotEmpty() && (EdgeCallRing.isHandled(id) || EdgeCallRing.activeCallId() != id)) {
      finish()
    }
  }

  override fun onDestroy() {
    try {
      unregisterReceiver(dismissReceiver)
    } catch (_: Exception) {
    }
    super.onDestroy()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
  }

  @Deprecated("Pre-33 back")
  override fun onBackPressed() {
    invite?.let { EdgeCallRing.decline(this, it.callId) }
    finish()
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
