// Web Audio API synthesized sound engine
// All sounds are generated programmatically — no external audio files needed

let audioCtx: AudioContext | null = null;
let isMuted = false;
let masterVolume = 1;
let unlockBound = false;

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctor: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    audioCtx = new Ctor();
  }
  // Browsers/iOS require a user gesture before audio plays. If the context is
  // suspended, kick a resume — safe to call repeatedly. A global one-time
  // pointer/touch handler below also unlocks it on the first interaction.
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Attach a one-time listener that unlocks WebAudio on the first user gesture. */
export function bindAudioUnlock() {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;
  const unlock = () => {
    try { getCtx(); } catch { /* ignore */ }
  };
  ["pointerdown", "touchstart", "keydown", "click"].forEach((evt) =>
    window.addEventListener(evt, unlock, { once: false, passive: true })
  );
}

/** Multiplies all sound gains. 0..1. Persisted so the whole app respects volume. */
export function setMasterVolume(v: number) {
  masterVolume = Math.max(0, Math.min(1, v));
  localStorage.setItem("bbdSoundVolume", String(masterVolume));
}

export function getMasterVolume(): number {
  const stored = localStorage.getItem("bbdSoundVolume");
  if (stored !== null) {
    const n = parseFloat(stored);
    if (Number.isFinite(n)) masterVolume = Math.max(0, Math.min(1, n));
  }
  return masterVolume;
}

function vol(base: number): number {
  return base * getMasterVolume();
}

export function setMuted(muted: boolean) {
  isMuted = muted;
  localStorage.setItem("bbdSoundMuted", muted ? "1" : "0");
}

export function getMuted(): boolean {
  const stored = localStorage.getItem("bbdSoundMuted");
  if (stored !== null) isMuted = stored === "1";
  return isMuted;
}

function safePlay(fn: () => void) {
  if (getMuted()) return;
  try { fn(); } catch { /* ignore audio errors */ }
}

// ── Heartbeat: low thump ──
export function playHeartbeat(rate: "slow" | "normal" | "fast" = "normal") {
  safePlay(() => {
    const ctx = getCtx();
    const bpm = rate === "slow" ? 60 : rate === "normal" ? 80 : 110;
    const interval = 60 / bpm;
    const vol = rate === "fast" ? 0.12 : 0.08;

    for (let i = 0; i < 4; i++) {
      const t = ctx.currentTime + i * interval;
      // First thump
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(55, t);
      osc1.frequency.exponentialRampToValueAtTime(35, t + 0.1);
      gain1.gain.setValueAtTime(vol, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc1.connect(gain1).connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.15);

      // Second thump (slightly delayed)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(50, t + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(30, t + 0.22);
      gain2.gain.setValueAtTime(vol * 0.7, t + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(t + 0.12);
      osc2.stop(t + 0.25);
    }
  });
}

// ── Soft chime: positive feedback ──
export function playChime() {
  safePlay(() => {
    const ctx = getCtx();
    const t = ctx.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.06, t + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.4);
    });
  });
}

// ── Success chime: ascending tones ──
export function playSuccess() {
  safePlay(() => {
    const ctx = getCtx();
    const t = ctx.currentTime;
    [440, 554, 659, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.07, t + i * 0.1 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.5);
    });
  });
}

// ── Soft tap: single click feedback ──
export function playTap() {
  safePlay(() => {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.05);
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  });
}

// ── Deep ambient: warm low tone ──
export function playAmbient() {
  safePlay(() => {
    const ctx = getCtx();
    const t = ctx.currentTime;
    [110, 165, 220].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.03, t + 0.5);
      gain.gain.linearRampToValueAtTime(0.03, t + 2);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 3);
    });
  });
}

// ── Rising tension: ascending sweep ──
export function playRising() {
  safePlay(() => {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 2);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.04, t + 0.3);
    gain.gain.linearRampToValueAtTime(0.04, t + 1.5);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 2);
  });
}

// ── Impact hit: deep thud for score reveal ──
export function playImpact() {
  safePlay(() => {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.3);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);

    // Layer white noise burst
    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    noise.buffer = buffer;
    noiseGain.gain.setValueAtTime(0.06, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    noise.connect(noiseGain).connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.1);
  });
}

// ── Health alert sound ──
// BBDO uses ONE sound everywhere: the Hummingbird chirp. Health alerts used to
// play a siren sweep before the chime, which sounded like noise on Android.
export function playCriticalHealthAlert() {
  return playHummingbirdChirp();
}

// ── Warm uplifting tone ──
export function playWarm() {
  safePlay(() => {
    const ctx = getCtx();
    const t = ctx.currentTime;
    [261, 329, 392, 523].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.04, t + i * 0.15 + 0.1);
      gain.gain.linearRampToValueAtTime(0.04, t + i * 0.15 + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 1.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.15);
      osc.stop(t + i * 0.15 + 1.2);
    });
  });
}

