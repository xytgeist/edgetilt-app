package com.edgetilt.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Answer / Decline actions from the incoming-call notification. */
class EdgeCallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val invite = EdgeCallRing.inviteFromIntent(intent) ?: return
    when (intent?.action) {
      EdgeCallRing.ACTION_ANSWER -> EdgeCallRing.answer(context, invite.callId)
      EdgeCallRing.ACTION_DECLINE -> EdgeCallRing.decline(context, invite.callId)
    }
  }
}
