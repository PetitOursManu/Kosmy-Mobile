// Génère l'icône adaptative, l'icône classique et l'image de démarrage
// à partir du logo officiel (assets/brand/kosmy-logo.webp, fond noir).
// Usage : node scripts/make-icons.mjs
import sharp from "sharp";

const SRC = "assets/brand/kosmy-logo.webp";
const BG = { r: 0x0d, g: 0x0c, b: 0x0a };

// 1. Détourage : le fond du logo est noir, on transforme la luminosité en opacité.
const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const rgba = Buffer.alloc(W * H * 4);
const black = [4, 3, 3];
for (let i = 0, j = 0; i < W * H * C; i += C, j += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const m = Math.max(r, g, b);
  let a = (m - 14) / (238 - 14);
  a = a <= 0.04 ? 0 : Math.min(1, a);
  if (a === 0) continue;
  const un = (c, k) => Math.max(0, Math.min(255, Math.round((c - black[k] * (1 - a)) / a)));
  rgba[j] = un(r, 0);
  rgba[j + 1] = un(g, 1);
  rgba[j + 2] = un(b, 2);
  rgba[j + 3] = Math.round(a * 255);
}

// Carré centré sur le dessin (K + anneau) : bornes mesurées 198–1064 × 290–954.
const CX = 631, CY = 622, R = 470;
const crop = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: CX - R, top: CY - R, width: 2 * R, height: 2 * R })
  .png()
  .toBuffer();

const mark = (size) => sharp(crop).resize(size, size).png().toBuffer();
const onCanvas = async (canvas, inner, background, out) => {
  const pad = Math.round((canvas - inner) / 2);
  await sharp({ create: { width: canvas, height: canvas, channels: 4, background } })
    .composite([{ input: await mark(inner), left: pad, top: pad }])
    .png()
    .toFile(out);
};
const clear = { r: 0, g: 0, b: 0, alpha: 0 };

// Icône adaptative : zone sûre = cercle de 66/108 du calque.
await onCanvas(1024, 640, clear, "assets/android-icon-foreground.png");
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { ...BG, alpha: 1 } } })
  .png()
  .toFile("assets/android-icon-background.png");
// Monochrome (icônes à thème d'Android 13+) : silhouette blanche.
const fg = await sharp("assets/android-icon-foreground.png").raw().toBuffer({ resolveWithObject: true });
const mono = Buffer.from(fg.data);
for (let i = 0; i < mono.length; i += 4) mono[i] = mono[i + 1] = mono[i + 2] = 255;
await sharp(mono, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toFile("assets/android-icon-monochrome.png");

// Icône classique et favicon.
await onCanvas(1024, 860, { ...BG, alpha: 1 }, "assets/icon.png");
await onCanvas(196, 164, { ...BG, alpha: 1 }, "assets/favicon.png");

// Image de démarrage et logo pour l'interface (transparents).
// Android 12+ découpe l'icône de démarrage en cercle de 2/3 de sa largeur : le dessin (anneau compris)
// va jusqu'à 0,57 × sa taille depuis le centre, donc 630 px sur 1024 le gardent dans le cercle de 341 px.
await onCanvas(1024, 630, clear, "assets/splash-icon.png");
await sharp(crop).resize(720, 720).png().toFile("assets/brand/kosmy-mark.png");

console.log("Icônes générées.");
