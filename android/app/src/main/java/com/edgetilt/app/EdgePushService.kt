package com.edgetilt.app

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Server sends data-only messages (`_shared/fcmPush.ts`), so every alert is built here. */
class EdgePushService : FirebaseMessagingService() {
  override fun onNewToken(token: String) {
    EdgePush.saveToken(this, token)
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    val title = data["title"] ?: message.notification?.title ?: return
    val body = data["body"] ?: message.notification?.body ?: ""
    val tag = data["activityBatchId"] ?: data["activityEventId"] ?: data["chatCallId"]
    EdgePush.show(this, title, body, data["url"], tag)
  }
}
