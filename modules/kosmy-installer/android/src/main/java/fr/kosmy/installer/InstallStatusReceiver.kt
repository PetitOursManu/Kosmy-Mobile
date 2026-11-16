package fr.kosmy.installer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build

/**
 * Reçoit le résultat des sessions PackageInstaller.
 * Déclaré dans le manifeste (non exporté) pour fonctionner même si le module JS n'est pas prêt.
 */
class InstallStatusReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, Int.MIN_VALUE)
    val sessionId = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1)
    val pkg = intent.getStringExtra(EXTRA_TARGET_PACKAGE)
    val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)

    if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
      val confirm: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra(Intent.EXTRA_INTENT)
      }
      if (confirm != null) {
        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          context.startActivity(confirm)
        } catch (e: Exception) {
          InstallEvents.emit(sessionId, pkg, "failure", e.message)
          return
        }
      }
    }

    InstallEvents.emit(sessionId, pkg, statusName(status), message)
  }

  private fun statusName(status: Int) = when (status) {
    PackageInstaller.STATUS_PENDING_USER_ACTION -> "pending_user"
    PackageInstaller.STATUS_SUCCESS -> "success"
    PackageInstaller.STATUS_FAILURE_ABORTED -> "aborted"
    PackageInstaller.STATUS_FAILURE_BLOCKED -> "blocked"
    PackageInstaller.STATUS_FAILURE_CONFLICT -> "conflict"
    PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> "incompatible"
    PackageInstaller.STATUS_FAILURE_INVALID -> "invalid"
    PackageInstaller.STATUS_FAILURE_STORAGE -> "storage"
    else -> "failure"
  }

  companion object {
    const val ACTION = "fr.kosmy.installer.INSTALL_STATUS"
    const val EXTRA_TARGET_PACKAGE = "fr.kosmy.installer.TARGET_PACKAGE"
  }
}

/** Relais entre le récepteur et le module (qui transmet au JavaScript). */
object InstallEvents {
  var listener: ((Map<String, Any?>) -> Unit)? = null

  fun emit(sessionId: Int, pkg: String?, status: String, message: String?) {
    listener?.invoke(
      mapOf(
        "sessionId" to sessionId,
        "packageName" to pkg,
        "status" to status,
        "message" to message,
      ),
    )
  }
}
