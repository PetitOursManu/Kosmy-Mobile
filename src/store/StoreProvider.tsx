import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";

import Installer, { type InstallStatus, type PackageDetails } from "../../modules/kosmy-installer";
import { useCatalog } from "../catalog/CatalogProvider";
import type { AndroidRelease } from "../catalog/types";
import { compareVersions, fetchLatestRelease, parseVersion, pickApk, type Release, type ReleaseAsset } from "./github";

/** Une appli installable : une appli du catalogue avec un APK, ou Kosmy elle-même. */
export interface Installable {
  id: string;
  android: AndroidRelease;
  self?: boolean;
}

export type AppState_ = "not_installed" | "update" | "up_to_date" | "unknown";

export type Task =
  | { phase: "downloading"; progress: number; written: number; total: number }
  | { phase: "verifying" }
  | { phase: "installing" }
  | { phase: "waiting_user" }
  | { phase: "done" }
  | { phase: "error"; message: string; status?: InstallStatus };

export interface AppStatus {
  item: Installable;
  installed: PackageDetails | null;
  release: Release | null;
  releaseError: string | null;
  asset: ReleaseAsset | null;
  state: AppState_;
  task: Task | null;
}

interface StoreValue {
  statuses: Record<string, AppStatus>;
  /** Applis (Kosmy comprise) pour lesquelles une mise à jour est disponible. */
  updateCount: number;
  loadingReleases: boolean;
  refresh: (force?: boolean) => Promise<void>;
  install: (id: string) => void;
  cancel: (id: string) => void;
  dismissError: (id: string) => void;
  open: (id: string) => void;
  uninstall: (id: string) => void;
  /** Appli en attente de l'autorisation « sources inconnues ». */
  permissionFor: string | null;
  openPermissionSettings: () => void;
  closePermission: () => void;
}

const Ctx = createContext<StoreValue | null>(null);

/** Ce que Kosmy a installé : version de la release et versionCode de l'APK, par package. */
const INSTALLED_KEY = "kosmy.installed.v1";
type InstallRecord = Record<string, { tag: string; versionCode: number }>;

const RELEASE_TTL = 10 * 60 * 1000;

export const ERRORS: Record<string, string> = {
  aborted: "Installation annulée.",
  blocked: "Android a bloqué l'installation.",
  conflict:
    "La version installée n'a pas la même signature que celle de GitHub. Désinstallez-la d'abord, puis installez-la depuis Kosmy.",
  incompatible: "Cet APK n'est pas compatible avec votre appareil.",
  invalid: "Le fichier APK est invalide ou incomplet.",
  storage: "Pas assez d'espace de stockage.",
  failure: "L'installation a échoué.",
};

const splitRepo = (github: string, repo: string): [string, string] => {
  if (repo.includes("/")) {
    const [o, r] = repo.split("/");
    return [o, r];
  }
  return [github.replace(/\/+$/, "").split("/").pop() || "PetitOursManu", repo];
};

