/**
 * Steps → distance / calories math + a canvas renderer for the shareable
 * "Steps today" card. Everything is an estimate derived from the device step
 * count, the user's height (stride length) and weight (energy cost of walking).
 */

import bbdoLogo from "@/assets/logo.png";

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
    img.src = bbdoLogo;
  });
}

export function formatShareDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** Encouraging headline that scales with the day's effort. */
export function stepsHeadline(steps: number): { top: string; bottom: string } {
  if (steps >= 10000) return { top: "Great job!", bottom: "Keep moving." };
  if (steps >= 7000) return { top: "Almost there!", bottom: "Finish strong." };
  if (steps >= 3000) return { top: "Nice start!", bottom: "Keep moving." };
  return { top: "Every step counts.", bottom: "Let's move." };
}

const BLUE = "#1668D6";
const BLUE_LIGHT = "#5FA8F5";
const BLUE_SOFT = "#E7F0FD";
const RED = "#E8232A";
const INK = "#1F2A44";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
  const H = 1290;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // ---- Background: soft pearl gradient with blue/red brand waves --------
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#FFFFFF");
  bg.addColorStop(0.55, "#F5F8FE");
  bg.addColorStop(1, "#EAF1FC");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // faint dotted corner texture (top-right)
  ctx.fillStyle = "rgba(22,104,214,0.10)";
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 9; c++) {
      const x = W - 40 - c * 26;
      const y = 34 + r * 26;
      ctx.beginPath();
      ctx.arc(x, y, 4 - Math.min(3.4, (c + r) * 0.18), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // soft light waves (left side)
  ctx.save();
  ctx.strokeStyle = "rgba(22,104,214,0.07)";
  ctx.lineWidth = 26;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-60, 320 + i * 90);
    ctx.bezierCurveTo(180, 220 + i * 90, 120, 640 + i * 90, -40, 760 + i * 100);
    ctx.stroke();
  }
  ctx.restore();

  // bottom brand ribbon
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, H - 150);
  ctx.bezierCurveTo(W * 0.3, H - 230, W * 0.62, H - 60, W, H - 160);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  const ribbon = ctx.createLinearGradient(0, H - 200, W, H);
  ribbon.addColorStop(0, "#DCE9FB");
  ribbon.addColorStop(0.55, "#9CC5F5");
  ribbon.addColorStop(1, "#2C7BE5");
  ctx.fillStyle = ribbon;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, H - 78);
  ctx.bezierCurveTo(W * 0.35, H - 150, W * 0.7, H + 10, W, H - 70);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  const ribbon2 = ctx.createLinearGradient(0, H - 120, W, H);
  ribbon2.addColorStop(0, "#2C7BE5");
  ribbon2.addColorStop(1, RED);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = ribbon2;
  ctx.fill();
  ctx.restore();

  // ---- Logo ------------------------------------------------------------
  const logo = await loadLogo();
  if (logo) {
    const lw = 300;
    const lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, 66, 60, lw, lh);
  }

  // ---- Gauge -----------------------------------------------------------
  const cx = W / 2;
  const cy = 470;
  const r = 250;
  const START = Math.PI * 0.78;
  const SWEEP = Math.PI * 1.44;
  const pct = Math.max(0.03, Math.min(1, opts.steps / 10000));

  // inner disc + shadow
  ctx.save();
  ctx.shadowColor = "rgba(22,104,214,0.16)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(cx, cy, r - 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = 38;
  ctx.lineCap = "round";
  ctx.strokeStyle = BLUE_SOFT;
  ctx.beginPath();
  ctx.arc(cx, cy, r, START, START + SWEEP);
  ctx.stroke();

  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, BLUE);
  grad.addColorStop(1, BLUE_LIGHT);
  ctx.save();
  ctx.shadowColor = "rgba(22,104,214,0.35)";
  ctx.shadowBlur = 26;
  ctx.strokeStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, START, START + SWEEP * pct);
  ctx.stroke();
  ctx.restore();

  // ---- Gauge contents --------------------------------------------------
  ctx.textAlign = "center";
  ctx.fillStyle = RED;
  ctx.font = "900 62px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText("Steps", cx, cy - 66);

  // thin rules either side of "Steps"
  const sw = ctx.measureText("Steps").width;
  ctx.strokeStyle = "rgba(31,42,68,0.15)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - sw / 2 - 90, cy - 84);
  ctx.lineTo(cx - sw / 2 - 24, cy - 84);
  ctx.moveTo(cx + sw / 2 + 24, cy - 84);
  ctx.lineTo(cx + sw / 2 + 90, cy - 84);
  ctx.stroke();

  const numGrad = ctx.createLinearGradient(cx - 220, cy, cx + 220, cy + 60);
  numGrad.addColorStop(0, BLUE);
  numGrad.addColorStop(1, "#2C7BE5");
  ctx.fillStyle = numGrad;
  ctx.font = "900 132px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText(Math.round(opts.steps).toLocaleString("en-IN"), cx, cy + 58);

  // divider dot
  ctx.strokeStyle = "rgba(31,42,68,0.12)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 150, cy + 100);
  ctx.lineTo(cx - 16, cy + 100);
  ctx.moveTo(cx + 16, cy + 100);
  ctx.lineTo(cx + 150, cy + 100);
  ctx.stroke();
  ctx.fillStyle = BLUE;
  ctx.beginPath();
  ctx.arc(cx, cy + 100, 8, 0, Math.PI * 2);
  ctx.fill();

  const headline = stepsHeadline(opts.steps);
  ctx.fillStyle = INK;
  ctx.font = "700 52px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText(headline.top, cx, cy + 168);
  ctx.fillStyle = BLUE;
  ctx.font = "800 52px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText(headline.bottom, cx, cy + 232);

  // ---- Stat tiles ------------------------------------------------------
  const tileY = 880;
  const tileH = 190;
  const gap = 34;
  const tileW = (W - 130 * 2 - gap) / 2;

  // Calories tile
  ctx.fillStyle = "#FDECEC";
  roundRect(ctx, 130, tileY, tileW, tileH, 34);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(130 + 66, tileY + tileH / 2, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.font = "900 48px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🔥", 130 + 66, tileY + tileH / 2 + 18);
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "700 34px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText("Calories", 130 + 132, tileY + 66);
  ctx.fillStyle = RED;
  ctx.font = "900 62px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText(opts.calories.toLocaleString("en-IN"), 130 + 132, tileY + 130);
  ctx.fillStyle = "rgba(31,42,68,0.55)";
  ctx.font = "700 28px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText("kcal", 130 + 132, tileY + 168);

  // Distance tile
  const dx = 130 + tileW + gap;
  ctx.fillStyle = "#E9F1FD";
  roundRect(ctx, dx, tileY, tileW, tileH, 34);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(dx + 66, tileY + tileH / 2, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.font = "900 44px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText("📍", dx + 66, tileY + tileH / 2 + 16);
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "700 34px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText("Distance", dx + 132, tileY + 66);
  ctx.fillStyle = BLUE;
  ctx.font = "900 62px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText(opts.km.toFixed(1), dx + 132, tileY + 130);
  const kmW = ctx.measureText(opts.km.toFixed(1)).width;
  ctx.font = "700 32px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText(" km", dx + 132 + kmW + 8, tileY + 130);

  // ---- Quote -----------------------------------------------------------
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "600 42px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText("“ Every step is a step toward", cx, 1140);
  ctx.fillStyle = BLUE;
  ctx.font = "800 44px system-ui, -apple-system, Helvetica, sans-serif";
  ctx.fillText("better metabolic health.", cx, 1194);

  // ---- Date footer -----------------------------------------------------
  ctx.fillStyle = "#FFFFFF";
  const label = formatShareDate(opts.date);
  ctx.font = "800 34px system-ui, -apple-system, Helvetica, sans-serif";
  const lw2 = ctx.measureText(label).width;
  roundRect(ctx, cx - lw2 / 2 - 36, 1228, lw2 + 72, 60, 30);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fill();
  ctx.fillStyle = BLUE;
  ctx.fillText(label, cx, 1268);

  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}
