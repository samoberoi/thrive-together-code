import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@/assets/logo.png";
import { setPhase } from "@/lib/musicEngine";
import { useAuth } from "@/contexts/AuthContext";
import { resolvePostAuthRoute } from "@/lib/accessControl";

/**
 * Minimal, modern splash.
 *
 * Sequence (~2.8s):
 *  0.00s  Clean white canvas + soft brand gradient sweep
 *  0.10s  Logo mark fades + scales in
 *  0.50s  Wordmark letters cascade in
 *  1.10s  Hairline accent draws
 *  1.30s  Tagline fades in
 *  2.20s  Whole scene lifts + fades → route change
 */
export default function Splash() {
  const navigate = useNavigate();
  const { ready, session } = useAuth();
  const [gone, setGone] = useState(false);
  const [minimumSplashDone, setMinimumSplashDone] = useState(false);

  useEffect(() => {
    setPhase("reality");
    try {
      if (!localStorage.getItem("bb_language")) {
        localStorage.setItem("bb_language", "en");
      }
    } catch {
      /* ignore */
    }
    const tExit = window.setTimeout(() => setGone(true), 2600);
    const tReady = window.setTimeout(() => setMinimumSplashDone(true), 3000);

    return () => {
      window.clearTimeout(tExit);
      window.clearTimeout(tReady);
    };
  }, []);

  useEffect(() => {
    if (!minimumSplashDone || !ready) return;
    if (session) {
      let cancelled = false;
      void resolvePostAuthRoute(session.user.id, { missingProfileRoute: null }).then((route) => {
        if (!cancelled) navigate(route ?? "/reality-hook", { replace: true });
      });
      return () => {
        cancelled = true;
      };
    }
    navigate("/reality-hook", { replace: true });
  }, [minimumSplashDone, navigate, ready, session]);

  useEffect(() => {
    if (!ready) return;
    const failSafe = window.setTimeout(() => {
      try {
        setMinimumSplashDone(true);
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => {
      window.clearTimeout(failSafe);
    };
  }, [ready]);

  const EASE = [0.22, 1, 0.36, 1] as const;

  const wordmark = [
    { text: "Bye", color: "var(--bbdo-red)" },
    { text: "Bye", color: "var(--bbdo-red)" },
    { text: "Diabetes", color: "var(--bbdo-blue)" },
    { text: "&", color: "var(--bbdo-ink)" },
    { text: "Obesity", color: "var(--bbdo-blue)" },
  ];
  const acronym = [
    { text: "BB", color: "var(--bbdo-red)" },
    { text: "DO", color: "var(--bbdo-blue)" },
  ];

  return (
    <div className="min-h-dvh w-full relative overflow-hidden bg-background flex items-center justify-center px-6">
      {/* Subtle brand gradient wash — barely there */}
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: gone ? 0 : 1 }}
        transition={{ duration: 0.6, ease: EASE }}
        style={{
          background:
            "radial-gradient(60% 40% at 50% 35%, rgba(30,58,138,0.06) 0%, transparent 70%), radial-gradient(50% 35% at 50% 75%, rgba(230,57,70,0.05) 0%, transparent 70%)",
        }}
      />

      <AnimatePresence>
        {!gone && (
          <motion.div
            key="center"
            className="relative z-10 flex flex-col items-center"
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            {/* Logo mark */}
            <motion.div
              className="w-28 h-28 rounded-2xl bg-white flex items-center justify-center mb-8"
              style={{
                boxShadow:
                  "0 12px 32px -14px rgba(15,26,61,0.18), 0 0 0 1px rgba(15,26,61,0.04)",
              }}
              initial={{ opacity: 0, scale: 0.92, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.55, ease: EASE }}
            >
              <img
                src={logoImg}
                alt="BBDO"
                className="w-20 h-20 object-contain"
                onError={(e) => {
                  const t = e.currentTarget;
                  t.style.display = "none";
                }}
              />
            </motion.div>

            {/* Wordmark */}
            <h1 className="flex flex-wrap justify-center gap-x-2 text-[24px] sm:text-[28px] font-black tracking-tight leading-none">
              {wordmark.map((w, i) => (
                <motion.span
                  key={i}
                  style={{ color: w.color, display: "inline-block" }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.5 + i * 0.07,
                    duration: 0.45,
                    ease: EASE,
                  }}
                >
                  {w.text}
                </motion.span>
              ))}
            </h1>

            {/* Acronym (BBDO) */}
            <motion.h2
              className="flex justify-center text-[28px] sm:text-[32px] font-black tracking-tight leading-none mt-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.95, duration: 0.45, ease: EASE }}
            >
              {acronym.map((w, i) => (
                <span key={i} style={{ color: w.color }}>{w.text}</span>
              ))}
            </motion.h2>

            {/* Hairline */}
            <motion.div
              className="mt-6 h-px origin-center"
              style={{
                width: 56,
                background:
                  "linear-gradient(90deg, transparent, var(--bbdo-ink-soft), transparent)",
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.45, ease: EASE }}
            />

            {/* Tagline */}
            <motion.p
              className="mt-3 text-[10px] font-semibold tracking-[0.28em] uppercase text-muted-foreground"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3, duration: 0.45, ease: EASE }}
            >
              Start your reversal
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom progress hairline */}
      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 h-[2px] rounded-full overflow-hidden"
        style={{ width: 96, background: "rgba(15,26,61,0.08)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: gone ? 0 : 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <motion.div
          className="h-full"
          style={{
            background:
              "linear-gradient(90deg, var(--bbdo-blue), var(--bbdo-red))",
          }}
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ delay: 0.3, duration: 2.4, ease: EASE }}
        />
      </motion.div>
    </div>
  );
}
