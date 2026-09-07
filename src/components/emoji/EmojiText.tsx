/**
 * Renders message text with proper colour-emoji font support and WhatsApp-style
 * enlargement when the message is only emoji (up to 3).
 */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u200D|\p{Emoji_Modifier}|\s)+$/u;

export function countEmoji(text: string): number {
  return Array.from(
    text.matchAll(/\p{Extended_Pictographic}(?:\uFE0F)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*/gu),
  ).length;
}

export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return EMOJI_ONLY.test(t) && countEmoji(t) > 0;
}

interface Props {
  text: string;
  className?: string;
}

export default function EmojiText({ text, className = "" }: Props) {
  const only = isEmojiOnly(text);
  const n = only ? countEmoji(text) : 0;
  const size = !only ? "" : n === 1 ? "text-[44px] leading-[1.15]" : n === 2 ? "text-[36px] leading-[1.15]" : n === 3 ? "text-[30px] leading-[1.15]" : "";

  return (
    <p
      className={`whitespace-pre-wrap break-words emoji-text ${size || className}`}
      style={{ fontFamily: size ? undefined : undefined }}
    >
      {text}
    </p>
  );
}
