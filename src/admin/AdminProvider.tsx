import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";

import Installer from "../../modules/kosmy-installer";
import { BoardError, boardApi, boardMessage, type BoardUser } from "./board";

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

/** Compte Kosmy Board relié à ce téléphone. Le jeton, lui, est dans le stockage sécurisé d'Android. */
export interface BoardLink {
  /** Adresse du Board, sans « / » final. */
  url: string;
  user: BoardUser;
  syncedAt?: number;
  /** Les espaces du téléphone ont rejoint le compte (première synchronisation faite). */
  merged?: boolean;
}

const SPACES_KEY = "kosmy.admin.v1";
const LOCK_KEY = "kosmy.admin.lock.v1";
const BOARD_KEY = "kosmy.board.v1";
const TOKEN_KEY = "kosmy.board.token";
/** Après ce délai hors de Kosmy, il faut se déverrouiller à nouveau. */
const GRACE_MS = 60_000;
/** Au retour dans Kosmy, on ne resynchronise pas plus souvent. */
const SYNC_EVERY_MS = 30_000;

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

  /** Kosmy Board relié, ou null. Tant qu'il est relié, les espaces sont ceux du compte. */
  board: BoardLink | null;
  syncing: boolean;
  /** Dernière erreur de synchronisation, en français. */
  syncError: string | null;
  /** Relie le Board après la connexion : les espaces du téléphone rejoignent le compte, puis la liste du Board arrive. */
  linkBoard: (url: string, token: string, user: BoardUser) => Promise<void>;
  /** Reprend la liste du Board. */
  sync: () => Promise<void>;
  /** Se déconnecter du Board : les espaces restent sur le téléphone, sans synchronisation. */
  unlinkBoard: () => Promise<void>;
}

