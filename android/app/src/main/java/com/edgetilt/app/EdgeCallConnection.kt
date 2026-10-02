package com.edgetilt.app

import android.telecom.Connection
import android.telecom.DisconnectCause
import android.telecom.PhoneAccount
import android.telecom.TelecomManager

/** Self-managed Telecom connection for one ringing / brief active chat call. */
class EdgeCallConnection(
  private val appContext: android.content.Context,
  private val invite: EdgeCallRing.Invite,
) : Connection() {
  init {
    connectionProperties = PROPERTY_SELF_MANAGED
    connectionCapabilities = CAPABILITY_SUPPORT_HOLD
    setCallerDisplayName(invite.handle, TelecomManager.PRESENTATION_ALLOWED)
    setAddress(
      android.net.Uri.fromParts(PhoneAccount.SCHEME_SIP, invite.callId, null),
      TelecomManager.PRESENTATION_ALLOWED,
    )
    audioModeIsVoip = true
  }

  override fun onShowIncomingCallUi() {
    EdgeCallRing.showIncomingUi(appContext, invite)
  }

  override fun onAnswer(videoState: Int) {
    EdgeCallRing.answer(appContext, invite.callId)
  }

  override fun onAnswer() {
    EdgeCallRing.answer(appContext, invite.callId)
  }

  override fun onReject() {
    EdgeCallRing.decline(appContext, invite.callId)
  }

  override fun onDisconnect() {
    setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
    destroy()
  }

  override fun onAbort() {
    setDisconnected(DisconnectCause(DisconnectCause.CANCELED))
    destroy()
  }
}
