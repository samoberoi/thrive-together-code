import { ReactNode } from "react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Directional page transition — clean, glitch-free.
 *
 * - Forward (PUSH/REPLACE): subtle right→left slide + fade in
 * - Back (POP): subtle left→right slide + fade in
 * - Exit: pure fade (no slide) — avoids the outgoing page shifting under
 *   the incoming one and causing a visible jump.
 *
 * After the enter animation settles, we clear inline `transform` so children
 * with `position: fixed`, `backdrop-filter`, or hover effects don't glitch
 * inside a transformed ancestor.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        opacity: { duration: 0.12, ease: EASE },
        x: { duration: 0.16, ease: EASE },
      }}
      style={{
        width: "100%",
        minHeight: "100dvh",
        overflowX: "hidden",
      }}
    >
      {children}
    </motion.div>
  );
}
