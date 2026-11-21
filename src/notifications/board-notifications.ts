import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { BOARD_KEY, TOKEN_KEY } from "../admin/keys";

/**
 * Notifications de Kosmy Board, sans service de Google : le téléphone demande au Board s'il y a du nouveau
 * (`GET /api/notifications?after=…`, avec le jeton d'appareil) et affiche une notification Android pour chacune.
 *
 * - Appli ouverte : à l'ouverture, au retour au premier plan, puis toutes les minutes.
 * - Appli fermée : tâche de fond d'Android (WorkManager), au mieux toutes les 15 minutes ; Android peut l'espacer
 *   davantage quand le téléphone est en veille ou en économie de batterie.
 */

export interface BoardNotification {
  id: number;
  title: string;
  body: string | null;
  url: string | null;
  createdAt: number;
  read: boolean;
  app: { name: string; appId: string | null; spaceId: string | null };
}

export const CHANNEL_ID = "kosmy-board";
export const TASK_NAME = "kosmy-board-notifications";
/** Dernière notification déjà vue par ce téléphone, pour ce Board et ce compte. */
const LAST_KEY = "kosmy.board.notifications.last.v1";
/** Au-delà, une seule notification résume les autres (le téléphone est resté longtemps sans demander). */
const MAX_SHOWN = 4;
const TIMEOUT_MS = 15_000;

interface Link {
  url: string;
  userId: string;
  token: string;
}

async function readLink(): Promise<Link | null> {
  const [raw, token] = await Promise.all([AsyncStorage.getItem(BOARD_KEY), SecureStore.getItemAsync(TOKEN_KEY).catch(() => null)]);
  if (!raw || !token) return null;
  try {
    const b = JSON.parse(raw) as { url?: unknown; user?: { id?: unknown } };
    if (typeof b.url !== "string" || typeof b.user?.id !== "string") return null;
    return { url: b.url, userId: b.user.id, token };
  } catch {
    return null;
  }
}

async function boardCall<T>(link: Link, method: string, path: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(link.url + path, {
      method,
      signal: ctrl.signal,
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${link.token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`board ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

type ListResult = { notifications: BoardNotification[]; unread: number };

/** La liste (pour l'écran Notifications). */
export async function fetchNotifications(): Promise<ListResult | null> {
  const link = await readLink();
  return link ? boardCall<ListResult>(link, "GET", "/api/notifications") : null;
}

/** Marque comme lues (toutes sans `ids`). Renvoie la liste à jour. */
export async function markRead(ids?: number[]): Promise<ListResult | null> {
  const link = await readLink();
  return link ? boardCall<ListResult>(link, "POST", "/api/notifications/read", ids ? { ids } : {}) : null;
}

/* ---------- Affichage ---------- */

export async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Kosmy Board",
    description: "Ce que vos applis reliées à Kosmy Board vous signalent (une nouvelle demande dans Soundy…).",
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: "#c5f04a",
  });
}

async function present(n: BoardNotification) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: n.title,
      body: n.body ?? undefined,
      // Android : affiché dans l'en-tête de la notification (nom de l'appli qui l'envoie).
      subtitle: n.app.name,
      color: "#c5f04a",
      data: { kosmy: "board", id: n.id, url: n.url, spaceId: n.app.spaceId },
    },
    trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null,
  });
}

/* ---------- Vérification ---------- */

let running: Promise<number | null> | null = null;

/**
 * Demande au Board les notifications arrivées depuis la dernière fois et les affiche.
 * Renvoie le nombre de non lues, ou null si le téléphone n'est pas relié (ou le Board injoignable).
 * La toute première fois, rien n'est affiché : on retient seulement où l'on en est (pas d'avalanche d'anciennes).
 */
export function checkNotifications(): Promise<number | null> {
  running ??= (async () => {
    try {
      const link = await readLink();
      if (!link) return null;
      const scope = `${link.url}|${link.userId}`;
      const saved = JSON.parse((await AsyncStorage.getItem(LAST_KEY)) || "null") as { scope: string; id: number } | null;
      const first = saved?.scope !== scope;
      const after = first ? 0 : saved.id;
      const r = await boardCall<ListResult>(link, "GET", `/api/notifications?after=${after}`);
      const fresh = r.notifications; // les plus récentes d'abord
      const last = fresh.length ? Math.max(...fresh.map((n) => n.id)) : after;
      if (!first) {
        const unread = fresh.filter((n) => !n.read).reverse();
        const perm = await Notifications.getPermissionsAsync();
        if (perm.granted && unread.length) {
          await ensureChannel();
          for (const n of unread.slice(-MAX_SHOWN)) await present(n);
          const more = unread.length - MAX_SHOWN;
          if (more > 0) {
            await Notifications.scheduleNotificationAsync({
              content: { title: `${more} autre${more > 1 ? "s" : ""} notification${more > 1 ? "s" : ""}`, body: "Ouvrez Kosmy pour tout voir.", data: { kosmy: "board" } },
              trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null,
            });
          }
        }
      }
      await AsyncStorage.setItem(LAST_KEY, JSON.stringify({ scope, id: last }));
      return r.unread;
    } catch {
      return null;
    } finally {
      running = null;
    }
  })();
  return running;
}

/* ---------- Tâche de fond ---------- */

// Doit être défini au chargement du module (portée globale) : Android peut lancer la tâche appli fermée.
TaskManager.defineTask(TASK_NAME, async () => {
  const r = await checkNotifications();
  return r === null ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
});

/** Vérification en arrière-plan : au mieux toutes les 15 minutes (Android décide). */
export async function startBackgroundChecks() {
  const status = await BackgroundTask.getStatusAsync().catch(() => BackgroundTask.BackgroundTaskStatus.Restricted);
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
  if (!(await TaskManager.isTaskRegisteredAsync(TASK_NAME).catch(() => false))) {
    await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: 15 });
  }
  return true;
}

export async function stopBackgroundChecks() {
  if (await TaskManager.isTaskRegisteredAsync(TASK_NAME).catch(() => false)) {
    await BackgroundTask.unregisterTaskAsync(TASK_NAME).catch(() => {});
  }
  await AsyncStorage.removeItem(LAST_KEY).catch(() => {});
}

/** Appli ouverte : les notifications s'affichent aussi en bandeau. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
