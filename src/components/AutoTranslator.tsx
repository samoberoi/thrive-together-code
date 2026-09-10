import { useEffect, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Real-time frontend translator.
 * - Persistent shared cache (server) hydrates a local map instantly on lang change.
 * - MutationObserver keeps navigation-triggered content translated with zero flash
 *   when the string is already cached.
 * - Only genuinely-new strings hit the AI, and those are persisted for everyone.
 */

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA"]);
const ORIGINAL = new WeakMap<Text, string>();
const CACHE_PREFIX = "bb_tr_cache_v2::";
// In-memory cache per language (also mirrored to localStorage for offline speed).
const memoryCache: Record<string, Record<string, string>> = {};
const primed: Record<string, boolean> = {};
// Text changes made by this component are also reported by MutationObserver.
// Ignore those records so translations containing Latin acronyms/numbers do not
// get mistaken for new English copy and translated forever.
const SELF_WRITTEN = new WeakSet<Text>();

function writeText(node: Text, value: string) {
  if (node.nodeValue === value) return;
  SELF_WRITTEN.add(node);
  node.nodeValue = value;
  // MutationObserver runs before the next task. Keep the marker through all
  // records in the current delivery, then release it for genuine React edits.
  window.setTimeout(() => SELF_WRITTEN.delete(node), 0);
}

function loadCache(lang: string): Record<string, string> {
  if (memoryCache[lang]) return memoryCache[lang];
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + lang);
    memoryCache[lang] = raw ? JSON.parse(raw) : {};
  } catch { memoryCache[lang] = {}; }
  return memoryCache[lang];
}
function saveCache(lang: string, cache: Record<string, string>) {
  memoryCache[lang] = cache;
  try { localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(cache)); } catch { /* ignore */ }
}

function shouldTranslate(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return false;
  if (SKIP_TAGS.has(parent.tagName)) return false;
  if (parent.closest("[data-no-translate]")) return false;
  const text = node.nodeValue ?? "";
  if (!text.trim()) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  return true;
}

function collectTextNodes(root: Node, out: Text[]) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => shouldTranslate(n as Text)
      ? NodeFilter.FILTER_ACCEPT
      : NodeFilter.FILTER_REJECT,
  });
  let n: Node | null = walker.nextNode();
  while (n) { out.push(n as Text); n = walker.nextNode(); }
}

function applyToAll(lang: string) {
  if (lang === "en") return;
  const cache = loadCache(lang);
  const nodes: Text[] = [];
  collectTextNodes(document.body, nodes);
  nodes.forEach((t) => {
    const original = ORIGINAL.get(t) ?? t.nodeValue ?? "";
    if (!ORIGINAL.has(t)) ORIGINAL.set(t, original);
    const key = original.trim();
    if (!key) return;
    const hit = cache[key];
    if (hit && t.nodeValue !== original.replace(key, hit)) {
      writeText(t, original.replace(key, hit));
    }
  });
}

