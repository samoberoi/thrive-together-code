import { supabase } from "@/integrations/supabase/client";

export interface ChatConversation {
  id: string;
  patient_id: string;
  coach_id: string;
  last_message_at: string;
  patient_unread_count: number;
  coach_unread_count: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: "client" | "coach";
  message: string;
  is_predefined: boolean;
  read_at: string | null;
  created_at: string;
}

export const PREDEFINED_QUESTIONS = [
  "I'm feeling dizzy during fasting, what should I do?",
  "Can I change my fasting window timing?",
  "My glucose readings seem high today, is this normal?",
  "I missed my supplements yesterday, should I double up?",
  "What foods can I eat to break my fast?",
  "I need to reschedule my next session",
  "Can you review my latest test reports?",
  "I'm experiencing side effects from supplements",
];

/** Get or create a conversation between patient and coach */
export async function getOrCreateConversation(patientId: string, coachId: string): Promise<ChatConversation | null> {
  // Try to find existing
  const { data: existing } = await supabase
    .from("chat_conversations")
    .select("*")
    .eq("patient_id", patientId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (existing) return existing as unknown as ChatConversation;

  // Create new — insert with both fields so either patient or coach RLS policy can match
  const { data: created, error } = await supabase
    .from("chat_conversations")
    .insert({ patient_id: patientId, coach_id: coachId })
    .select()
    .single();

  if (error) {
    console.error("Failed to create conversation:", error);
    return null;
  }
  return created as unknown as ChatConversation;
}

/** Fetch messages for a conversation */
export async function fetchMessages(conversationId: string, limit = 100): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch messages:", error);
    return [];
  }
  return (data || []) as unknown as ChatMessage[];
}

/** Send a message */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  senderRole: "client" | "coach",
  message: string,
  isPredefined = false
): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      sender_role: senderRole,
      message,
      is_predefined: isPredefined,
    } as any)
    .select()
    .single();

  if (error) {
    console.error("Failed to send message:", error);
    return null;
  }
  return data as unknown as ChatMessage;
}

/** Mark messages as read and reset unread count */
export async function markConversationRead(conversationId: string, role: "client" | "coach") {
  const updateField = role === "client" ? "patient_unread_count" : "coach_unread_count";
  await supabase
    .from("chat_conversations")
    .update({ [updateField]: 0 } as any)
    .eq("id", conversationId);

  const otherRole = role === "client" ? "coach" : "client";
  await supabase
    .from("chat_messages" as any)
    .update({ read_at: new Date().toISOString() } as any)
    .eq("conversation_id", conversationId)
    .eq("sender_role", otherRole)
    .is("read_at", null);
}

/** Fetch all conversations for a coach (with patient info) */
export async function fetchCoachConversations(coachId: string): Promise<(ChatConversation & { patient_name: string | null; patient_avatar: string | null })[]> {
  const { data: convos } = await supabase
    .from("chat_conversations")
    .select("*")
    .eq("coach_id", coachId)
    .order("last_message_at", { ascending: false });

  if (!convos || convos.length === 0) return [];

  // Get patient profiles
  const patientIds = (convos as any[]).map((c) => c.patient_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, name, avatar_url")
    .in("user_id", patientIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

  return (convos as any[]).map((c) => {
    const profile = profileMap.get(c.patient_id);
    return {
      ...c,
      patient_name: profile?.name || "Unknown Client",
      patient_avatar: profile?.avatar_url || null,
    };
  });
}

/** Get last message for a conversation */
export async function fetchLastMessage(conversationId: string): Promise<ChatMessage | null> {
  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as unknown as ChatMessage | null;
}