function computeState(installed: PackageDetails | null, release: Release | null, record?: { tag: string; versionCode: number }): AppState_ {
  if (!installed) return "not_installed";
  if (!release) return "unknown";
  if (record && record.tag === release.tag && record.versionCode === installed.versionCode) return "up_to_date";
  const latest = parseVersion(release.tag);
  const current = parseVersion(installed.versionName);
  if (!latest || !current) return "unknown";
  return compareVersions(current, latest) < 0 ? "update" : "up_to_date";
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { catalog } = useCatalog();

  const items = useMemo<Installable[]>(() => {
    const list: Installable[] = catalog.apps
      .filter((a) => a.android)
      .map((a) => ({ id: a.id, android: a.android! }));
    list.push({ id: "kosmy", self: true, android: { name: "Kosmy", package: catalog.kosmy.package, repo: catalog.kosmy.repo } });
    return list;
  }, [catalog]);

  const abis = useMemo(() => Installer.getSupportedAbis(), []);
  const [installed, setInstalled] = useState<Record<string, PackageDetails | null>>({});
  const [releases, setReleases] = useState<Record<string, Release | null>>({});
  const [releaseErrors, setReleaseErrors] = useState<Record<string, string | null>>({});
  const [records, setRecords] = useState<InstallRecord>({});
  const [tasks, setTasks] = useState<Record<string, Task | null>>({});
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [permissionFor, setPermissionFor] = useState<string | null>(null);

  const lastFetch = useRef(0);
  const sessions = useRef<Record<number, string>>({});
  const downloads = useRef<Record<string, { cancel: () => void }>>({});
  const waitingSince = useRef<Record<string, number>>({});
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const setTask = useCallback((id: string, task: Task | null) => setTasks((t) => ({ ...t, [id]: task })), []);

  const readInstalled = useCallback(() => {
    setInstalled(Installer.getPackagesInfo(itemsRef.current.map((i) => i.android.package)));
  }, []);

  const refresh = useCallback(
    async (force = false) => {
      readInstalled();
      if (!force && Date.now() - lastFetch.current < RELEASE_TTL) return;
      lastFetch.current = Date.now();
      setLoadingReleases(true);
      await Promise.all(
        itemsRef.current.map(async (item) => {
          const [owner, repo] = splitRepo(catalog.github, item.android.repo);
          try {
            const r = await fetchLatestRelease(owner, repo);
            setReleases((x) => ({ ...x, [item.id]: r }));
            setReleaseErrors((x) => ({ ...x, [item.id]: null }));
          } catch (e) {
            setReleaseErrors((x) => ({ ...x, [item.id]: (e as Error).message }));
          }
        }),
      );
      setLoadingReleases(false);
    },
    [catalog.github, readInstalled],
  );

  // Premier chargement, puis à chaque changement de catalogue.
  useEffect(() => {
    AsyncStorage.getItem(INSTALLED_KEY)
      .then((s) => s && setRecords(JSON.parse(s)))
      .catch(() => {});
  }, []);
  // Nouvelle vérification seulement si la liste des dépôts change (pas à chaque relecture du catalogue).
  const reposKey = items.map((i) => `${i.id}:${i.android.repo}:${i.android.package}`).join("|");
  useEffect(() => {
    lastFetch.current = 0;
    refresh();
  }, [reposKey, refresh]);

  const finish = useCallback(
    async (id: string, ok: boolean, status?: InstallStatus, message?: string | null) => {
      delete waitingSince.current[id];
      readInstalled();
      if (ok) {
        setTask(id, { phase: "done" });
        setTimeout(() => setTasks((t) => (t[id]?.phase === "done" ? { ...t, [id]: null } : t)), 2500);
      } else {
        const text = (status && ERRORS[status]) || ERRORS.failure;
        setTask(id, status === "aborted" ? null : { phase: "error", status, message: text + (message && status === "failure" ? `\n${message}` : "") });
      }
    },
    [readInstalled, setTask],
  );

  // Résultats des sessions d'installation.
  useEffect(() => {
    const sub = Installer.addListener("onInstallStatus", (e) => {
      const id = sessions.current[e.sessionId];
      if (!id) return;
      if (e.status === "pending_user") {
        setTask(id, { phase: "waiting_user" });
        waitingSince.current[id] = Date.now();
        // Mise à jour de Kosmy : le module natif l'a déjà passée derrière la boîte d'Android.
        return;
      }
      delete sessions.current[e.sessionId];
      finish(id, e.status === "success", e.status, e.message);
    });
    return () => sub.remove();
  }, [finish, setTask]);

  const install = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      const release = releases[id];
      if (!item || !release) return;

      if (!Installer.canRequestPackageInstalls()) {
        setPermissionFor(id);
        return;
      }

      const asset = pickApk(release.assets, abis, item.android.assetPattern);
      if (!asset) {
        setTask(id, { phase: "error", message: "Aucun APK de cette release ne convient à votre appareil." });
        return;
      }

      setTask(id, { phase: "downloading", progress: 0, written: 0, total: asset.size });
      try {
        const dir = new Directory(Paths.cache, "apks");
        dir.create({ intermediates: true, idempotent: true });
        const dest = new File(dir, asset.name);
        if (dest.exists) dest.delete();

        let last = 0;
        const task = File.createDownloadTask(asset.url, dest, {
          onProgress: ({ bytesWritten, totalBytes }) => {
            const now = Date.now();
            if (now - last < 120) return;
            last = now;
            const total = totalBytes > 0 ? totalBytes : asset.size;
            setTask(id, { phase: "downloading", progress: total ? bytesWritten / total : 0, written: bytesWritten, total });
          },
        });
        downloads.current[id] = { cancel: () => task.cancel() };
        const file = await task.downloadAsync();
        delete downloads.current[id];
        if (!file) {
          setTask(id, null);
          return;
        }

        setTask(id, { phase: "verifying" });
        const archive = Installer.getArchiveInfo(file.uri);
        if (!archive) throw new Error("Le fichier téléchargé n'est pas un APK valide.");
        if (archive.packageName !== item.android.package) {
          throw new Error(`Ce fichier installe « ${archive.packageName} » au lieu de « ${item.android.package} ».`);
        }

        const next = { ...records, [item.android.package]: { tag: release.tag, versionCode: archive.versionCode } };
        setRecords(next);
        AsyncStorage.setItem(INSTALLED_KEY, JSON.stringify(next)).catch(() => {});

        setTask(id, { phase: "installing" });
        const sessionId = await Installer.install(file.uri, item.android.package);
        sessions.current[sessionId] = id;
        // Mise à jour de Kosmy sans confirmation (Android 12+, Kosmy déjà installée par elle-même) :
        // Kosmy passe en arrière-plan pendant qu'Android la remplace.
        if (item.self) {
          setTimeout(() => {
            if (sessions.current[sessionId] === id && !waitingSince.current[id]) void Installer.moveToBack();
          }, 2500);
        }
      } catch (e) {
        delete downloads.current[id];
        const msg = (e as Error).message || "";
        if (/cancel/i.test(msg)) setTask(id, null);
        else setTask(id, { phase: "error", message: msg || ERRORS.failure });
      }
    },
    [abis, records, releases, setTask],
  );

  const cancel = useCallback(
    (id: string) => {
      downloads.current[id]?.cancel();
      delete downloads.current[id];
      for (const [sid, appId] of Object.entries(sessions.current)) {
        if (appId === id) {
          Installer.abandonSession(Number(sid));
          delete sessions.current[Number(sid)];
        }
      }
      delete waitingSince.current[id];
      setTask(id, null);
    },
    [setTask],
  );

  // Retour dans Kosmy : versions installées à jour, autorisation accordée, confirmation abandonnée.
  const permissionRef = useRef(permissionFor);
  permissionRef.current = permissionFor;
  const installRef = useRef(install);
  installRef.current = install;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      refresh();
      const pending = permissionRef.current;
      if (pending && Installer.canRequestPackageInstalls()) {
        setPermissionFor(null);
        installRef.current(pending);
      }
      // L'utilisateur est revenu sans répondre à la boîte de confirmation d'Android.
      setTimeout(() => {
        for (const [sid, appId] of Object.entries(sessions.current)) {
          if (!waitingSince.current[appId]) continue;
          // Kosmy elle-même : jamais d'abandon, son installation (87 Mo) peut durer bien plus longtemps.
          if (itemsRef.current.find((i) => i.id === appId)?.self) continue;
          const info = Installer.getSessionInfo(Number(sid));
          if (info === null) continue;
          setTimeout(() => {
            if (sessions.current[Number(sid)] !== appId || !waitingSince.current[appId]) return;
            if (Installer.getSessionInfo(Number(sid)) === null) return;
            Installer.abandonSession(Number(sid));
            delete sessions.current[Number(sid)];
            finish(appId, false, "aborted");
            // Assez long pour qu'une grosse appli finisse de s'installer après « Installer ».
          }, 20000);
        }
      }, 1500);
    });
    return () => sub.remove();
  }, [finish, refresh]);

  const statuses = useMemo(() => {
    const out: Record<string, AppStatus> = {};
    for (const item of items) {
      const inst = installed[item.android.package] ?? null;
      const release = releases[item.id] ?? null;
      out[item.id] = {
        item,
        installed: inst,
        release,
        releaseError: releaseErrors[item.id] ?? null,
        asset: release ? pickApk(release.assets, abis, item.android.assetPattern) : null,
        state: computeState(inst, release, records[item.android.package]),
        task: tasks[item.id] ?? null,
      };
    }
    return out;
  }, [abis, installed, items, records, releaseErrors, releases, tasks]);

  const value = useMemo<StoreValue>(
    () => ({
      statuses,
      updateCount: Object.values(statuses).filter((s) => s.state === "update").length,
      loadingReleases,
      refresh,
      install: (id) => void install(id),
      cancel,
      dismissError: (id) => setTask(id, null),
      open: (id) => {
        const s = statuses[id];
        if (s) Installer.openApp(s.item.android.package);
      },
      uninstall: (id) => {
        const s = statuses[id];
        if (s) Installer.uninstall(s.item.android.package);
      },
      permissionFor,
      openPermissionSettings: () => Installer.openUnknownSourcesSettings(),
      closePermission: () => setPermissionFor(null),
    }),
    [cancel, install, loadingReleases, permissionFor, refresh, setTask, statuses],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore doit être utilisé dans <StoreProvider>");
  return v;
}
