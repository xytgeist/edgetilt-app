package com.edgetilt.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Answer / Decline from the ring notification; Hang up from the ongoing-call notification. */
class EdgeCallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action == EdgeCallRing.ACTION_HANGUP) {
      EdgeCallRing.requestWebHangup(context, intent.getStringExtra(EdgeCallRing.EXTRA_CALL_ID))
      return
    }
    val invite = EdgeCallRing.inviteFromIntent(intent) ?: return
    when (intent?.action) {
      EdgeCallRing.ACTION_ANSWER -> EdgeCallRing.answer(context, invite.callId)
      EdgeCallRing.ACTION_DECLINE -> EdgeCallRing.decline(context, invite.callId)
    }
  }
}
