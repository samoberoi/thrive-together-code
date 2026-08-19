/**
 * Steps → distance / calories math + a canvas renderer for the shareable
 * "Steps today" card. Everything is an estimate derived from the device step
 * count, the user's height (stride length) and weight (energy cost of walking).
 */

import bbdoLogoAsset from "@/assets/bbdo-logo.png.asset.json";

/** Stride length in metres. Standard anthropometric estimate: 0.415 × height. */
export function strideMetres(heightCm?: number | null): number {
  if (heightCm && heightCm > 90 && heightCm < 230) return (heightCm * 0.415) / 100;
  return 0.72; // sensible adult default
}

export function stepsToKm(steps: number, heightCm?: number | null): number {
  return (Math.max(0, steps) * strideMetres(heightCm)) / 1000;
}

/**
 * Walking energy cost ≈ 0.5 kcal per kg per km (net of resting metabolism this
 * is the widely used field estimate for moderate walking).
 */
export function stepsToCalories(steps: number, heightCm?: number | null, weightKg?: number | null): number {
  const w = weightKg && weightKg > 25 && weightKg < 300 ? weightKg : 70;
  return Math.round(stepsToKm(steps, heightCm) * w * 0.5);
}

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = (bbdoLogoAsset as any).url;
  });
}

export function formatShareDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** Draw the steps card to a PNG blob, ready to upload as a community image. */
export async function renderStepsCardPng(opts: {
  steps: number;
  km: number;
  calories: number;
  date?: Date;
  name?: string | null;
}): Promise<Blob | null> {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Card border
  ctx.strokeStyle = "#10B981";
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  const logo = await loadLogo();
  if (logo) {
    const lw = 190;
    const lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, 70, 70, lw, lh);
  }

  // Big open ring
  const cx = W / 2;
  const cy = H / 2 - 20;
  const r = 250;
  ctx.strokeStyle = "#0F1A3D";
  ctx.lineWidth = 34;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.82, Math.PI * 0.18, false);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#E00101";
  ctx.font = "900 74px system-ui, -apple-system, sans-serif";
  ctx.fillText("Steps", cx, cy - 40);

  ctx.fillStyle = "#0F1A3D";
  ctx.font = "900 120px system-ui, -apple-system, sans-serif";
  ctx.fillText(Math.round(opts.steps).toLocaleString("en-IN"), cx, cy + 70);

  // Calories / distance
  const y = cy + r + 90;
  ctx.font = "800 46px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#E00101";
  ctx.textAlign = "right";
  ctx.fillText("Calories", cx - 150, y);
  ctx.fillStyle = "#0F1A3D";
  ctx.textAlign = "left";
  ctx.fillText(` ${opts.calories.toLocaleString("en-IN")}`, cx - 145, y);

  ctx.fillStyle = "#E00101";
  ctx.textAlign = "right";
  ctx.fillText("Distance", cx + 250, y);
  ctx.fillStyle = "#0F1A3D";
  ctx.textAlign = "left";
  ctx.fillText(` ${opts.km.toFixed(1)} km`, cx + 255, y);

  // Date footer
  ctx.textAlign = "left";
  ctx.fillStyle = "#0F1A3D";
  ctx.font = "700 40px system-ui, -apple-system, sans-serif";
  ctx.fillText(formatShareDate(opts.date), 80, H - 90);

  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}