// ── Reset chime: single clear tone (break pattern) ──
export function playResetChime() {
  safePlay(() => {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1047; // C6
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.2);
  });
}

// ── Hummingbird chirp: high-pitched trills ──
export function playHummingbirdChirp() {
  safePlay(() => {
    const ctx = getCtx();
    const t = ctx.currentTime;

    // Rapid trill sequence — 3 short chirps
    const chirps = [
      { freq: 4200, delay: 0 },
      { freq: 4800, delay: 0.12 },
      { freq: 5200, delay: 0.22 },
      { freq: 4600, delay: 0.4 },
      { freq: 5000, delay: 0.5 },
    ];

    chirps.forEach(({ freq, delay }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t + delay);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.85, t + delay + 0.06);

      filter.type = "bandpass";
      filter.frequency.value = freq;
      filter.Q.value = 8;

      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.06, t + delay + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.08);

      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.1);
    });

    // Wing flutter — soft high-frequency buzz
    const flutter = ctx.createOscillator();
    const flutterGain = ctx.createGain();
    flutter.type = "triangle";
    flutter.frequency.value = 80; // Wing beat rate
    const flutterMod = ctx.createOscillator();
    const modGain = ctx.createGain();
    flutterMod.type = "sine";
    flutterMod.frequency.value = 3200;
    modGain.gain.value = 2000;
    flutterMod.connect(modGain).connect(flutter.frequency);

    flutterGain.gain.setValueAtTime(0, t);
    flutterGain.gain.linearRampToValueAtTime(0.015, t + 0.1);
    flutterGain.gain.linearRampToValueAtTime(0.015, t + 0.5);
    flutterGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

    flutter.connect(flutterGain).connect(ctx.destination);
    flutter.start(t);
    flutter.stop(t + 0.8);
    flutterMod.start(t);
    flutterMod.stop(t + 0.8);
  });
}

// ── Level unlock: game-style ascending ──
export function playUnlock() {
  safePlay(() => {
    const ctx = getCtx();
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.08, t + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.6);
    });
  });
}

// ── BBDO Signature notification: recognizable brand sound ──
// Two-note rising fifth (E5→B5) sine chime with a hummingbird shimmer tail.
// Short, warm, distinctive — meant to be the "you got a BBDO ping" identity.
export function playBbdoNotification() {
  safePlay(() => {
    const ctx = getCtx();
    const t = ctx.currentTime;

    // Two-note chime E5 (659Hz) → B5 (988Hz), 90ms apart
    [
      { freq: 659, delay: 0, dur: 0.55, gain: 0.11 },
      { freq: 988, delay: 0.09, dur: 0.7, gain: 0.09 },
    ].forEach(({ freq, delay, dur, gain }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(vol(gain), t + delay + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + dur);

      // Perfect fifth harmonic on top for warmth
      const harm = ctx.createOscillator();
      const hg = ctx.createGain();
      harm.type = "sine";
      harm.frequency.value = freq * 1.5;
      hg.gain.setValueAtTime(0, t + delay);
      hg.gain.linearRampToValueAtTime(vol(gain * 0.35), t + delay + 0.015);
      hg.gain.exponentialRampToValueAtTime(0.001, t + delay + dur * 0.8);
      harm.connect(hg).connect(ctx.destination);
      harm.start(t + delay);
      harm.stop(t + delay + dur);
    });

    // Hummingbird shimmer tail — bandpassed high tick at the end
    const shimmer = ctx.createOscillator();
    const sg = ctx.createGain();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 4200;
    bp.Q.value = 6;
    shimmer.type = "triangle";
    shimmer.frequency.setValueAtTime(3600, t + 0.18);
    shimmer.frequency.exponentialRampToValueAtTime(5200, t + 0.32);
    sg.gain.setValueAtTime(0, t + 0.18);
    sg.gain.linearRampToValueAtTime(vol(0.04), t + 0.2);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    shimmer.connect(bp).connect(sg).connect(ctx.destination);
    shimmer.start(t + 0.18);
    shimmer.stop(t + 0.45);
  });
}

export type BbdoNotificationSound =
  | "bbdo_signature"
  | "chime"
  | "hummingbird"
  | "warm"
  | "tap"
  | "unlock";

export const NOTIFICATION_SOUND_OPTIONS: { value: BbdoNotificationSound; label: string; hint: string }[] = [
  { value: "hummingbird", label: "Hummingbird", hint: "The single BBDO notification sound — used on web, iOS and Android push" },
];

/**
 * Unified notification sound. BBDO uses ONE sound everywhere (web, in-app,
 * native push on iOS + Android): the Hummingbird trill. The variant argument
 * is accepted for backwards compatibility but always resolves to hummingbird.
 */
export function playNotificationSound(_variant: BbdoNotificationSound = "hummingbird") {
  return playHummingbirdChirp();
}