const Ctx = createContext<AdminState | null>(null);

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function AdminProvider({ children }: { children: ReactNode }) {
  const [spaces, setSpaces] = useState<AdminSpace[]>([]);
  const [ready, setReady] = useState(false);
  const [lockEnabled, setLockState] = useState(true);
  const [lockAvailable, setLockAvailable] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [board, setBoard] = useState<BoardLink | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  // Copie toujours à jour de la liste, pour les fonctions appelées après un await.
  const spacesRef = useRef(spaces);
  // Board relié et son jeton, à jour eux aussi.
  const link = useRef<{ board: BoardLink; token: string } | null>(null);
  // Augmente à chaque changement de la liste : une liste du Board demandée avant est périmée.
  const version = useRef(0);
  const pulling = useRef<Promise<void> | null>(null);
  const authenticating = useRef<Promise<boolean> | null>(null);
  const backgroundAt = useRef<number | null>(null);

  const checkLock = useCallback(async () => {
    const level = await LocalAuthentication.getEnrolledLevelAsync().catch(() => LocalAuthentication.SecurityLevel.NONE);
    const available = level !== LocalAuthentication.SecurityLevel.NONE;
    setLockAvailable(available);
    return available;
  }, []);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(SPACES_KEY),
      AsyncStorage.getItem(LOCK_KEY),
      AsyncStorage.getItem(BOARD_KEY),
      SecureStore.getItemAsync(TOKEN_KEY).catch(() => null),
    ])
      .then(([s, l, b, token]) => {
        if (b && token) {
          try {
            const saved = JSON.parse(b) as BoardLink;
            if (saved?.url && saved.user) {
              link.current = { board: saved, token };
              setBoard(saved);
            }
          } catch {}
        }
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
    version.current++;
    setSpaces(next);
    spacesRef.current = next;
    AsyncStorage.setItem(SPACES_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  /* ---------- Kosmy Board ---------- */

  const saveBoard = useCallback((next: BoardLink | null, token?: string) => {
    setBoard(next);
    if (next) {
      const t = token ?? link.current?.token;
      if (!t) return;
      link.current = { board: next, token: t };
      AsyncStorage.setItem(BOARD_KEY, JSON.stringify(next)).catch(() => {});
    } else {
      link.current = null;
      AsyncStorage.removeItem(BOARD_KEY).catch(() => {});
      SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    }
  }, []);

  /** Jeton refusé (retiré depuis le Board, mot de passe changé, expiré) : on n'est plus relié. Les espaces restent. */
  const checkAuth = useCallback(
    (e: unknown) => {
      if (e instanceof BoardError && e.code === "auth") saveBoard(null);
    },
    [saveBoard],
  );

  /** Remplace la liste par celle du Board. */
  const applyRemote = useCallback(
    (remote: AdminSpace[]) => {
      const prev = spacesRef.current;
      const byId = new Map(prev.map((s) => [s.id, s]));
      const next = remote.map((r) => {
        const opened = Math.max(r.openedAt ?? 0, byId.get(r.id)?.openedAt ?? 0);
        return opened ? { ...r, openedAt: opened } : r;
      });
      save(next);
      // Supprimés depuis le Board ou un autre appareil : on efface leur session ici aussi, comme pour une suppression sur ce téléphone.
      const hosts = new Set(next.map((s) => hostOf(s.base)));
      const cleared = new Set<string>();
      for (const s of prev) {
        const h = hostOf(s.base);
        if (hosts.has(h) || cleared.has(h)) continue;
        cleared.add(h);
        Installer.clearSiteData(spaceUrl(s)).catch(() => 0);
      }
    },
    [save],
  );

  const pull = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const l = link.current;
      if (!l) return;
      const { url } = l.board;
      // Première synchronisation : les espaces du téléphone rejoignent d'abord le compte (les doublons sont ignorés).
      if (!l.board.merged) {
        if (spacesRef.current.length) await boardApi.importSpaces(url, l.token, spacesRef.current);
        if (link.current?.token !== l.token) return;
        saveBoard({ ...link.current.board, merged: true });
      }
      const v = version.current;
      const [remote, user] = await Promise.all([boardApi.spaces(url, l.token), boardApi.me(url, l.token)]);
      const cur = link.current;
      if (cur?.token !== l.token) return;
      // La liste a changé pendant la requête : on redemande.
      if (version.current !== v) continue;
      applyRemote(remote);
      saveBoard({ ...cur.board, user, syncedAt: Date.now() });
      return;
    }
  }, [applyRemote, saveBoard]);

  const sync = useCallback(async () => {
    if (!link.current) return;
    if (pulling.current) return pulling.current;
    setSyncing(true);
    const p = pull()
      .then(() => setSyncError(null))
      .catch((e) => {
        checkAuth(e);
        setSyncError(boardMessage(e));
      })
      .finally(() => {
        pulling.current = null;
        setSyncing(false);
      });
    pulling.current = p;
    return p;
  }, [checkAuth, pull]);

  const linkBoard = useCallback(
    async (url: string, token: string, user: BoardUser) => {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      saveBoard({ url, user, merged: false }, token);
      setSyncError(null);
      await sync();
    },
    [saveBoard, sync],
  );

  const unlinkBoard = useCallback(async () => {
    const l = link.current;
    saveBoard(null);
    setSyncError(null);
    // Le jeton est aussi retiré du Board (s'il est joignable).
    if (l) await boardApi.logout(l.board.url, l.token).catch(() => {});
  }, [saveBoard]);

  /** Appelle le Board si le téléphone est relié. Une erreur remonte (BoardError) : rien n'est changé sur le téléphone. */
  const remote = useCallback(
    async <T,>(fn: (url: string, token: string) => Promise<T>): Promise<T | undefined> => {
      const l = link.current;
      if (!l) return undefined;
      try {
        return await fn(l.board.url, l.token);
      } catch (e) {
        checkAuth(e);
        throw e;
      }
    },
    [checkAuth],
  );

  /* ---------- Espaces ---------- */

  const add = useCallback(
    async (input: SpaceInput) => {
      const space = (await remote((url, token) => boardApi.add(url, token, input))) ?? { ...input, id: newId(), addedAt: Date.now() };
      save([...spacesRef.current, space]);
      return space;
    },
    [remote, save],
  );

  const update = useCallback(
    async (id: string, input: SpaceInput) => {
      await remote((url, token) => boardApi.update(url, token, id, input));
      const old = spacesRef.current.find((s) => s.id === id);
      // Nouvelle adresse : l'ancienne session ne sert plus.
      if (old && hostOf(old.base) !== hostOf(input.base)) await Installer.clearSiteData(spaceUrl(old)).catch(() => 0);
      save(spacesRef.current.map((s) => (s.id === id ? { ...s, ...input } : s)));
    },
    [remote, save],
  );

  const forget = useCallback(async (id: string) => {
    const s = spacesRef.current.find((x) => x.id === id);
    if (s) await Installer.clearSiteData(spaceUrl(s)).catch(() => 0);
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await remote((url, token) => boardApi.remove(url, token, id)).catch((e) => {
        // Déjà supprimé sur le Board : il ne reste qu'à le retirer d'ici.
        if (!(e instanceof BoardError && e.code === "not_found")) throw e;
      });
      const s = spacesRef.current.find((x) => x.id === id);
      // Un autre espace sur le même site garde sa session.
      if (s && !spacesRef.current.some((x) => x.id !== id && hostOf(x.base) === hostOf(s.base))) {
        await Installer.clearSiteData(spaceUrl(s)).catch(() => 0);
      }
      save(spacesRef.current.filter((x) => x.id !== id));
    },
    [remote, save],
  );

  const touch = useCallback(
    (id: string) => {
      save(spacesRef.current.map((s) => (s.id === id ? { ...s, openedAt: Date.now() } : s)));
      remote((url, token) => boardApi.opened(url, token, id)).catch(() => {});
    },
    [remote, save],
  );

  // Au démarrage, puis à chaque retour dans Kosmy : la liste du Board.
  useEffect(() => {
    if (ready) sync();
  }, [ready, sync]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      const l = link.current;
      if (s === "active" && l && Date.now() - (l.board.syncedAt ?? 0) > SYNC_EVERY_MS) sync();
    });
    return () => sub.remove();
  }, [sync]);

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
      board,
      syncing,
      syncError,
      linkBoard,
      sync,
      unlinkBoard,
    }),
    [
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
      unlocked,
      unlock,
      board,
      syncing,
      syncError,
      linkBoard,
      sync,
      unlinkBoard,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin doit être utilisé dans <AdminProvider>");
  return v;
}
