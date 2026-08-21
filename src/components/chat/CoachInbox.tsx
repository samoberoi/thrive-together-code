import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Loader2, Search, MessageCircle, Check, CheckCheck, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCoachConversations,
  fetchMessages,
  sendMessage,
  markConversationRead,
  fetchLastMessage,
  type ChatMessage,
  type ChatConversation,
} from "@/lib/chatService";

interface ConvoWithMeta extends ChatConversation {
  patient_name: string | null;
  patient_avatar: string | null;
  last_message?: ChatMessage | null;
}

interface CoachInboxProps {
  coachId: string;
  openPatientId?: string | null;
}

export default function CoachInbox({ coachId, openPatientId }: CoachInboxProps) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConvoWithMeta[]>([]);
  const [activeConvo, setActiveConvo] = useState<ConvoWithMeta | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load conversations
  useEffect(() => {
    loadConversations();
  }, [coachId]);

  // Auto-open conversation for a specific patient
  useEffect(() => {
    if (!openPatientId || loading) return;
    const existing = conversations.find((c) => c.patient_id === openPatientId);
    if (existing && activeConvo?.id !== existing.id) {
      openConversation(existing);
    } else if (!existing) {
      // Create conversation if none exists, then jump straight into it so the
      // coach can send the very first message without landing on the empty inbox.
      (async () => {
        const { getOrCreateConversation } = await import("@/lib/chatService");
        const convo = await getOrCreateConversation(openPatientId, coachId);
        if (!convo) return;
        await loadConversations();
        const { data: patient } = await supabase
          .from("profiles")
          .select("name, avatar_url")
          .eq("user_id", openPatientId)
          .maybeSingle();
        const seeded: ConvoWithMeta = {
          ...(convo as unknown as ChatConversation),
          patient_name: (patient as any)?.name ?? null,
          patient_avatar: (patient as any)?.avatar_url ?? null,
          last_message: null,
        };
        await openConversation(seeded);
      })();
    }
  }, [openPatientId, loading, conversations.length]);

  const loadConversations = async () => {
    setLoading(true);
    const convos = await fetchCoachConversations(coachId);
    const withLastMsg = await Promise.all(
      convos.map(async (c) => {
        const last = await fetchLastMessage(c.id);
        return { ...c, last_message: last };
      })
    );
    setConversations(withLastMsg);
    setLoading(false);
  };

  // Keep latest active conversation in a ref so the realtime channel is
  // subscribed once instead of being torn down every time a chat is opened.
  const activeConvoRef = useRef<ConvoWithMeta | null>(null);
  useEffect(() => { activeConvoRef.current = activeConvo; }, [activeConvo]);

  // Realtime for new messages across all conversations
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("coach-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const newMsg = payload.new as unknown as ChatMessage;
          const active = activeConvoRef.current;
          // Update active conversation messages
          if (active && newMsg.conversation_id === active.id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            if (newMsg.sender_role === "client") {
              markConversationRead(active.id, "coach");
            }
          }
          // Update conversation list
          setConversations((prev) =>
            prev.map((c) =>
              c.id === newMsg.conversation_id
                ? {
                    ...c,
                    last_message: newMsg,
                    last_message_at: newMsg.created_at,
                    coach_unread_count:
                      active?.id === c.id
                        ? c.coach_unread_count
                        : newMsg.sender_role === "client"
                        ? c.coach_unread_count + 1
                        : c.coach_unread_count,
                  }
                : c
            ).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_conversations" },
        () => { loadConversations(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);


  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const openConversation = async (convo: ConvoWithMeta) => {
    setActiveConvo(convo);
    const msgs = await fetchMessages(convo.id);
    setMessages(msgs);
    await markConversationRead(convo.id, "coach");
    setConversations((prev) =>
      prev.map((c) => (c.id === convo.id ? { ...c, coach_unread_count: 0 } : c))
    );
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || !user || !activeConvo) return;
    setInput("");
    setSending(true);
    const sent = await sendMessage(activeConvo.id, user.id, "coach", msg);
    if (sent) {
      // Optimistic append so the message shows instantly even if realtime lags.
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setConversations((prev) =>
        prev
          .map((c) =>
            c.id === sent.conversation_id
              ? { ...c, last_message: sent, last_message_at: sent.created_at }
              : c
          )
          .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
      );
    }
    setSending(false);
    // Do not auto-open keyboard after sending; user taps input to reopen.
  };


  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const shouldShowDateDivider = (msg: ChatMessage, idx: number) => {
    if (idx === 0) return true;
    return new Date(msg.created_at).toDateString() !== new Date(messages[idx - 1].created_at).toDateString();
  };

  const formatDateDivider = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  const filteredConvos = conversations.filter((c) =>
    !search || (c.patient_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalUnread = conversations.reduce((sum, c) => sum + c.coach_unread_count, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // Chat view
  if (activeConvo) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-background" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <button onClick={() => setActiveConvo(null)} className="p-1.5 rounded-xl hover:bg-accent transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <img loading="lazy" decoding="async"
            src={activeConvo.patient_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(activeConvo.patient_name || "P")}&background=random`}
            alt={activeConvo.patient_name || "Client"}
            className="w-10 h-10 rounded-full object-cover"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-foreground font-bold text-sm truncate">{activeConvo.patient_name}</h3>
            <p className="text-muted-foreground text-xs">Client</p>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2">
              <MessageCircle className="w-12 h-12 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No messages yet</p>
            </div>
          )}
          {messages.map((msg, idx) => {
            const isMe = msg.sender_role === "coach";
            return (
              <div key={msg.id}>
                {shouldShowDateDivider(msg, idx) && (
                  <div className="flex items-center justify-center my-3">
                    <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                      {formatDateDivider(msg.created_at)}
                    </span>
                  </div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isMe ? "justify-end" : "justify-start"} mb-1`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}
                  >
                    {msg.is_predefined && !isMe && (
                      <span className="text-[9px] uppercase tracking-wider opacity-60 block mb-0.5">Quick Question</span>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                    <div className={`flex items-center gap-1 mt-1 ${isMe ? "justify-end" : ""}`}>
                      <span className={`text-[10px] ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {isMe && (
                        msg.read_at
                          ? <CheckCheck className="w-3 h-3 text-primary-foreground/60" />
                          : <Check className="w-3 h-3 text-primary-foreground/40" />
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div
          className="border-t border-border/50 px-3 py-2 flex items-center gap-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px + var(--kb-h, 0px))" }}
        >

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type a reply…"
            className="flex-1 bg-muted rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="p-2.5 rounded-xl gradient-blue text-primary-foreground disabled:opacity-30 transition-opacity"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    );
  }

  // Inbox list
  return (
    <div className="flex flex-col gap-4 px-5 pt-8 pb-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black text-foreground">Messages</h1>
          {totalUnread > 0 && (
            <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
              {totalUnread}
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">Chat with your clients</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="w-full bg-muted rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* Conversation List */}
      {filteredConvos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <MessageCircle className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            {search ? "No matching conversations" : "No messages yet"}
          </p>
          <p className="text-muted-foreground/60 text-xs max-w-[250px]">
            Conversations will appear here when patients message you
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {filteredConvos.map((convo) => (
            <motion.button
              key={convo.id}
              onClick={() => openConversation(convo)}
              className="flex items-center gap-3 p-3 rounded-2xl hover:bg-accent transition-colors w-full text-left"
              whileTap={{ scale: 0.98 }}
            >
              <div className="relative">
                <img loading="lazy" decoding="async"
                  src={convo.patient_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(convo.patient_name || "P")}&background=random`}
                  alt={convo.patient_name || "Client"}
                  className="w-12 h-12 rounded-full object-cover"
                />
                {convo.coach_unread_count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {convo.coach_unread_count}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold truncate ${convo.coach_unread_count > 0 ? "text-foreground" : "text-foreground/80"}`}>
                    {convo.patient_name}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                    {formatTime(convo.last_message_at)}
                  </span>
                </div>
                {convo.last_message && (
                  <p className={`text-xs truncate mt-0.5 ${convo.coach_unread_count > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {convo.last_message.sender_role === "coach" && "You: "}
                    {convo.last_message.message}
                  </p>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
