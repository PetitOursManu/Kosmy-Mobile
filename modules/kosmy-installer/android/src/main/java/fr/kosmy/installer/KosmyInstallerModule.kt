package fr.kosmy.installer

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.CookieManager
import android.webkit.WebStorage
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class KosmyInstallerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val pm: PackageManager
    get() = context.packageManager

  override fun definition() = ModuleDefinition {
    Name("KosmyInstaller")
    Events("onInstallStatus")

    OnCreate {
      InstallEvents.listener = { event -> sendEvent("onInstallStatus", event) }
      InstallEvents.moveToBack = { appContext.currentActivity?.moveTaskToBack(true) }
    }
    OnDestroy {
      InstallEvents.listener = null
      InstallEvents.moveToBack = null
    }

    /** Architectures prises en charge, de la préférée à la moins bonne (ex. arm64-v8a, armeabi-v7a). */
    Function("getSupportedAbis") { Build.SUPPORTED_ABIS.toList() }

    Function("getSdkInt") { Build.VERSION.SDK_INT }

    Function("getOwnPackageName") { context.packageName }

    /** Version installée de chaque package demandé (null s'il n'est pas installé). */
    Function("getPackagesInfo") { packages: List<String> ->
      packages.associateWith { packageInfo(it) }
    }

    /** Lit un APK téléchargé avant de l'installer, pour vérifier son package et sa version. */
    Function("getArchiveInfo") { path: String ->
      val info: PackageInfo? = pm.getPackageArchiveInfo(toFile(path).absolutePath, 0)
      if (info == null) null else describe(info, null)
    }

    /** Autorisation « Installer des applis inconnues » accordée à Kosmy. */
    Function("canRequestPackageInstalls") { pm.canRequestPackageInstalls() }

    Function("openUnknownSourcesSettings") {
      startActivity(
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")),
      )
    }

    Function("openApp") { packageName: String ->
      val launch = pm.getLaunchIntentForPackage(packageName)
      if (launch == null) false else startActivity(launch)
    }

    Function("openAppSettings") { packageName: String ->
      startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
    }

    Function("uninstall") { packageName: String ->
      @Suppress("DEPRECATION")
      startActivity(Intent(Intent.ACTION_UNINSTALL_PACKAGE, Uri.parse("package:$packageName")))
    }

    /**
     * Passe Kosmy en arrière-plan (comme le bouton d'accueil), sans la fermer.
     * Sert avant sa propre mise à jour : Android la remplace pendant qu'elle n'est plus à l'écran.
     */
    AsyncFunction("moveToBack") {
      appContext.currentActivity?.moveTaskToBack(true) ?: false
    }.runOnQueue(Queues.MAIN)

    /** Écrit tout de suite sur le disque les cookies des espaces admin (Android le fait sinon un peu plus tard). */
    AsyncFunction("flushCookies") {
      CookieManager.getInstance().flush()
      true
    }.runOnQueue(Queues.MAIN)

    /**
     * Oublie la session d'un site : ses cookies (pour chaque chemin de l'adresse) et son stockage local
     * (localStorage, IndexedDB). Renvoie le nombre de cookies effacés.
     */
    AsyncFunction("clearSiteData") { url: String ->
      val uri = Uri.parse(url)
      val host = uri.host ?: return@AsyncFunction 0
      val origin = "${uri.scheme}://${uri.encodedAuthority}"
      val secure = if (uri.scheme == "https") "; Secure" else ""
      val cm = CookieManager.getInstance()

      val paths = mutableListOf("/")
      uri.pathSegments.fold("") { acc, seg -> "$acc/$seg".also { paths.add(it) } }

      val names = mutableSetOf<String>()
      for (p in paths) {
        cm.getCookie(origin + p)?.split(";")?.forEach { c ->
          c.substringBefore("=").trim().takeIf { it.isNotEmpty() }?.let(names::add)
        }
      }
      for (name in names) for (p in paths) {
        cm.setCookie(origin, "$name=; Max-Age=0; Path=$p$secure")
        cm.setCookie(origin, "$name=; Max-Age=0; Path=$p; Domain=$host$secure")
      }
      cm.flush()
      WebStorage.getInstance().deleteOrigin(origin)
      names.size
    }.runOnQueue(Queues.MAIN)

    /**
     * Installe un APK par une session PackageInstaller. Renvoie l'identifiant de session ;
     * le résultat arrive ensuite par l'évènement onInstallStatus.
     */
    AsyncFunction("install") { path: String, expectedPackage: String ->
      val file = toFile(path)
      if (!file.exists()) throw CodedException("ERR_APK_MISSING", "Fichier APK introuvable", null)

      val installer = pm.packageInstaller
      val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
        setAppPackageName(expectedPackage)
        setSize(file.length())
        setInstallReason(PackageManager.INSTALL_REASON_USER)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          // Mise à jour sans confirmation quand Kosmy a déjà installé l'appli (Android 12+).
          setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          setPackageSource(PackageInstaller.PACKAGE_SOURCE_DOWNLOADED_FILE)
        }
      }

      val sessionId = installer.createSession(params)
      try {
        installer.openSession(sessionId).use { session ->
          file.inputStream().use { input ->
            session.openWrite("base.apk", 0, file.length()).use { output ->
              input.copyTo(output, 1 shl 16)
              session.fsync(output)
            }
          }
          val intent = Intent(context, InstallStatusReceiver::class.java)
            .setAction(InstallStatusReceiver.ACTION)
            .putExtra(InstallStatusReceiver.EXTRA_TARGET_PACKAGE, expectedPackage)
          val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
          val pending = PendingIntent.getBroadcast(context, sessionId, intent, flags)
          session.commit(pending.intentSender)
        }
      } catch (e: Exception) {
        runCatching { installer.abandonSession(sessionId) }
        throw CodedException("ERR_INSTALL", e.message ?: "Installation impossible", e)
      }
      sessionId
    }

    /** État d'une session : null si elle n'existe plus (terminée ou abandonnée). */
    Function("getSessionInfo") { sessionId: Int ->
      val info = pm.packageInstaller.getSessionInfo(sessionId)
      if (info == null) null else mapOf("active" to info.isActive, "progress" to info.progress.toDouble())
    }

    Function("abandonSession") { sessionId: Int ->
      runCatching { pm.packageInstaller.abandonSession(sessionId) }.isSuccess
    }
  }

  private fun startActivity(intent: Intent): Boolean {
    val activity = appContext.currentActivity
    return try {
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    } catch (e: Exception) {
      false
    }
  }

  private fun toFile(path: String): File =
    if (path.startsWith("file:")) File(Uri.parse(path).path ?: path) else File(path)

  private fun packageInfo(packageName: String): Map<String, Any?>? = try {
    val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
    } else {
      @Suppress("DEPRECATION")
      pm.getPackageInfo(packageName, 0)
    }
    val installer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      runCatching { pm.getInstallSourceInfo(packageName).installingPackageName }.getOrNull()
    } else {
      @Suppress("DEPRECATION")
      runCatching { pm.getInstallerPackageName(packageName) }.getOrNull()
    }
    describe(info, installer)
  } catch (e: PackageManager.NameNotFoundException) {
    null
  }

  private fun describe(info: PackageInfo, installer: String?): Map<String, Any?> {
    val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      info.longVersionCode
    } else {
      @Suppress("DEPRECATION")
      info.versionCode.toLong()
    }
    return mapOf(
      "packageName" to info.packageName,
      "versionName" to info.versionName,
      "versionCode" to code.toDouble(),
      "lastUpdateTime" to info.lastUpdateTime.toDouble(),
      "installer" to installer,
    )
  }
}
