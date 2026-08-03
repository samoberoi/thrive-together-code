import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type AttentionCounts = {
  notifications: number;
  patientMessages: number;
  coachMessages: number;
  partnerMessages: number;
  yogaMessages: number;
  consultationRequests: number;
  labRecommendations: number;
};

const EMPTY_COUNTS: AttentionCounts = {
  notifications: 0,
  patientMessages: 0,
  coachMessages: 0,
  partnerMessages: 0,
  yogaMessages: 0,
  consultationRequests: 0,
  labRecommendations: 0,
};

const sumField = (rows: unknown[] | null | undefined, key: string): number =>
  (rows ?? []).reduce<number>((sum, row) => sum + Number((row as Record<string, unknown>)[key] ?? 0), 0);

const firstErrorMessage = (results: unknown[]): string | undefined => {
  for (const result of results) {
    const error = (result as { error?: { message?: string } } | null)?.error;
    if (error) return error.message;
  }
  return undefined;
};

export function useAttentionCounts() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<AttentionCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);

  const loadCounts = useCallback(async () => {
    if (!user?.id) {
      setCounts(EMPTY_COUNTS);
      setLoading(false);
      return;
    }

    const userId = user.id;

    const [notificationsRes, patientChatsRes, yogaChatsRes, labRecsRes, coachRes, partnerRes] = await Promise.all([
      supabase
        .from("notifications" as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false),
      supabase
        .from("chat_conversations" as any)
        .select("patient_unread_count")
        .eq("patient_id", userId),
      supabase
        .from("partner_chat_conversations" as any)
        .select("subscriber_unread_count")
        .eq("subscriber_id", userId),
      supabase
        .from("thyrocare_recommendations" as any)
        .select("id")
        .eq("user_id", userId)
        .neq("status", "booked"),
      supabase
        .from("coaches" as any)
        .select("id")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("channel_partners" as any)
        .select("id")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const errorMessage = firstErrorMessage([notificationsRes, patientChatsRes, yogaChatsRes, labRecsRes, coachRes, partnerRes]);
    if (errorMessage) console.warn("Attention count query skipped", errorMessage);

    const coachId = (coachRes.data as any)?.id as string | undefined;
    const partnerId = (partnerRes.data as any)?.id as string | undefined;

    const [coachChatsRes, consultationRes, partnerChatsRes] = await Promise.all([
      coachId
        ? supabase
            .from("chat_conversations" as any)
            .select("coach_unread_count")
            .eq("coach_id", coachId)
        : Promise.resolve({ data: [] as unknown[] }),
      coachId
        ? supabase
            .from("consultation_requests" as any)
            .select("id", { count: "exact", head: true })
            .eq("coach_id", coachId)
            .eq("status", "pending")
        : Promise.resolve({ count: 0 }),
      partnerId
        ? supabase
            .from("partner_chat_conversations" as any)
            .select("partner_unread_count")
            .eq("partner_id", partnerId)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    const scopedErrorMessage = firstErrorMessage([coachChatsRes, consultationRes, partnerChatsRes]);
    if (scopedErrorMessage) console.warn("Scoped attention count query skipped", scopedErrorMessage);

    // A recommendation is no longer "pending attention" once the patient has
    // uploaded an external report for it (they got the test done outside).
    const pendingRecIds = ((labRecsRes.data as any[]) ?? []).map((r) => r.id as string);
    let outstandingLabRecs = pendingRecIds.length;
    if (pendingRecIds.length > 0) {
      const { data: extRows } = await supabase
        .from("external_lab_reports" as any)
        .select("recommendation_id")
        .eq("user_id", userId)
        .in("recommendation_id", pendingRecIds);
      const covered = new Set(((extRows as any[]) ?? []).map((r) => r.recommendation_id));
      outstandingLabRecs = pendingRecIds.filter((id) => !covered.has(id)).length;
    }

    setCounts({
      notifications: Number(notificationsRes.count ?? 0),
      patientMessages: sumField(patientChatsRes.data as unknown[] | null, "patient_unread_count"),
      coachMessages: sumField(coachChatsRes.data as unknown[] | null, "coach_unread_count"),
      partnerMessages: sumField(partnerChatsRes.data as unknown[] | null, "partner_unread_count"),
      yogaMessages: sumField(yogaChatsRes.data as unknown[] | null, "subscriber_unread_count"),
      consultationRequests: Number(consultationRes.count ?? 0),
      labRecommendations: outstandingLabRecs,
    });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setCounts(EMPTY_COUNTS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];
    const safeLoad = () => {
      if (!cancelled) void loadCounts();
    };
    const addChannel = (table: string, filter: string) => {
      const channel = supabase
        .channel(`attention-${table}-${filter}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes" as any,
          { event: "*", schema: "public", table, filter },
          safeLoad,
        )
        .subscribe();
      channels.push(channel);
    };

    safeLoad();
    addChannel("notifications", `user_id=eq.${user.id}`);
    addChannel("chat_conversations", `patient_id=eq.${user.id}`);
    addChannel("partner_chat_conversations", `subscriber_id=eq.${user.id}`);
    addChannel("thyrocare_recommendations", `user_id=eq.${user.id}`);
    addChannel("yoga_bookings", `user_id=eq.${user.id}`);

    (async () => {
      const [{ data: coach }, { data: partner }] = await Promise.all([
        supabase.from("coaches" as any).select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("channel_partners" as any).select("id").eq("user_id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      const coachId = (coach as any)?.id as string | undefined;
      const partnerId = (partner as any)?.id as string | undefined;
      if (coachId) {
        addChannel("chat_conversations", `coach_id=eq.${coachId}`);
        addChannel("consultation_requests", `coach_id=eq.${coachId}`);
      }
      if (partnerId) addChannel("partner_chat_conversations", `partner_id=eq.${partnerId}`);
      if (partnerId) addChannel("yoga_bookings", `partner_id=eq.${partnerId}`);
    })();

    return () => {
      cancelled = true;
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [loadCounts, user?.id]);

  return { counts, loading, refresh: loadCounts };
}