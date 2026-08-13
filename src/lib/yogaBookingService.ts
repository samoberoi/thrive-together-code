import { supabase } from "@/integrations/supabase/client";

export interface Partner {
  id: string;
  partner_type: string;
  name: string;
  headline: string | null;
  bio: string | null;
  avatar_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  bbdo_commission_pct: number;
  partner_commission_pct: number;
}

export interface Pkg {
  id: string;
  partner_id: string;
  package_type: "group" | "private";
  name: string;
  description: string | null;
  price_inr: number;
  classes_per_month: number | null;
  duration_minutes: number | null;
  is_active: boolean;
  sort_order: number;
  schedule_slots: string[];
}

export interface YogaBooking {
  id: string;
  user_id: string;
  partner_id: string;
  package_id: string;
  package_type: string;
  price_inr: number;
  selected_slot: string | null;
  slot_id: string | null;
  template_id: string | null;
  preferred_time: string | null;
  preferred_days: string[] | null;
  notes: string | null;
  status: string;
  payment_status: string;
  starts_on: string | null;
  expires_on: string | null;
  created_at: string;
}

export async function fetchPartnersAndPackages(type = "yoga") {
  const [{ data: partners }, { data: pkgs }] = await Promise.all([
    supabase
      .from("partner_directory" as any)
      .select("*")
      .eq("partner_type", type)
      .eq("is_active", true),
    supabase
      .from("channel_partner_packages" as any)
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);
  const partnerList = (partners as any as Partner[]) || [];
  const pkgList = ((pkgs as any as any[]) || []).map((p) => ({
    ...p,
    schedule_slots: Array.isArray(p.schedule_slots) ? p.schedule_slots : [],
  })) as Pkg[];
  const partnerIds = new Set(partnerList.map((p) => p.id));
  return {
    partners: partnerList,
    packages: pkgList.filter((p) => partnerIds.has(p.partner_id)),
  };
}

export async function fetchMyBookings(): Promise<YogaBooking[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase
    .from("yoga_bookings" as any)
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as any as YogaBooking[]) || [];
}

