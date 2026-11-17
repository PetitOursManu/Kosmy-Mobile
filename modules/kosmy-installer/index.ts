import { NativeModule, requireNativeModule } from "expo";

export interface PackageDetails {
  packageName: string;
  versionName: string | null;
  versionCode: number;
  lastUpdateTime: number;
  /** Package de l'installeur d'origine (ex. fr.kosmy.app, com.android.chrome…). */
  installer: string | null;
}

export type InstallStatus =
  | "pending_user"
  | "success"
  | "aborted"
  | "blocked"
  | "conflict"
  | "incompatible"
  | "invalid"
  | "storage"
  | "failure";

export interface InstallStatusEvent {
  sessionId: number;
  packageName: string | null;
  status: InstallStatus;
  message: string | null;
}

type Events = { onInstallStatus: (event: InstallStatusEvent) => void };

declare class KosmyInstallerModule extends NativeModule<Events> {
  getSupportedAbis(): string[];
  getSdkInt(): number;
  getOwnPackageName(): string;
  getPackagesInfo(packages: string[]): Record<string, PackageDetails | null>;
  getArchiveInfo(path: string): PackageDetails | null;
  canRequestPackageInstalls(): boolean;
  openUnknownSourcesSettings(): boolean;
  openApp(packageName: string): boolean;
  openAppSettings(packageName: string): boolean;
  uninstall(packageName: string): boolean;
  install(path: string, expectedPackage: string): Promise<number>;
  getSessionInfo(sessionId: number): { active: boolean; progress: number } | null;
  abandonSession(sessionId: number): boolean;
  /** Passe Kosmy en arrière-plan (comme le bouton d'accueil), avant sa propre mise à jour. */
  moveToBack(): Promise<boolean>;
  /** Enregistre sur le disque les cookies des pages web ouvertes dans Kosmy. */
  flushCookies(): Promise<boolean>;
  /** Efface les cookies et le stockage local d'un site (déconnexion d'un espace admin). */
  clearSiteData(url: string): Promise<number>;
}

export default requireNativeModule<KosmyInstallerModule>("KosmyInstaller");
