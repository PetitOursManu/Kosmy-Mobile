import AsyncStorage from "@react-native-async-storage/async-storage";

import { GITHUB_API } from "../config";

export interface ReleaseAsset {
  name: string;
  size: number;
  url: string;
}

export interface Release {
  tag: string;
  name: string;
  publishedAt: string;
  notes: string;
  htmlUrl: string;
  assets: ReleaseAsset[];
}

interface Cached {
  etag: string | null;
  release: Release;
}

const key = (owner: string, repo: string) => `kosmy.release.${owner}/${repo}`;

/**
 * Dernière release publiée d'un dépôt (API GitHub Releases, sans jeton).
 * La réponse est gardée avec son ETag : une requête conditionnelle qui répond 304
 * ne compte pas dans la limite de 60 requêtes par heure.
 */
export async function fetchLatestRelease(owner: string, repo: string): Promise<Release> {
  const k = key(owner, repo);
  const cached: Cached | null = await AsyncStorage.getItem(k)
    .then((s) => (s ? (JSON.parse(s) as Cached) : null))
    .catch(() => null);

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (cached?.etag) headers["If-None-Match"] = cached.etag;

  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/releases/latest`, { headers });
  } catch {
    if (cached) return cached.release;
    throw new Error("Pas de connexion à GitHub");
  }

  if (res.status === 304 && cached) return cached.release;
  if (!res.ok) {
    if (cached) return cached.release;
    if (res.status === 404) throw new Error("Aucune release publiée");
    if (res.status === 403 || res.status === 429) throw new Error("Limite de l'API GitHub atteinte, réessayez dans un moment");
    throw new Error(`GitHub a répondu ${res.status}`);
  }

  const j = await res.json();
  const release: Release = {
    tag: String(j.tag_name ?? ""),
    name: String(j.name || j.tag_name || ""),
    publishedAt: String(j.published_at ?? ""),
    notes: String(j.body ?? ""),
    htmlUrl: String(j.html_url ?? ""),
    assets: (Array.isArray(j.assets) ? j.assets : []).map((a: any) => ({
      name: String(a.name),
      size: Number(a.size) || 0,
      url: String(a.browser_download_url),
    })),
  };
  await AsyncStorage.setItem(k, JSON.stringify({ etag: res.headers.get("etag"), release } satisfies Cached)).catch(() => {});
  return release;
}

const ABIS = ["arm64-v8a", "armeabi-v7a", "x86_64", "x86"];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const abiIn = (name: string, abi: string) => new RegExp(`(^|[-_.])${escape(abi)}(?=[-.]|$)`, "i").test(name);

/**
 * Choisit l'APK qui convient à l'appareil : celui de son architecture
 * (dans l'ordre de préférence d'Android), sinon un APK universel.
 */
export function pickApk(assets: ReleaseAsset[], deviceAbis: string[], pattern?: string): ReleaseAsset | null {
  let apks = assets.filter((a) => /\.apk$/i.test(a.name));
  if (pattern) {
    try {
      const re = new RegExp(pattern, "i");
      apks = apks.filter((a) => re.test(a.name));
    } catch {
      // Expression invalide dans le catalogue : on l'ignore.
    }
  }
  for (const abi of deviceAbis) {
    const match = apks.find((a) => abiIn(a.name, abi));
    if (match) return match;
  }
  return apks.find((a) => !ABIS.some((abi) => abiIn(a.name, abi))) ?? null;
}

/** "v1.5.7" → [1, 5, 7] ; null si le texte ne contient pas de numéro de version. */
export function parseVersion(v: string | null | undefined): number[] | null {
  const m = String(v ?? "").match(/\d+(?:\.\d+)*/);
  return m ? m[0].split(".").map(Number) : null;
}

export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

export const formatSize = (bytes: number) =>
  bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(bytes / 1e3))} Ko`;