export default function AutoTranslator() {
  const { lang } = useLanguage();
  const pendingRef = useRef<Set<Text>>(new Set());
  const flushTimerRef = useRef<number | null>(null);
  const langRef = useRef(lang);

  useEffect(() => {
    langRef.current = lang;

    // Restore originals when switching back to English
    if (lang === "en") {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n: Node | null = walker.nextNode();
      while (n) {
        const t = n as Text;
        const orig = ORIGINAL.get(t);
        if (orig != null && t.nodeValue !== orig) writeText(t, orig);
        n = walker.nextNode();
      }
      return;
    }

    // Prime the shared server-side cache once per language per session.
    // This makes tab switches instant because we already know every string.
    const primeCache = async () => {
      if (primed[lang]) return;
      primed[lang] = true;
      try {
        const { data, error } = await supabase.functions.invoke("translate", {
          body: { lang, prime: true },
        });
        if (error) throw error;
        const serverMap: Record<string, string> = data?.cache ?? {};
        const local = loadCache(lang);
        const merged = { ...serverMap, ...local };
        saveCache(lang, merged);
        // Re-apply across DOM now that we have more entries
        if (langRef.current === lang) applyToAll(lang);
      } catch (e) {
        console.warn("translate prime failed", e);
      }
    };
    primeCache();

    const applyFromCache = (targets: Text[]) => {
      const cache = loadCache(lang);
      const missing: Text[] = [];
      targets.forEach((t) => {
        const original = ORIGINAL.get(t) ?? t.nodeValue ?? "";
        if (!ORIGINAL.has(t)) ORIGINAL.set(t, original);
        const key = original.trim();
        if (!key) return;
        const hit = cache[key];
        if (hit) {
          const next = original.replace(key, hit);
          if (t.nodeValue !== next) writeText(t, next);
        } else {
          missing.push(t);
        }
      });
      return missing;
    };

    const flush = async () => {
      const pending = Array.from(pendingRef.current);
      pendingRef.current.clear();
      if (pending.length === 0) return;
      const activeLang = langRef.current;
      if (activeLang === "en") return;

      const keys: string[] = [];
      const seen = new Set<string>();
      pending.forEach((t) => {
        const original = ORIGINAL.get(t) ?? t.nodeValue ?? "";
        const key = original.trim();
        if (key && !seen.has(key)) { seen.add(key); keys.push(key); }
      });

      const CHUNK = 60;
      const merged: Record<string, string> = {};
      for (let i = 0; i < keys.length; i += CHUNK) {
        const slice = keys.slice(i, i + CHUNK);
        try {
          const { data, error } = await supabase.functions.invoke("translate", {
            body: { lang: activeLang, texts: slice },
          });
          if (error) throw error;
          const translations: string[] = data?.translations ?? [];
          slice.forEach((k, idx) => {
            const v = translations[idx];
            if (typeof v === "string" && v.trim() && v !== k) merged[k] = v;
          });
        } catch (e) {
          console.warn("translate batch failed", e);
        }
      }

      if (langRef.current !== activeLang) return;
      const currentCache = loadCache(activeLang);
      const nextCache = { ...currentCache, ...merged };
      saveCache(activeLang, nextCache);

      pending.forEach((t) => {
        const original = ORIGINAL.get(t) ?? t.nodeValue ?? "";
        const key = original.trim();
        const hit = nextCache[key];
        if (hit && t.isConnected) writeText(t, original.replace(key, hit));
      });
    };

    const scheduleFlush = () => {
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
      // Tight debounce so bursts of DOM changes ship together, but delay is imperceptible.
      flushTimerRef.current = window.setTimeout(flush, 40);
    };

    const queue = (targets: Text[]) => {
      const missing = applyFromCache(targets);
      missing.forEach((t) => pendingRef.current.add(t));
      if (missing.length) scheduleFlush();
    };

    // Initial pass
    const nodes: Text[] = [];
    collectTextNodes(document.body, nodes);
    queue(nodes);

    const observer = new MutationObserver((mutations) => {
      const targets: Text[] = [];
      mutations.forEach((m) => {
        m.addedNodes.forEach((added) => {
          if (added.nodeType === Node.TEXT_NODE) {
            if (shouldTranslate(added as Text)) targets.push(added as Text);
          } else if (added.nodeType === Node.ELEMENT_NODE) {
            collectTextNodes(added, targets);
          }
        });
        if (m.type === "characterData" && m.target.nodeType === Node.TEXT_NODE) {
          const t = m.target as Text;
          if (SELF_WRITTEN.has(t)) return;
          if (shouldTranslate(t)) {
            // Only reset the "original" if the current value truly differs from
            // any translation we already know about — this prevents the flash
            // back to English when React re-renders a translated node.
            const known = ORIGINAL.get(t);
            const cache = loadCache(langRef.current);
            const val = t.nodeValue ?? "";
            const isKnownTranslation = known ? cache[known.trim()] === val : false;
            if (!isKnownTranslation) {
              if (!known || known !== val) ORIGINAL.set(t, val);
              targets.push(t);
            }
          }
        }
      });
      if (targets.length) queue(targets);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    };
  }, [lang]);

  return null;
}
