import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Linking } from "react-native";

import { useAdmin } from "../admin/AdminProvider";
import { checkNotifications, ensureChannel, startBackgroundChecks, stopBackgroundChecks } from "./board-notifications";

/** Appli ouverte : on redemande au Board toutes les minutes. */
const FOREGROUND_EVERY_MS = 60_000;

type Permission = "granted" | "denied" | "undetermined";

interface NotificationsState {
  /** Notifications non lues sur le Board (null : pas relié, ou pas encore su). */
  unread: number | null;
  setUnread: (n: number | null) => void;
  /** Le téléphone autorise Kosmy à afficher des notifications. */
  permission: Permission;
  /** Demande l'autorisation (ou ouvre les réglages d'Android si elle a été refusée). */
  enable: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<NotificationsState | null>(null);

const toPermission = (p: Notifications.NotificationPermissionsStatus | null): Permission =>
  p?.granted ? "granted" : p?.canAskAgain === false ? "denied" : "undetermined";

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { board } = useAdmin();
  const linked = Boolean(board);
  const [unread, setUnread] = useState<number | null>(null);
  const [permission, setPermission] = useState<Permission>("undetermined");
  const asked = useRef(false);

  const refresh = useCallback(
    () =>
      checkNotifications().then((n) => {
        if (n !== null) setUnread(n);
      }),
    [],
  );

  const readPermission = useCallback(
    () =>
      Notifications.getPermissionsAsync()
        .catch(() => null)
        .then((p) => {
          const v = toPermission(p);
          setPermission(v);
          return v;
        }),
    [],
  );

  const enable = useCallback(async () => {
    await ensureChannel().catch(() => {});
    const now = toPermission(await Notifications.getPermissionsAsync().catch(() => null));
    if (now === "denied") {
      Linking.openSettings().catch(() => {});
      return;
    }
    setPermission(now === "granted" ? now : toPermission(await Notifications.requestPermissionsAsync().catch(() => null)));
  }, []);

  // Relié au Board : vérification en arrière-plan, et on demande l'autorisation une fois (Android 13 et plus).
  useEffect(() => {
    if (!linked) {
      stopBackgroundChecks().catch(() => {});
      return;
    }
    startBackgroundChecks().catch(() => {});
    Notifications.getPermissionsAsync()
      .catch(() => null)
      .then((p) => {
        const v = toPermission(p);
        setPermission(v);
        if (v === "undetermined" && !asked.current) {
          asked.current = true;
          enable();
        }
      });
    checkNotifications().then((n) => {
      if (n !== null) setUnread(n);
    });
  }, [linked, enable]);

  // Appli ouverte : au retour au premier plan, puis toutes les minutes.
  useEffect(() => {
    if (!linked) return;
    let timer: ReturnType<typeof setInterval> | null = setInterval(refresh, FOREGROUND_EVERY_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        readPermission();
        refresh();
        timer ??= setInterval(refresh, FOREGROUND_EVERY_MS);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [linked, refresh, readPermission]);

  // Toucher une notification du Board ouvre l'écran Notifications (aussi quand elle a lancé l'appli).
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      if (r?.notification.request.content.data?.kosmy !== "board") return;
      Notifications.clearLastNotificationResponse();
      router.push("/notifications");
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);

  const value = useMemo(
    () => ({ unread: linked ? unread : null, setUnread, permission, enable, refresh }),
    [linked, unread, permission, enable, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBoardNotifications() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBoardNotifications hors de NotificationsProvider");
  return v;
}
