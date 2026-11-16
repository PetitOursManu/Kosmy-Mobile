import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";

import Installer from "../../modules/kosmy-installer";

/**
 * Un espace admin : l'adresse de l'instance d'une appli (souvent auto-hébergée), ouverte dans Kosmy.
 * Kosmy ne connaît jamais les identifiants : on se connecte dans la page, et la session (cookies,
 * stockage local) reste dans la WebView de Kosmy.
 */
export interface AdminSpace {
  id: string;
  /** Appli du catalogue, ou null pour une autre appli web. */
  appId: string | null;
  name: string;
  /** Adresse de l'instance, sans « / » final (ex. https://kanby.mondomaine.fr). */
  base: string;
  /** Page d'admin, ajoutée à `base` (ex. /admin). */
  path: string;
  addedAt: number;
  openedAt?: number;
}

export type SpaceInput = Pick<AdminSpace, "appId" | "name" | "base" | "path">;

const SPACES_KEY = "kosmy.admin.v1";
const LOCK_KEY = "kosmy.admin.lock.v1";
/** Après ce délai hors de Kosmy, il faut se déverrouiller à nouveau. */
const GRACE_MS = 60_000;

export const spaceUrl = (s: Pick<AdminSpace, "base" | "path">) => s.base + (s.path.startsWith("/") ? s.path : `/${s.path}`);
export const hostOf = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
export const isCleartext = (url: string) => /^http:\/\//i.test(url);

/**
 * Nettoie l'adresse saisie : ajoute https:// si besoin, retire la page d'admin si elle a été collée avec.
 * Renvoie une erreur en français si l'adresse n'est pas utilisable.
 */
