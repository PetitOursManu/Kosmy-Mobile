import { Platform } from "react-native";

import type { AdminSpace, SpaceInput } from "./AdminProvider";

/**
 * Client de l'API de Kosmy Board (https://github.com/PetitOursManu/Kosmy-Board).
 * Le téléphone se connecte une fois et reçoit un jeton d'appareil, envoyé ensuite dans « Authorization: Bearer ».
 * Le Board ne connaît que la liste des espaces : les sessions des pages d'admin restent sur le téléphone.
 */

export interface BoardUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
}

export type LoginResult = { token: string; user: BoardUser } | { twoFactor: true; ticket: string };

export class BoardError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const TIMEOUT_MS = 15_000;

/** Nom de l'appareil, affiché dans « Appareils connectés » du Board. */
export function deviceName() {
  const c = Platform.constants as { Model?: string; Brand?: string };
  const model = Platform.OS === "android" && c.Model ? c.Model : Platform.OS;
  return `Kosmy Mobile · ${model}`.slice(0, 60);
}

async function call<T>(url: string, token: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url + path, {
      method,
      signal: ctrl.signal,
      // Pas de cookie : le jeton suffit, et le Board ignore les cookies quand Authorization est présent.
      credentials: "omit",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new BoardError("network");
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => null)) as (Record<string, unknown> & { error?: string }) | null;
  if (!res.ok) {
    const code = typeof data?.error === "string" ? data.error : res.status >= 500 ? "server" : "not_board";
    throw new BoardError(code, res.status, data ?? {});
  }
  if (!data || typeof data !== "object") throw new BoardError("not_board", res.status);
  return data as T;
}

/** Ne garde que les champs d'un espace admin (le Board en ajoute, comme la connexion unique). */
function toSpace(raw: AdminSpace): AdminSpace {
  return {
    id: String(raw.id),
    appId: raw.appId ?? null,
    name: String(raw.name),
    base: String(raw.base),
    path: String(raw.path),
    addedAt: Number(raw.addedAt) || Date.now(),
    ...(raw.openedAt ? { openedAt: Number(raw.openedAt) } : {}),
  };
}

export const boardApi = {
  /** Vérifie que l'adresse est bien celle d'un Kosmy Board prêt à l'emploi. */
  async check(url: string) {
    let st: { setupNeeded?: unknown; config?: { issuer?: unknown } };
    try {
      st = await call(url, null, "GET", "/api/state");
    } catch (e) {
      if (e instanceof BoardError && e.code === "network") throw e;
      throw new BoardError("not_board");
    }
    if (typeof st.setupNeeded !== "boolean" || typeof st.config?.issuer !== "string") throw new BoardError("not_board");
    if (st.setupNeeded) throw new BoardError("setup");
  },
  login: (url: string, email: string, password: string) =>
    call<LoginResult>(url, null, "POST", "/api/device/login", { email, password, device: deviceName() }),
  login2fa: (url: string, ticket: string, code: string) =>
    call<{ token: string; user: BoardUser }>(url, null, "POST", "/api/device/login/2fa", { ticket, code }),
  logout: (url: string, token: string) => call(url, token, "POST", "/api/logout", {}),

  me: async (url: string, token: string) => {
    const st = await call<{ user: BoardUser | null }>(url, token, "GET", "/api/state");
    if (!st.user) throw new BoardError("auth", 401);
    return st.user;
  },
  spaces: async (url: string, token: string) =>
    (await call<{ spaces: AdminSpace[] }>(url, token, "GET", "/api/spaces")).spaces.map(toSpace),
  importSpaces: (url: string, token: string, spaces: AdminSpace[]) =>
    call<{ added: number; skipped: number; invalid: number }>(url, token, "POST", "/api/spaces/import", spaces),
  add: async (url: string, token: string, input: SpaceInput) =>
    toSpace((await call<{ space: AdminSpace }>(url, token, "POST", "/api/spaces", input)).space),
  update: async (url: string, token: string, id: string, input: SpaceInput) =>
    toSpace((await call<{ space: AdminSpace }>(url, token, "PUT", `/api/spaces/${encodeURIComponent(id)}`, input)).space),
  remove: (url: string, token: string, id: string) => call(url, token, "DELETE", `/api/spaces/${encodeURIComponent(id)}`),
  opened: (url: string, token: string, id: string) => call(url, token, "POST", `/api/spaces/${encodeURIComponent(id)}/opened`, {}),
};

/** Message en français pour une erreur du Board. */
export function boardMessage(e: unknown): string {
  const err = e instanceof BoardError ? e : new BoardError("generic");
  switch (err.code) {
    case "network":
      return "Le Board est injoignable. Vérifiez l'adresse et la connexion du téléphone.";
    case "not_board":
      return "Cette adresse ne répond pas comme un Kosmy Board.";
    case "setup":
      return "Ce Board n'est pas encore configuré : créez d'abord le compte administrateur dans un navigateur.";
    case "login_failed":
      return "E-mail ou mot de passe incorrect.";
    case "locked": {
      const wait = Number(err.extra.wait) || 60;
      return `Trop d'essais. Réessayez dans ${Math.max(1, Math.ceil(wait / 60))} min.`;
    }
    case "code":
      return "Code incorrect.";
    case "ticket":
      return "Trop d'essais ou trop d'attente : recommencez la connexion.";
    case "auth":
      return "La connexion au Board a expiré ou a été retirée. Reconnectez-vous.";
    case "not_found":
      return "Cet espace n'existe plus sur le Board. Tirez la liste vers le bas pour la mettre à jour.";
    case "too_many":
      return "Le Board a atteint le nombre maximal d'espaces.";
    case "name":
      return "Donnez un nom à cette appli.";
    case "server":
      return "Le Board a rencontré une erreur. Réessayez plus tard.";
    default:
      return err.status === 400 ? "Le Board refuse cette adresse. Vérifiez-la." : "Le Board n'a pas pu répondre. Réessayez.";
  }
}