export async function createBooking(input: {
  partner_id: string;
  package_id: string;
  package_type: string;
  price_inr: number;
  selected_slot?: string | null;
  slot_id?: string | null;
  template_id?: string | null;
  preferred_time?: string | null;
  preferred_days?: string[];
  notes?: string | null;
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Please sign in");

  // Whole-month booking: reserve a seat on every upcoming class of the chosen
  // recurring slot within the 30-day validity, not just one instance.
  if (input.template_id) {
    const { data, error } = await (supabase as any).rpc("book_yoga_month", {
      _partner_id: input.partner_id,
      _package_id: input.package_id,
      _package_type: input.package_type,
      _price_inr: input.price_inr,
      _template_id: input.template_id,
      _selected_slot: input.selected_slot ?? null,
      _duration_days: 30,
    });
    if (error) throw error;
    return data as any as YogaBooking;
  }

  // Fallback: pending schedule (custom preferences, no template chosen yet).
  const now = new Date();
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + 1);
  const { data, error } = await supabase
    .from("yoga_bookings" as any)
    .insert({
      user_id: auth.user.id,
      partner_id: input.partner_id,
      package_id: input.package_id,
      package_type: input.package_type,
      price_inr: input.price_inr,
      selected_slot: input.selected_slot ?? null,
      slot_id: input.slot_id ?? null,
      preferred_time: input.preferred_time ?? null,
      preferred_days: input.preferred_days ?? [],
      notes: input.notes ?? null,
      status: input.slot_id ? "scheduled" : "pending_schedule",
      payment_status: "paid",
      payment_ref: `DEMO-${Date.now()}`,
      starts_on: now.toISOString().slice(0, 10),
      expires_on: expires.toISOString().slice(0, 10),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as any as YogaBooking;
}

/** Send a custom-slot request to the partner (creates a pending booking + notification). */
export async function requestCustomSlot(input: {
  partner_id: string;
  package_id: string;
  package_type: string;
  price_inr: number;
  preferred_time: string;
  preferred_days: string[];
  notes?: string | null;
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Please sign in");

  const now = new Date();
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + 1);

  const { data: booking, error } = await supabase
    .from("yoga_bookings" as any)
    .insert({
      user_id: auth.user.id,
      partner_id: input.partner_id,
      package_id: input.package_id,
      package_type: input.package_type,
      price_inr: input.price_inr,
      selected_slot: null,
      slot_id: null,
      preferred_time: input.preferred_time,
      preferred_days: input.preferred_days,
      notes: input.notes ?? null,
      status: "custom_slot_requested",
      payment_status: "pending",
      starts_on: now.toISOString().slice(0, 10),
      expires_on: expires.toISOString().slice(0, 10),
    })
    .select("*")
    .single();
  if (error) throw error;

  // Fetch partner user_id + requester name, then create a notification
  const [{ data: partner }, { data: profile }] = await Promise.all([
    supabase.from("partner_directory" as any).select("user_id, name").eq("id", input.partner_id).maybeSingle(),
    supabase.from("profiles" as any).select("name").eq("user_id", auth.user.id).maybeSingle(),
  ]);
  const partnerUserId = (partner as any)?.user_id as string | null;
  const requester = (profile as any)?.name || "A member";
  if (partnerUserId) {
    const body = `${requester} requested a custom 1:1 slot: ${input.preferred_time}${
      input.preferred_days.length ? " · " + input.preferred_days.join(", ") : ""
    }${input.notes ? ` — "${input.notes}"` : ""}`;
    await (supabase as any).rpc("create_notification", {
      _user_id: partnerUserId,
      _title: "New custom slot request",
      _body: body,
      _type: "custom_slot_request",
      _icon: "🧘",
      _action_url: "/partner?tab=bookings",
    });
  }

  return booking as any as YogaBooking;
}

/** Partner approves a custom slot request with confirmed time/days. */
export async function approveCustomSlotRequest(input: {
  booking_id: string;
  time_of_day: string; // "HH:MM"
  days_of_week: number[]; // 0..6
  duration_min?: number;
  meet_link?: string | null;
}) {
  const { error } = await (supabase as any).rpc("approve_custom_slot_request", {
    _booking_id: input.booking_id,
    _time_of_day: input.time_of_day,
    _days_of_week: input.days_of_week,
    _duration_min: input.duration_min ?? 60,
    _meet_link: input.meet_link ?? null,
  });
  if (error) throw error;
}

/** User completes payment for an approved custom slot; series is created. */
export async function payAndCreateCustomSlot(bookingId: string): Promise<string> {
  const { data, error } = await (supabase as any).rpc("pay_and_create_custom_slot", {
    _booking_id: bookingId,
  });
  if (error) throw error;
  return data as string;
}



/** Meet link + next instance for a booking (prefers template_id). */
export async function fetchBookingMeetInfo(
  templateOrSlotId: string | null,
  kind: "template" | "slot" = "slot",
): Promise<{ meet_link: string | null; next_at: string | null } | null> {
  if (!templateOrSlotId) return null;
  let tmplId: string | null = null;
  let slotMeet: string | null = null;
  if (kind === "template") {
    tmplId = templateOrSlotId;
  } else {
    const { data: slot } = await supabase
      .from("channel_partner_slots" as any)
      .select("template_id, meet_link")
      .eq("id", templateOrSlotId)
      .maybeSingle();
    if (!slot) return null;
    tmplId = (slot as any).template_id;
    slotMeet = (slot as any).meet_link;
  }
  if (!tmplId) return null;
  const [{ data: tmpl }, { data: next }] = await Promise.all([
    supabase.from("channel_partner_slot_templates" as any).select("meet_link").eq("id", tmplId).maybeSingle(),
    supabase
      .from("channel_partner_slots" as any)
      .select("scheduled_at, meet_link")
      .eq("template_id", tmplId)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    meet_link: (next as any)?.meet_link ?? slotMeet ?? (tmpl as any)?.meet_link ?? null,
    next_at: (next as any)?.scheduled_at ?? null,
  };
}

export interface TodayYogaClass {
  booking_id: string;
  partner_id: string;
  package_type: string;
  partner_name: string | null;
  partner_avatar: string | null;
  scheduled_at: string;
  ends_at: string;
  duration_min: number;
  meet_link: string | null;
}

/** All of the user's yoga class instances scheduled today. Uses template_id when available. */
export async function fetchTodaysYogaClasses(): Promise<TodayYogaClass[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data: bookings } = await supabase
    .from("yoga_bookings" as any)
    .select("id, partner_id, package_type, slot_id, template_id, status, expires_on")
    .eq("user_id", auth.user.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const active = ((bookings as any) ?? []).filter(
    (b: any) =>
      !["cancelled", "completed"].includes(b.status) &&
      (b.template_id || b.slot_id) &&
      (!b.expires_on || new Date(b.expires_on) >= today),
  );
  if (!active.length) return [];

  // Resolve template_id for any legacy bookings that only carry slot_id.
  const needsTemplateLookup = active.filter((b: any) => !b.template_id && b.slot_id);
  if (needsTemplateLookup.length) {
    const { data: slots } = await supabase
      .from("channel_partner_slots" as any)
      .select("id, template_id")
      .in("id", needsTemplateLookup.map((b: any) => b.slot_id));
    const map = new Map<string, string>();
    ((slots as any) ?? []).forEach((s: any) => map.set(s.id, s.template_id));
    needsTemplateLookup.forEach((b: any) => {
      b.template_id = map.get(b.slot_id) ?? null;
    });
  }

  const templateIds = Array.from(new Set(active.map((b: any) => b.template_id).filter(Boolean)));
  if (!templateIds.length) return [];

  const partnerIds = Array.from(new Set(active.map((b: any) => b.partner_id)));
  const bookingIds = active.map((b: any) => b.id);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [{ data: reservations }, { data: partners }, { data: templates }] = await Promise.all([
    supabase
      .from("yoga_booking_instances" as any)
      .select("booking_id, slot_id")
      .in("booking_id", bookingIds),
    supabase.from("partner_directory" as any).select("id, name, avatar_url").in("id", partnerIds),
    supabase
      .from("channel_partner_slot_templates" as any)
      .select("id, meet_link, duration_min")
      .in("id", templateIds),
  ]);

  const partnerById = new Map<string, any>();
  ((partners as any) ?? []).forEach((p: any) => partnerById.set(p.id, p));
  const tmplById = new Map<string, any>();
  ((templates as any) ?? []).forEach((t: any) => tmplById.set(t.id, t));

  const reservedSlotIds = Array.from(new Set(((reservations as any) ?? []).map((r: any) => r.slot_id).filter(Boolean)));
  if (!reservedSlotIds.length) return [];
  const { data: instances } = await supabase
    .from("channel_partner_slots" as any)
    .select("id, template_id, scheduled_at, meet_link, duration_min")
    .in("id", reservedSlotIds)
    .gte("scheduled_at", start.toISOString())
    .lt("scheduled_at", end.toISOString());
  const reservationsByBooking = new Map<string, Set<string>>();
  ((reservations as any) ?? []).forEach((r: any) => {
    if (!reservationsByBooking.has(r.booking_id)) reservationsByBooking.set(r.booking_id, new Set());
    reservationsByBooking.get(r.booking_id)!.add(r.slot_id);
  });

  const results: TodayYogaClass[] = [];
  for (const b of active) {
    if (!b.template_id) continue;
    const reserved = reservationsByBooking.get(b.id) ?? new Set<string>();
    const list = ((instances as any) ?? []).filter((i: any) => reserved.has(i.id));
    for (const i of list) {
      const tmpl = tmplById.get(i.template_id);
      const dur = i.duration_min ?? tmpl?.duration_min ?? 60;
      const ends = new Date(new Date(i.scheduled_at).getTime() + dur * 60000).toISOString();
      results.push({
        booking_id: b.id,
        partner_id: b.partner_id,
        package_type: b.package_type,
        partner_name: partnerById.get(b.partner_id)?.name ?? null,
        partner_avatar: partnerById.get(b.partner_id)?.avatar_url ?? null,
        scheduled_at: i.scheduled_at,
        ends_at: ends,
        duration_min: dur,
        meet_link: i.meet_link ?? tmpl?.meet_link ?? null,
      });
    }
  }
  return results.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
}

export interface UpcomingYogaClass {
  instance_id: string;
  scheduled_at: string;
  ends_at: string;
  duration_min: number;
  meet_link: string | null;
}

/** All upcoming class instances for a booking's template, up to its expiry date. */
export async function fetchUpcomingClassesForBooking(
  bookingId: string | null,
  templateId: string | null,
  expiresOn: string | null,
): Promise<UpcomingYogaClass[]> {
  if (!templateId) return [];
  const nowIso = new Date().toISOString();
  let reservedSlotIds: string[] | null = null;
  if (bookingId) {
    const { data: reserved } = await supabase
      .from("yoga_booking_instances" as any)
      .select("slot_id")
      .eq("booking_id", bookingId);
    reservedSlotIds = ((reserved as any) ?? []).map((r: any) => r.slot_id).filter(Boolean);
    if (reservedSlotIds.length === 0) reservedSlotIds = null;
  }
  let q = supabase
    .from("channel_partner_slots" as any)
    .select("id, scheduled_at, meet_link, duration_min")
    .eq("is_active", true)
    .gte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(8);
  if (reservedSlotIds) q = q.in("id", reservedSlotIds);
  else q = q.eq("template_id", templateId);
  const { data } = await q;
  const { data: tmpl } = await supabase
    .from("channel_partner_slot_templates" as any)
    .select("meet_link, duration_min")
    .eq("id", templateId)
    .maybeSingle();
  const tDur = (tmpl as any)?.duration_min ?? 60;
  const tMeet = (tmpl as any)?.meet_link ?? null;
  return ((data as any) ?? []).map((s: any) => {
    const dur = s.duration_min ?? tDur;
    return {
      instance_id: s.id,
      scheduled_at: s.scheduled_at,
      ends_at: new Date(new Date(s.scheduled_at).getTime() + dur * 60000).toISOString(),
      duration_min: dur,
      meet_link: s.meet_link ?? tMeet,
    };
  });
}