export function normalizeBase(input: string, adminPath?: string): { base: string } | { error: string } {
  let s = input.trim();
  if (!s) return { error: "Indiquez l'adresse de votre instance." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  const m = s.match(/^(https?):\/\/([^/?#\s]+)(\/[^?#\s]*)?(?:[?#].*)?$/i);
  if (!m) return { error: "Cette adresse ne commence ni par https:// ni par http://." };
  const [, scheme, host, rawPath = ""] = m;
  if (host.includes("@")) return { error: "Retirez l'identifiant de l'adresse : vous vous connecterez dans la page." };
  if (!/^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i.test(host) || /^\.|\.\.|\.$/.test(host.replace(/:\d+$/, ""))) {
    return { error: "L'adresse ne semble pas valide." };
  }
  let path = rawPath.replace(/\/+$/, "");
  if (adminPath && adminPath !== "/" && path.toLowerCase().endsWith(adminPath.replace(/\/+$/, "").toLowerCase())) {
    path = path.slice(0, path.length - adminPath.replace(/\/+$/, "").length);
  }
  return { base: `${scheme.toLowerCase()}://${host.toLowerCase()}${path}` };
}

interface AdminState {
  spaces: AdminSpace[];
  ready: boolean;
  add: (input: SpaceInput) => Promise<AdminSpace>;
  update: (id: string, input: SpaceInput) => Promise<void>;
  /** Supprime l'espace et oublie sa session (cookies et stockage du site). */
  remove: (id: string) => Promise<void>;
  /** Se déconnecter : efface la session du site, garde l'espace. */
  forget: (id: string) => Promise<void>;
  touch: (id: string) => void;

  lockEnabled: boolean;
  setLockEnabled: (v: boolean) => Promise<boolean>;
  /** Le téléphone a un verrouillage d'écran (empreinte, visage, code ou schéma). */
  lockAvailable: boolean;
  unlocked: boolean;
  /** Demande l'empreinte ou le code du téléphone si besoin. */
  unlock: () => Promise<boolean>;
}

const Ctx = createContext<AdminState | null>(null);

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function AdminProvider({ children }: { children: ReactNode }) {
  const [spaces, setSpaces] = useState<AdminSpace[]>([]);
  const [ready, setReady] = useState(false);
  const [lockEnabled, setLockState] = useState(true);
  const [lockAvailable, setLockAvailable] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  // Copie toujours à jour de la liste, pour les fonctions appelées après un await.
  const spacesRef = useRef(spaces);
  const authenticating = useRef<Promise<boolean> | null>(null);
  const backgroundAt = useRef<number | null>(null);

  const checkLock = useCallback(async () => {
    const level = await LocalAuthentication.getEnrolledLevelAsync().catch(() => LocalAuthentication.SecurityLevel.NONE);
    const available = level !== LocalAuthentication.SecurityLevel.NONE;
    setLockAvailable(available);
    return available;
  }, []);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(SPACES_KEY), AsyncStorage.getItem(LOCK_KEY)])
      .then(([s, l]) => {
        const list = s ? (JSON.parse(s) as AdminSpace[]) : [];
        if (Array.isArray(list)) {
          spacesRef.current = list.filter((x) => x && x.id && x.base);
          setSpaces(spacesRef.current);
        }
        if (l !== null) setLockState(l === "1");
      })
      .catch(() => {})
      .finally(() => setReady(true));
    LocalAuthentication.getEnrolledLevelAsync()
      .then((level) => setLockAvailable(level !== LocalAuthentication.SecurityLevel.NONE))
      .catch(() => {});
  }, []);

  // Hors de Kosmy plus d'une minute : on reverrouille. Et on écrit les cookies sur le disque.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") {
        backgroundAt.current = Date.now();
        Installer.flushCookies().catch(() => {});
      } else if (s === "active") {
        if (backgroundAt.current && Date.now() - backgroundAt.current > GRACE_MS && !authenticating.current) setUnlocked(false);
        backgroundAt.current = null;
        checkLock();
      }
    });
    return () => sub.remove();
  }, [checkLock]);

  const save = useCallback((next: AdminSpace[]) => {
    setSpaces(next);
    spacesRef.current = next;
    AsyncStorage.setItem(SPACES_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const add = useCallback(
    async (input: SpaceInput) => {
      const space: AdminSpace = { ...input, id: newId(), addedAt: Date.now() };
      save([...spacesRef.current, space]);
      return space;
    },
    [save],
  );

  const update = useCallback(
    async (id: string, input: SpaceInput) => {
      const old = spacesRef.current.find((s) => s.id === id);
      // Nouvelle adresse : l'ancienne session ne sert plus.
      if (old && hostOf(old.base) !== hostOf(input.base)) await Installer.clearSiteData(spaceUrl(old)).catch(() => 0);
      save(spacesRef.current.map((s) => (s.id === id ? { ...s, ...input } : s)));
    },
    [save],
  );

  const forget = useCallback(async (id: string) => {
    const s = spacesRef.current.find((x) => x.id === id);
    if (s) await Installer.clearSiteData(spaceUrl(s)).catch(() => 0);
  }, []);

  const remove = useCallback(
    async (id: string) => {
      const s = spacesRef.current.find((x) => x.id === id);
      // Un autre espace sur le même site garde sa session.
      if (s && !spacesRef.current.some((x) => x.id !== id && hostOf(x.base) === hostOf(s.base))) {
        await Installer.clearSiteData(spaceUrl(s)).catch(() => 0);
      }
      save(spacesRef.current.filter((x) => x.id !== id));
    },
    [save],
  );

  const touch = useCallback(
    (id: string) => save(spacesRef.current.map((s) => (s.id === id ? { ...s, openedAt: Date.now() } : s))),
    [save],
  );

  const authenticate = useCallback(async () => {
    if (authenticating.current) return authenticating.current;
    const p = LocalAuthentication.authenticateAsync({
      promptMessage: "Déverrouiller les espaces admin",
      cancelLabel: "Annuler",
      requireConfirmation: false,
    })
      .then((r) => r.success)
      .catch(() => false)
      .finally(() => {
        authenticating.current = null;
      });
    authenticating.current = p;
    return p;
  }, []);

  const unlock = useCallback(async () => {
    if (!lockEnabled || unlocked) return true;
    // Sans verrouillage d'écran sur le téléphone, il n'y a rien à demander.
    if (!(await checkLock())) return true;
    const ok = await authenticate();
    if (ok) setUnlocked(true);
    return ok;
  }, [authenticate, checkLock, lockEnabled, unlocked]);

  const setLockEnabled = useCallback(
    async (v: boolean) => {
      // Désactiver le verrou demande de prouver qu'on est bien le propriétaire du téléphone.
      if (!v && (await checkLock()) && !(await authenticate())) return false;
      setLockState(v);
      if (v) setUnlocked(false);
      await AsyncStorage.setItem(LOCK_KEY, v ? "1" : "0").catch(() => {});
      return true;
    },
    [authenticate, checkLock],
  );

  const value = useMemo<AdminState>(
    () => ({
      spaces,
      ready,
      add,
      update,
      remove,
      forget,
      touch,
      lockEnabled,
      setLockEnabled,
      lockAvailable,
      unlocked: unlocked || !lockEnabled || !lockAvailable,
      unlock,
    }),
    [spaces, ready, add, update, remove, forget, touch, lockEnabled, setLockEnabled, lockAvailable, unlocked, unlock],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin doit être utilisé dans <AdminProvider>");
  return v;
}
