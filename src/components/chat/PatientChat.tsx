import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Loader2, Zap, Check, CheckCheck, Sparkles, Pencil, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  getOrCreateConversation,
  fetchMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markConversationRead,
  PREDEFINED_QUESTIONS,
  type ChatMessage,
  type ChatConversation,
} from "@/lib/chatService";
import type { Coach } from "@/lib/coachService";
import { useChatScroll } from "@/hooks/useChatScroll";

interface PatientChatProps {
  coach: Coach;
  onBack: () => void;
}

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("");
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const y = new Date(today); y.setDate(y.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export default function PatientChat({ coach, onBack }: PatientChatProps) {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showQuickQuestions, setShowQuickQuestions] = useState(false);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const convo = await getOrCreateConversation(user.id, coach.id);
      if (convo) {
        setConversation(convo);
        const msgs = await fetchMessages(convo.id);
        setMessages(msgs);
        await markConversationRead(convo.id, "client");
      }
      setLoading(false);
    })();
  }, [user, coach.id]);

  useEffect(() => {
    if (!conversation) return;
    const channel = supabase
      .channel(`chat-${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const newMsg = payload.new as unknown as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
          if (newMsg.sender_role === "coach") markConversationRead(conversation.id, "client");
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const updated = payload.new as unknown as ChatMessage;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        (payload) => {
          const removed = payload.old as unknown as { id?: string };
          if (!removed?.id) return;
          setMessages((prev) => prev.filter((m) => m.id !== removed.id));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversation]);

  useChatScroll(messages, scrollRef);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const handleSend = async (text?: string, isPredefined = false) => {
    const msg = (text ?? input).trim();
    if (!msg || !user || !conversation) return;
    if (editingId) {
      const id = editingId;
      setEditingId(null);
      setInput("");
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, message: msg, edited_at: new Date().toISOString() } : m)));
      await editMessage(id, msg);
      return;
    }
    if (!text) setInput("");
    setSending(true);
    setShowQuickQuestions(false);
    const sent = await sendMessage(conversation.id, user.id, "client", msg, isPredefined);
    if (sent) {
      // Optimistic append so the message shows instantly even if realtime lags.
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    }
    setSending(false);
    // Do not auto-open keyboard after sending; user taps input to reopen.
  };


  const startEdit = (msg: ChatMessage) => {
    setActionsFor(null);
    setEditingId(msg.id);
    setInput(msg.message);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setInput("");
  };

  const handleDelete = async (msg: ChatMessage) => {
    setActionsFor(null);
    if (editingId === msg.id) cancelEdit();
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    await deleteMessage(msg.id);
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const grouped = useMemo(() => {
    const buckets: { date: string; label: string; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const key = m.created_at.slice(0, 10);
      const last = buckets[buckets.length - 1];
      if (last && last.date === key) last.items.push(m);
      else buckets.push({ date: key, label: dayLabel(m.created_at), items: [m] });
    }
    return buckets;
  }, [messages]);

  const coachAvatar = coach.avatar_url || null;
  const coachName = coach.name;
  const starters = PREDEFINED_QUESTIONS.slice(0, 4);

  if (loading) {
    return createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-[#FCFCFD]"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[#FCFCFD]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/85 backdrop-blur-xl border-b border-border/60">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-3 md:px-4 py-3">
          <button
            onClick={onBack}
            className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center active:scale-95 hover:bg-muted/70 transition"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" strokeWidth={2.2} />
          </button>
          <div className="relative shrink-0">
            {coachAvatar ? (
              <img loading="lazy" decoding="async" src={coachAvatar} alt={coachName} className="w-11 h-11 rounded-full object-cover ring-1 ring-border/60" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[var(--bbdo-blue)] to-[var(--bbdo-red)] text-white flex items-center justify-center text-sm font-black ring-1 ring-border/60">
                {initialsOf(coachName)}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--bbdo-blue)]">Chat</p>
            <h3 className="text-base font-black text-foreground truncate leading-tight">{coachName}</h3>
            <p className="text-[11px] text-muted-foreground truncate">{coach.specialization || "Health Coach"} · Online</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-3 md:px-4 py-4">
          {messages.length === 0 ? (
            <div className="min-h-[55vh] flex flex-col items-center justify-center text-center gap-4 px-4">
              {coachAvatar ? (
                <img loading="lazy" decoding="async" src={coachAvatar} alt={coachName} className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--bbdo-blue)] to-[var(--bbdo-red)] text-white flex items-center justify-center text-xl font-black ring-4 ring-white shadow-lg">
                  {initialsOf(coachName)}
                </div>
              )}
              <div className="space-y-1">
                <h2 className="text-xl font-black text-foreground">Say hi to {coachName.split(" ")[0]}</h2>
                <p className="text-sm text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
                  Ask anything about your health journey — food, fasting, movement or how you're feeling.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground mt-2">
                <Sparkles className="w-3 h-3 text-[var(--bbdo-red)]" /> Quick starters
              </div>
              <div className="w-full max-w-md grid grid-cols-1 sm:grid-cols-2 gap-2">
                {starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s, true)}
                    className="text-left text-sm text-foreground bg-white border border-border/70 rounded-2xl px-3.5 py-2.5 hover:border-[var(--bbdo-blue)]/40 hover:bg-[var(--bbdo-blue)]/[0.03] active:scale-[0.99] transition shadow-[0_1px_0_rgba(15,26,61,0.03)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((bucket) => (
                <section key={bucket.date} className="space-y-1.5">
                  <div className="flex items-center justify-center py-1">
                    <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground bg-white/70 border border-border/60 rounded-full px-2.5 py-0.5">
                      {bucket.label}
                    </span>
                  </div>
                  {bucket.items.map((msg, idx) => {
                    const isMe = msg.sender_role === "client";
                    const prev = bucket.items[idx - 1];
                    const next = bucket.items[idx + 1];
                    const groupedWithPrev = prev && prev.sender_role === msg.sender_role &&
                      (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 3 * 60 * 1000;
                    const groupedWithNext = next && next.sender_role === msg.sender_role &&
                      (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) < 3 * 60 * 1000;
                    const bubbleRadius = isMe
                      ? `rounded-2xl ${groupedWithNext ? "rounded-br-md" : "rounded-br-sm"} ${groupedWithPrev ? "rounded-tr-md" : ""}`
                      : `rounded-2xl ${groupedWithNext ? "rounded-bl-md" : "rounded-bl-sm"} ${groupedWithPrev ? "rounded-tl-md" : ""}`;
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        className={`flex ${isMe ? "justify-end" : "justify-start"} ${groupedWithPrev ? "mt-0.5" : "mt-2"}`}
                      >
                        <div className={`flex items-end gap-2 max-w-[82%] ${isMe ? "flex-row-reverse" : ""}`}>
                          {!isMe && !groupedWithNext ? (
                            coachAvatar ? (
                              <img loading="lazy" decoding="async" src={coachAvatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--bbdo-blue)] to-[var(--bbdo-red)] text-white text-[9px] font-black flex items-center justify-center shrink-0">
                                {initialsOf(coachName)}
                              </div>
                            )
                          ) : !isMe ? (
                            <div className="w-6 shrink-0" />
                          ) : null}
                          <div className="flex flex-col items-end gap-1">
                          <div
                            onClick={isMe ? () => setActionsFor((v) => (v === msg.id ? null : msg.id)) : undefined}
                            className={`${bubbleRadius} px-3.5 py-2 shadow-[0_1px_0_rgba(15,26,61,0.04)] ${isMe ? "cursor-pointer" : ""} ${
                              isMe
                                ? "bg-[var(--bbdo-blue)] text-white"
                                : "bg-white text-foreground border border-border/70"
                            }`}
                          >
                            {msg.is_predefined && (
                              <span className={`text-[9px] uppercase tracking-wider block mb-0.5 ${isMe ? "text-white/70" : "text-muted-foreground"}`}>
                                Quick Question
                              </span>
                            )}
                            <p className="text-[14px] leading-[1.4] whitespace-pre-wrap break-words">{msg.message}</p>
                            <div className={`flex items-center gap-1 mt-0.5 ${isMe ? "justify-end" : ""}`}>
                              <span className={`text-[10px] ${isMe ? "text-white/60" : "text-muted-foreground"}`}>
                                {formatTime(msg.created_at)}{msg.edited_at ? " · edited" : ""}
                              </span>
                              {isMe && (
                                msg.read_at
                                  ? <CheckCheck className="w-3 h-3 text-white/70" />
                                  : <Check className="w-3 h-3 text-white/50" />
                              )}
                            </div>
                          </div>
                          {isMe && actionsFor === msg.id && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => startEdit(msg)}
                                className="flex items-center gap-1 text-[11px] font-semibold text-foreground bg-white border border-border/70 rounded-full px-2.5 py-1 active:scale-95"
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                              <button
                                onClick={() => handleDelete(msg)}
                                className="flex items-center gap-1 text-[11px] font-semibold text-[var(--bbdo-red)] bg-white border border-border/70 rounded-full px-2.5 py-1 active:scale-95"
                              >
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </div>
                          )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </section>
              ))}
              <AnimatePresence>
                {sending && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex justify-end">
                    <div className="rounded-2xl rounded-br-sm bg-[var(--bbdo-blue)]/60 text-white px-3.5 py-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse [animation-delay:300ms]" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Quick Questions Panel */}
      <AnimatePresence>
        {showQuickQuestions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border/60 bg-white overflow-hidden"
          >
            <div className="max-w-3xl mx-auto px-4 py-3 max-h-[200px] overflow-y-auto">
              <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-[0.18em]">Quick Questions</p>
              <div className="flex flex-wrap gap-2">
                {PREDEFINED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q, true)}
                    className="text-xs text-foreground bg-muted/60 hover:bg-[var(--bbdo-blue)]/[0.08] border border-transparent hover:border-[var(--bbdo-blue)]/30 px-3 py-2 rounded-xl transition text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <div
        className="border-t border-border/60 bg-white/85 backdrop-blur-xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + var(--kb-h, 0px) + var(--nav-h, 0px))" }}
      >

        {editingId && (
          <div className="max-w-3xl mx-auto px-4 pt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--bbdo-blue)]">Editing message</span>
            <button onClick={cancelEdit} className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        )}
        <div className="max-w-3xl mx-auto px-3 md:px-4 py-2.5 flex items-end gap-2">
          <button
            onClick={() => setShowQuickQuestions((v) => !v)}
            className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition ${
              showQuickQuestions
                ? "bg-[var(--bbdo-blue)]/10 text-[var(--bbdo-blue)]"
                : "bg-muted/70 text-muted-foreground hover:bg-muted"
            }`}
            aria-label="Quick questions"
          >
            <Zap className="w-5 h-5" strokeWidth={2.2} />
          </button>
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              rows={1}
              placeholder="Message your coach…"
              className="w-full resize-none bg-muted/70 rounded-2xl px-4 py-2.5 text-[14px] leading-[1.4] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--bbdo-blue)]/30 max-h-[140px]"
            />
          </div>
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || sending}
            className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition ${
              !input.trim() || sending
                ? "bg-muted text-muted-foreground/60"
                : "bg-[var(--bbdo-red)] text-white shadow-[0_4px_14px_-4px_rgba(230,57,70,0.5)] active:scale-95"
            }`}
            aria-label="Send"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" strokeWidth={2.2} />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
