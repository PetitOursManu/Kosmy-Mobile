import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ImageSource } from "expo-image";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import bundledJson from "../../catalog/catalog.json";
import { CATALOG_URL } from "../config";
import type { Catalog, CatalogApp, Theme } from "./types";

const bundled = bundledJson as Catalog;
const CACHE_KEY = "kosmy.catalog.v1";

/** Logos embarqués dans l'APK : affichés tout de suite, et hors ligne. */
const BUNDLED_LOGOS: Record<string, number> = {
  "logos/mocky.png": require("../../catalog/logos/mocky.png"),
  "logos/dashy.png": require("../../catalog/logos/dashy.png"),
  "logos/soundy.png": require("../../catalog/logos/soundy.png"),
  "logos/lumy.png": require("../../catalog/logos/lumy.png"),
  "logos/kanby.png": require("../../catalog/logos/kanby.png"),
  "logos/calendy.png": require("../../catalog/logos/calendy.png"),
  "logos/crafty.png": require("../../catalog/logos/crafty.png"),
  "logos/cleardoc.png": require("../../catalog/logos/cleardoc.png"),
};

type Source = "bundled" | "cache" | "remote";

interface CatalogState {
  catalog: Catalog;
  source: Source;
  refreshing: boolean;
  refresh: () => Promise<void>;
  themeById: Record<string, Theme>;
  appById: Record<string, CatalogApp>;
  logo: (app: CatalogApp) => { source: ImageSource | number; placeholder?: number };
}

const Ctx = createContext<CatalogState | null>(null);

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Vérifie le catalogue lu en ligne. Les entrées incomplètes sont ignorées plutôt que de tout casser. */
export function sanitize(raw: unknown): Catalog | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<Catalog>;
  if (c.schema !== 1 || !Array.isArray(c.themes) || !Array.isArray(c.apps)) return null;
  const themes = c.themes.filter(
    (t) => isStr(t?.id) && isStr(t?.name?.fr) && typeof t?.orbit?.radius === "number" && typeof t?.orbit?.duration === "number",
  );
  const ids = new Set(themes.map((t) => t.id));
  const apps = c.apps.filter(
    (a) =>
      isStr(a?.id) && isStr(a?.name) && ids.has(a?.theme) && isStr(a?.color) && isStr(a?.logo) && isStr(a?.repo) &&
      isStr(a?.text?.fr?.line) &&
      (a.android === undefined || (isStr(a.android.package) && isStr(a.android.repo) && isStr(a.android.name))),
  );
  if (!apps.length) return null;
  return {
    schema: 1,
    updated: isStr(c.updated) ? c.updated : "",
    github: isStr(c.github) ? c.github : bundled.github,
    kosmy: c.kosmy && isStr(c.kosmy.repo) && isStr(c.kosmy.package) ? c.kosmy : bundled.kosmy,
    themes,
    apps: apps.map((a) => ({ ...a, ink: a.ink || "#0d0c0a", platforms: Array.isArray(a.platforms) ? a.platforms : [] })),
  };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog>(bundled);
  const [source, setSource] = useState<Source>("bundled");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(CATALOG_URL, { headers: { "Cache-Control": "no-cache" } });
      if (!res.ok) return;
      const fresh = sanitize(await res.json());
      if (!fresh) return;
      setCatalog(fresh);
      setSource("remote");
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh)).catch(() => {});
    } catch {
      // Hors ligne : on garde la dernière version connue.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(CACHE_KEY)
      .then((s) => {
        const cached = s ? sanitize(JSON.parse(s)) : null;
        if (alive && cached) {
          setCatalog(cached);
          setSource("cache");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) refresh();
      });
    return () => {
      alive = false;
    };
  }, [refresh]);

  const value = useMemo<CatalogState>(() => {
    const base = CATALOG_URL.slice(0, CATALOG_URL.lastIndexOf("/") + 1);
    return {
      catalog,
      source,
      refreshing,
      refresh,
      themeById: Object.fromEntries(catalog.themes.map((t) => [t.id, t])),
      appById: Object.fromEntries(catalog.apps.map((a) => [a.id, a])),
      logo: (app) => {
        const local = BUNDLED_LOGOS[app.logo];
        if (source === "bundled" && local) return { source: local };
        const remote = /^https?:/.test(app.logo) ? app.logo : base + app.logo;
        return { source: { uri: remote, cacheKey: remote }, placeholder: local };
      },
    };
  }, [catalog, source, refreshing, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalog() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCatalog doit être utilisé dans <CatalogProvider>");
  return v;
}
