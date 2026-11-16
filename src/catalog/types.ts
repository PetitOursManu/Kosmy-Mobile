/** Format du fichier catalog/catalog.json (partagé avec le site à terme). */

export type Lang = "fr" | "en";
export type Localized<T> = Record<Lang, T>;

export interface Theme {
  id: string;
  name: Localized<string>;
  /** Anneau sur l'accueil : rayon dans un repère de 540 × 540, durée d'un tour en secondes, angle de départ. */
  orbit: { radius: number; duration: number; start: number };
}

export interface AndroidRelease {
  /** Nom affiché de la version Android (ex. « Dashy Mobile »). */
  name: string;
  /** Identifiant du package Android (applicationId). */
  package: string;
  /** Dépôt GitHub qui publie l'APK dans ses releases. */
  repo: string;
  /** Facultatif : expression régulière pour choisir l'APK parmi les fichiers de la release. */
  assetPattern?: string;
}

export interface CatalogApp {
  id: string;
  n: string;
  name: string;
  theme: string;
  color: string;
  /** Couleur du texte posé sur `color`. */
  ink: string;
  /** Tuile claire derrière les logos transparents. */
  tile?: string;
  /** Chemin relatif au fichier catalog.json. */
  logo: string;
  repo: string;
  platforms: string[];
  text: Localized<{ line: string; more: string }>;
  android?: AndroidRelease;
}

export interface Catalog {
  schema: number;
  updated: string;
  github: string;
  kosmy: { repo: string; package: string };
  themes: Theme[];
  apps: CatalogApp[];
}
