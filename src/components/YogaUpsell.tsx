import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, User, Calendar, Clock, CheckCircle2, Sparkles, X, Video } from "lucide-react";
import {
  fetchPartnersAndPackages,
  fetchMyBookings,
  createBooking,
  requestCustomSlot,
  fetchBookingMeetInfo,
  fetchUpcomingClassesForBooking,
  type Partner,
  type Pkg,
  type YogaBooking,
  type UpcomingYogaClass,
} from "@/lib/yogaBookingService";
import { fetchAvailableSlotsForPackage, formatDays, type AvailableSlot } from "@/lib/channelPartnerService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { payForService } from "@/lib/servicePayment";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function YogaUpsell() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [bookings, setBookings] = useState<YogaBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Pkg | null>(null);
  const [liveSlots, setLiveSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const fetchTokenRef = useRef(0);

  const [slot, setSlot] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null); // first available class instance id
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [preferredTime, setPreferredTime] = useState("");
  const [preferredDays, setPreferredDays] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentStep, setPaymentStep] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [requesting, setRequesting] = useState(false);

  async function load() {
    setLoading(true);
    const [pp, my] = await Promise.all([fetchPartnersAndPackages("yoga"), fetchMyBookings()]);
    setPartners(pp.partners);
    setPackages(pp.packages);
    setBookings(my);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const partnersById = useMemo(() => {
    const m: Record<string, Partner> = {};
    partners.forEach((p) => (m[p.id] = p));
    return m;
  }, [partners]);

  const activeBooking = bookings.find((b) => b.status !== "cancelled" && b.status !== "completed");

  const [meetInfo, setMeetInfo] = useState<{ meet_link: string | null; next_at: string | null } | null>(null);
  useEffect(() => {
    const tmpl = (activeBooking as any)?.template_id;
    const slot = (activeBooking as any)?.slot_id;
    if (tmpl) {
      fetchBookingMeetInfo(tmpl, "template").then(setMeetInfo).catch(() => setMeetInfo(null));
    } else if (slot) {
      fetchBookingMeetInfo(slot, "slot").then(setMeetInfo).catch(() => setMeetInfo(null));
    } else {
      setMeetInfo(null);
    }
  }, [activeBooking?.id, (activeBooking as any)?.template_id, (activeBooking as any)?.slot_id]);

  const [upcoming, setUpcoming] = useState<UpcomingYogaClass[]>([]);
  useEffect(() => {
    const tmpl = (activeBooking as any)?.template_id ?? null;
    if (!tmpl) { setUpcoming([]); return; }
    fetchUpcomingClassesForBooking(activeBooking?.id ?? null, tmpl, activeBooking?.expires_on ?? null)
      .then(setUpcoming)
      .catch(() => setUpcoming([]));
  }, [activeBooking?.id, (activeBooking as any)?.template_id, activeBooking?.expires_on]);

  const [openingPkgId, setOpeningPkgId] = useState<string | null>(null);

  async function openBook(p: Pkg) {
    // Fetch slots BEFORE opening the dialog so the sheet never renders the
    // "Continue to payment" footer while the slot list is still empty — users
    // reported the payment CTA flashing in first, then the slots popping in.
    const token = ++fetchTokenRef.current;
    setOpeningPkgId(p.id);
    let fetched: AvailableSlot[] = [];
    try {
      fetched = await fetchAvailableSlotsForPackage(p.id);
    } catch {
      fetched = [];
    }
    if (token !== fetchTokenRef.current) return; // stale — a newer open/close happened
    setLiveSlots(fetched);
    setSlotsLoading(false);
    setSlot(null);
    setSlotId(null);
    setTemplateId(null);
    setPreferredTime("");
    setPreferredDays([]);
    setNotes("");
    setPaymentStep(false);
    setCustomMode(false);
    setSelected(p);
    setOpeningPkgId(null);
  }

  function closeDialog() {
    fetchTokenRef.current++; // invalidate any pending fetch
    setSelected(null);
    setPaymentStep(false);
    setCustomMode(false);
    setLiveSlots([]);
    setSlotsLoading(false);
    setSlot(null);
    setSlotId(null);
    setTemplateId(null);
  }


  function canProceed() {
    if (!selected) return false;
    if (liveSlots.length > 0) return !!slotId && !!slot;
    if (selected.package_type === "group") return !!slot;
    return preferredTime.trim().length > 0 && preferredDays.length > 0;
  }

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const booking = await createBooking({
        partner_id: selected.partner_id,
        package_id: selected.id,
        package_type: selected.package_type,
        price_inr: selected.price_inr,
        selected_slot: slot,
        slot_id: slotId,
        template_id: templateId,
        preferred_time: preferredTime || null,
        preferred_days: preferredDays,
        notes: notes || null,
      });
      // Bookings are created unpaid; Razorpay collects before the seat is confirmed.
      const paid = await payForService("yoga", (booking as any).id);
      toast({
        title: paid ? "Payment successful" : "Booking confirmed",
        description: templateId
          ? "Your seat is reserved for the next 8 classes — meet link is on your home screen."
          : "Your instructor will revert with a confirmed schedule.",
      });
      await load();
      closeDialog();
    } catch (e: any) {
      toast({
        title: "Payment not completed",
        description: `${e.message ?? String(e)} A payment link has also been sent to you — your booking stays reserved until then.`,
        variant: "destructive",
      });
      await load();
    } finally {
      setSubmitting(false);
    }
  }


  async function submitCustomRequest() {
    if (!selected) return;
    if (!preferredTime.trim() || preferredDays.length === 0) {
      toast({ title: "Add a preferred time & days", description: "Tell your instructor when you'd like your 1:1.", variant: "destructive" });
      return;
    }
    setRequesting(true);
    try {
      await requestCustomSlot({
        partner_id: selected.partner_id,
        package_id: selected.id,
        package_type: selected.package_type,
        price_inr: selected.price_inr,
        preferred_time: preferredTime,
        preferred_days: preferredDays,
        notes: notes || null,
      });
      toast({
        title: "Request sent",
        description: "Your instructor has been notified and will confirm shortly.",
      });
      await load();
      closeDialog();
    } catch (e: any) {
      toast({ title: "Couldn't send request", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  }

  if (loading) return null;
  if (!packages.length && !activeBooking) return null;

  return (
    <section className="px-5 space-y-3">
      {activeBooking && (() => {
        const isAwaitingPayment = activeBooking.status === "awaiting_payment";
        const isWaiting =
          activeBooking.status === "pending_schedule" ||
          activeBooking.status === "custom_slot_requested" ||
          isAwaitingPayment;
        const isConfirmed = !isWaiting;
        const daysLabel = (arr?: string[] | null) => {
          if (!arr?.length) return "";
          const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          return arr.map((d) => (/^[0-6]$/.test(d) ? names[Number(d)] : d)).join(", ");
        };
        return (
          <div className="rounded-3xl p-5 bg-card ring-1 ring-border shadow-card">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
              <Calendar className="w-3.5 h-3.5" /> Your Yoga Schedule
            </div>
            <h3 className="mt-2 text-lg font-black text-foreground">
              {activeBooking.package_type === "group" ? "Group classes" : "1:1 private classes"} · {partnersById[activeBooking.partner_id]?.name ?? "Instructor"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {isConfirmed ? (
                activeBooking.selected_slot ? (
                  <>All classes reserved: <strong className="text-foreground">{activeBooking.selected_slot}</strong>. Join every upcoming class from the meet link below.</>
                ) : (
                  <>Your booking is confirmed for the full month.</>
                )
              ) : isAwaitingPayment ? (
                <>Instructor approved <strong className="text-foreground">{activeBooking.preferred_time}</strong>{activeBooking.preferred_days?.length ? ` · ${daysLabel(activeBooking.preferred_days)}` : ""}. Complete payment to lock your monthly series.</>
              ) : activeBooking.status === "custom_slot_requested" ? (
                <>Custom request sent: <strong className="text-foreground">{activeBooking.preferred_time}</strong>{activeBooking.preferred_days?.length ? ` · ${activeBooking.preferred_days.join(", ")}` : ""}. Your instructor will confirm.</>
              ) : activeBooking.package_type === "group" ? (
                <>Slot booked: <strong className="text-foreground">{activeBooking.selected_slot}</strong>. Your schedule is being created — your instructor will publish it shortly.</>
              ) : (
                <>Preferred: <strong className="text-foreground">{activeBooking.preferred_time}</strong>{activeBooking.preferred_days?.length ? ` · ${activeBooking.preferred_days.join(", ")}` : ""}. Your instructor will revert with a confirmed schedule.</>
              )}
            </p>
            {isAwaitingPayment && (
              <button
                onClick={async () => {
                  try {
                    const { payAndCreateCustomSlot } = await import("@/lib/yogaBookingService");
                    await payAndCreateCustomSlot(activeBooking.id);
                    toast({ title: "Payment received", description: "Your monthly series is booked!" });
                    await load();
                  } catch (e: any) {
                    toast({ title: "Payment failed", description: e.message ?? "Please try again", variant: "destructive" });
                  }
                }}
                className="mt-3 w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl font-bold text-sm text-white shadow-card bg-destructive"
              >
                Pay ₹{activeBooking.price_inr.toLocaleString("en-IN")} & confirm slot
              </button>
            )}
            {activeBooking.expires_on && (() => {
              const daysLeft = Math.max(
                0,
                Math.ceil((new Date(activeBooking.expires_on).getTime() - Date.now()) / 86400000),
              );
              const expiringSoon = daysLeft <= 7;
              return (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 font-semibold text-muted-foreground">
                    Validity: {daysLeft} day{daysLeft === 1 ? "" : "s"} left · till {new Date(activeBooking.expires_on).toLocaleDateString([], { day: "numeric", month: "short" })}
                  </span>
                  {expiringSoon && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 font-bold text-amber-700">
                      Renew soon to keep your slot
                    </span>
                  )}
                </div>
              );
            })()}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isConfirmed ? (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" /> Confirmed
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  <Clock className="w-3 h-3" /> Awaiting instructor confirmation
                </div>
              )}
              {isConfirmed && meetInfo?.meet_link && (
                <a
                  href={meetInfo.meet_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground shadow-card hover:opacity-90"
                >
                  <Video className="w-3 h-3" /> Google Meet
                </a>
              )}
              {isConfirmed && !meetInfo?.meet_link && (
                <span className="text-[11px] text-muted-foreground">
                  Meet link will be shared before your next class.
                </span>
              )}
            </div>

            {isConfirmed && upcoming.length > 0 && (
              <div className="mt-4 rounded-2xl bg-background ring-1 ring-border/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Upcoming 8 classes ({upcoming.length})
                  </p>
                </div>
                <ul className="divide-y divide-border/50">
                  {upcoming.map((c) => {
                    const d = new Date(c.scheduled_at);
                    const now = Date.now();
                    const start = d.getTime();
                    const end = new Date(c.ends_at).getTime();
                    const isLive = now >= start && now <= end;
                    return (
                      <li key={c.instance_id} className="py-2 flex items-center gap-3">
                        <div className="w-11 text-center shrink-0">
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">
                            {d.toLocaleDateString([], { month: "short" })}
                          </p>
                          <p className="text-base font-black text-foreground leading-none">
                            {d.getDate()}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {d.toLocaleDateString([], { weekday: "long" })}
                          </p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {c.duration_min} min
                          </p>
                        </div>
                        {isLive ? (
                          <a
                            href={c.meet_link ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white"
                          >
                            <Video className="w-3 h-3" /> Join
                          </a>
                        ) : c.meet_link ? (
                          <a
                            href={c.meet_link}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-foreground hover:bg-accent"
                          >
                            <Video className="w-3 h-3" /> Link
                          </a>
                        ) : (
                          <span className="shrink-0 text-[10px] text-muted-foreground">Link soon</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        );
      })()}


      {!activeBooking && packages.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-black uppercase tracking-[0.12em] text-foreground/80">
              Upgrade — Live Yoga with an Instructor
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {packages.map((p) => {
              const partner = partnersById[p.partner_id];
              const isGroup = p.package_type === "group";
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-3xl p-5 bg-card ring-1 ring-border shadow-card flex flex-col"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                      {isGroup ? <Users className="w-5 h-5 text-primary" /> : <User className="w-5 h-5 text-primary" />}
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {isGroup ? "Group Class" : "1:1 Private"}
                      </p>
                      <h3 className="text-base font-black text-foreground leading-tight">{p.name}</h3>
                    </div>
                  </div>

                  {partner && (
                    <div className="mt-3 flex items-start gap-2">
                      <div className="w-9 h-9 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center shrink-0">
                        {partner.avatar_url ? (
                          <img src={partner.avatar_url} alt={partner.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-primary font-black text-xs">{partner.name?.[0] ?? "Y"}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        With <span className="font-semibold text-foreground">{partner.name}</span>
                        {partner.headline ? ` — ${partner.headline}` : partner.bio ? ` — ${partner.bio}` : ""}
                      </p>
                    </div>
                  )}
                  {p.description && (
                    <p className="mt-2 text-xs text-muted-foreground">{p.description}</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                    {p.classes_per_month && (
                      <span className="rounded-full bg-muted px-2 py-0.5">{p.classes_per_month} classes</span>
                    )}
                    {p.duration_minutes && (
                      <span className="rounded-full bg-muted px-2 py-0.5">{p.duration_minutes} min / class</span>
                    )}
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Price</p>
                      <p className="text-2xl font-black text-foreground">
                        ₹{p.price_inr.toLocaleString("en-IN")}
                        <span className="text-xs font-medium text-muted-foreground"> /mo</span>
                      </p>
                    </div>
                    <Button
                      onClick={() => openBook(p)}
                      disabled={openingPkgId === p.id}
                      className="bg-[var(--bbdo-red)] hover:bg-[var(--bbdo-red)]/90 text-white disabled:opacity-70"
                    >
                      {openingPkgId === p.id
                        ? "Loading slots…"
                        : isGroup ? "Choose slot" : "Book now"}
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {paymentStep
                ? "Confirm & Pay"
                : customMode
                ? "Request a custom slot"
                : selected?.package_type === "group" || liveSlots.length > 0
                ? "Select your slot"
                : "Your preferred time"}
            </DialogTitle>
          </DialogHeader>

          {selected && !paymentStep && !customMode && (selected.package_type === "group" || liveSlots.length > 0) && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                {liveSlots.length > 0
                  ? selected.package_type === "private"
                    ? "Available 1:1 recurring slots. Pick an open one — full slots are shown so you can request the same timing."
                    : "Recurring class slots from your instructor. Pick one to reserve your seat for the whole series."
                  : selected.package_type === "group"
                    ? "Your instructor hasn't published any group classes yet. Please check back soon — we'll notify you the moment new slots open."
                    : "Your instructor hasn't published live classes yet. Request a custom slot below and they'll confirm the schedule."}
              </p>
              {slotsLoading && <p className="text-xs text-muted-foreground">Loading slots…</p>}

              {liveSlots.length > 0 && (
                <div className="grid gap-2">
                  {liveSlots
                    .filter((s) => selected.package_type !== "private" || s.series_available_seats > 0)
                    .map((s) => {
                      const active = slotId === s.first_available_instance_id && slotId !== null;
                      const nextAt = s.next_class_at ? new Date(s.next_class_at) : null;
                      const period = Number(s.time_of_day.split(":")[0]) >= 12 ? "PM" : "AM";
                      const hh = ((Number(s.time_of_day.split(":")[0]) + 11) % 12) + 1;
                      const timeLabel = `${hh}:${s.time_of_day.split(":")[1]} ${period}`;
                      const label = `${s.label} · ${timeLabel} · ${formatDays(s.days_of_week)}`;
                      const full = s.series_available_seats <= 0 || !s.first_available_instance_id;
                      return (
                        <button
                          key={s.template_id}
                          disabled={full}
                          onClick={() => { setSlotId(s.first_available_instance_id); setTemplateId(s.template_id); setSlot(label); }}
                          className={`text-left rounded-2xl px-4 py-3 text-sm ring-1 transition-colors ${
                            active
                              ? "bg-primary/10 ring-primary text-foreground"
                              : full
                              ? "bg-muted/40 ring-border text-muted-foreground cursor-not-allowed"
                              : "bg-card ring-border hover:bg-accent"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {active && <CheckCircle2 className="w-4 h-4 text-primary" />}
                            <span className="font-semibold">{label}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <Video className="w-3 h-3" /> {s.meet_link ? "Google Meet link included" : "Link shared before class"}
                            <span>· {Math.min(8, s.upcoming_count)} upcoming classes</span>
                            {s.package_type === "group" ? (
                              <span>· {s.series_available_seats} seats left for full series</span>
                            ) : (
                              <span>· {s.booked_count_total}/{s.capacity_total} booked</span>
                            )}
                            {nextAt && <span>· starts {nextAt.toLocaleDateString([], { day: "numeric", month: "short" })}</span>}
                            {full && <span className="text-destructive font-semibold">Full</span>}
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}

              {liveSlots.length === 0 && !slotsLoading && selected.package_type === "group" && (
                <div className="rounded-2xl bg-muted/40 ring-1 ring-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No group classes have been scheduled yet. Please check back shortly.
                </div>
              )}

              {selected.package_type === "private" && liveSlots.length > 0 && liveSlots.every((s) => s.series_available_seats <= 0) && (
                <div className="rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                  All published private recurring slots are booked for the full monthly series.
                </div>
              )}

              {selected.package_type === "private" && (
                <button
                  type="button"
                  onClick={() => { setCustomMode(true); setSlot(null); setSlotId(null); setTemplateId(null); }}
                  className="w-full mt-1 rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ring-dashed ring-primary/50 text-primary hover:bg-primary/5 transition-colors"
                >
                  {liveSlots.length === 0
                    ? "Request a custom slot"
                    : liveSlots.every((s) => s.series_available_seats <= 0)
                    ? "All slots are booked — request a custom slot"
                    : "None of these work? Request a custom slot"}
                </button>
              )}
            </div>
          )}

          {selected && !paymentStep && (customMode || (selected.package_type === "private" && liveSlots.length === 0)) && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Tell us when you'd prefer your 1:1 sessions. {selected.name && <>Your instructor {partnersById[selected.partner_id]?.name ?? ""} will be notified and confirm.</>}
              </p>
              <div>
                <Label className="text-xs">Preferred time (e.g. 7:00 AM)</Label>
                <Input value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} placeholder="7:00 AM" />
              </div>
              <div>
                <Label className="text-xs">Preferred days</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {DAYS.map((d) => {
                    const on = preferredDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setPreferredDays(on ? preferredDays.filter((x) => x !== d) : [...preferredDays, d])
                        }
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label className="text-xs">Anything your instructor should know? (optional)</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}

          {selected && paymentStep && (
            <div className="space-y-3 py-2">
              <div className="rounded-2xl bg-muted/50 p-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Package</span><span className="font-semibold">{selected.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-semibold capitalize">{selected.package_type}</span></div>
                {slot && <div className="flex justify-between"><span className="text-muted-foreground">Slot</span><span className="font-semibold">{slot}</span></div>}
                {preferredTime && <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-semibold">{preferredTime}</span></div>}
                {preferredDays.length > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Days</span><span className="font-semibold">{preferredDays.join(", ")}</span></div>}
                <div className="border-t pt-2 flex justify-between text-base"><span>Total</span><span className="font-black">₹{selected.price_inr.toLocaleString("en-IN")}</span></div>
              </div>
              <p className="text-xs text-muted-foreground">
                This is a demo payment. In production, you'll be redirected to a secure gateway.
              </p>
            </div>
          )}

          <DialogFooter>
            {paymentStep ? (
              <>
                <Button variant="outline" onClick={() => setPaymentStep(false)} disabled={submitting}>Back</Button>
                <Button
                  onClick={submit}
                  disabled={submitting}
                  className="bg-[var(--bbdo-red)] hover:bg-[var(--bbdo-red)]/90 text-white"
                >
                  {submitting ? "Processing…" : `Pay ₹${selected?.price_inr.toLocaleString("en-IN")}`}
                </Button>
              </>
            ) : customMode ? (
              <>
                <Button variant="outline" onClick={() => setCustomMode(false)} disabled={requesting}>
                  {liveSlots.length > 0 ? "Back to slots" : "Cancel"}
                </Button>
                <Button
                  onClick={submitCustomRequest}
                  disabled={requesting || !preferredTime.trim() || preferredDays.length === 0}
                  className="bg-[var(--bbdo-red)] hover:bg-[var(--bbdo-red)]/90 text-white"
                >
                  {requesting ? "Sending…" : "Send request"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button onClick={() => setPaymentStep(true)} disabled={!canProceed()}>Continue to payment</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </section>
  );
}
