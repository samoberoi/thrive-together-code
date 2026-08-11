import { MessageCircle } from "lucide-react";

export const EXPERT_CONNECT_NUMBER = "919220421100";

const CACHE_KEY = "bbdo_package_key";

export function cachePackageKey(key: string | null) {
  try {
    if (key) localStorage.setItem(CACHE_KEY, key);
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function readCachedPackageKey(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}

function openWhatsApp(context?: string) {
  const text = encodeURIComponent(
    context ? `Hi BBDO team, I need help with ${context}.` : "Hi BBDO team, I need help.",
  );
  window.open(`https://wa.me/${EXPERT_CONNECT_NUMBER}?text=${text}`, "_blank", "noopener,noreferrer");
}

/**
 * Expert Connect — WhatsApp support bar shown only for Package 1 (foundation) users.
 * Resolves the tier synchronously (prop first, then cached value) so it renders
 * in the same frame as the "All sections" sheet — no pop-in.
 */
export default function ExpertConnectBar({
  packageKey,
  context,
  className = "",
}: {
  packageKey?: string | null;
  context?: string;
  className?: string;
}) {
  const key = packageKey ?? readCachedPackageKey();
  const isFoundation = key === "foundation" || key === "starter";
  if (!isFoundation) return null;

  return (
    <button
      type="button"
      onClick={() => openWhatsApp(context)}
      aria-label="Expert Connect on WhatsApp"
      className={`no-pill w-full flex items-center justify-center gap-2 rounded-2xl h-12 px-4 text-white font-black tracking-tight shadow-card active:scale-[0.99] transition-transform ${className}`}
      style={{ background: "#25D366" }}
    >
      <span className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center shrink-0">
        <MessageCircle className="w-4 h-4" strokeWidth={2.2} />
      </span>
      <span className="text-[15px]">Expert Connect</span>
    </button>
  );
}
