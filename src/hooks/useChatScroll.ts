import { useEffect, useRef } from "react";

/**
 * Keeps a chat scrolled to the bottom.
 * - First render after messages load: instant jump to bottom.
 * - Subsequent message additions: smooth scroll to bottom.
 */
export function useChatScroll(messages: unknown[], scrollRef: React.RefObject<HTMLElement>) {
  const initialScrollDone = useRef(false);
  const prevCount = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const scrollToBottom = (behavior: ScrollBehavior) => {
      el.scrollTo({ top: el.scrollHeight, behavior });
    };

    if (!initialScrollDone.current && messages.length > 0) {
      // Wait for DOM layout / images before the first jump.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom("auto");
          initialScrollDone.current = true;
          prevCount.current = messages.length;
        });
      });
      return;
    }

    if (messages.length > prevCount.current) {
      scrollToBottom("smooth");
    }
    prevCount.current = messages.length;
  }, [messages, scrollRef]);
}
