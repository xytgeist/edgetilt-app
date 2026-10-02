package com.edgetilt.app

import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.PhoneAccountHandle
import android.os.Bundle

/** Telecom entry for self-managed Edge chat calls. */
class EdgeCallConnectionService : ConnectionService() {
  override fun onCreateIncomingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?,
  ): Connection {
    val extras = request?.extras ?: Bundle()
    val invite = EdgeCallRing.Invite(
      callId = extras.getString(EdgeCallRing.EXTRA_CALL_ID).orEmpty()
        .ifEmpty { EdgeCallRing.activeInvite()?.callId.orEmpty() },
      roomId = extras.getString(EdgeCallRing.EXTRA_ROOM_ID).orEmpty()
        .ifEmpty { EdgeCallRing.activeInvite()?.roomId.orEmpty() },
      handle = extras.getString(EdgeCallRing.EXTRA_HANDLE).orEmpty()
        .ifEmpty { EdgeCallRing.activeInvite()?.handle ?: "Incoming call" },
      hasVideo = extras.getBoolean(
        EdgeCallRing.EXTRA_HAS_VIDEO,
        EdgeCallRing.activeInvite()?.hasVideo == true,
      ),
      url = extras.getString(EdgeCallRing.EXTRA_URL).orEmpty()
        .ifEmpty { EdgeCallRing.activeInvite()?.url.orEmpty() },
      avatarUrl = extras.getString(EdgeCallRing.EXTRA_AVATAR)?.takeIf { it.startsWith("https://") }
        ?: EdgeCallRing.activeInvite()?.avatarUrl,
    )
    if (invite.callId.isEmpty()) {
      return Connection.createFailedConnection(
        android.telecom.DisconnectCause(android.telecom.DisconnectCause.ERROR),
      )
    }
    val conn = EdgeCallConnection(applicationContext, invite)
    conn.setInitializing()
    conn.setRinging()
    EdgeCallRing.attachConnection(conn)
    return conn
  }

  override fun onCreateIncomingConnectionFailed(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?,
  ) {
    val invite = EdgeCallRing.activeInvite() ?: return
    EdgeCallRing.showIncomingUi(applicationContext, invite)
  }

  override fun onCreateOutgoingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?,
  ): Connection {
    return Connection.createFailedConnection(
      android.telecom.DisconnectCause(android.telecom.DisconnectCause.ERROR),
    )
  }
}
