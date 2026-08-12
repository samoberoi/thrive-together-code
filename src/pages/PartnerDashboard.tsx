import logoImg from "@/assets/logo.png";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Home,
  Package as PackageIcon,
  Users,
  User as UserIcon,
  LogOut,
  Handshake,
  Calendar,
  Camera,
  Save,
  TrendingUp,
  IndianRupee,
  UserPlus,
  RefreshCw,
  Clock,
  MessageCircle,
} from "lucide-react";
import YogaChat from "@/components/chat/YogaChat";
import DateRangeFilter, { defaultRange, type DateRange } from "@/components/admin/DateRangeFilter";
import NotificationCenter from "@/components/NotificationCenter";
import PackageSlotsManager from "@/components/channel-partner/PackageSlotsManager";
import AvatarPhotoPicker from "@/components/AvatarPhotoPicker";
import {
  fetchMyPartner,
  fetchPartnerPackages,
  fetchPartnerSlots,
  fetchPartnerBookings,
  updateMyPartnerProfile,
  type PartnerRecord,
  type PartnerPackage,
  type PartnerSlot,
  type PartnerBooking,
} from "@/lib/channelPartnerService";
import { approveCustomSlotRequest } from "@/lib/yogaBookingService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import NotificationsPanel from "@/components/NotificationsPanel";
import { useAttentionCounts } from "@/hooks/useAttentionCounts";
import AttentionBadge from "@/components/attention/AttentionBadge";
import { RoleBottomNav, RoleTopBar } from "@/components/shared";

type PartnerTab = "home" | "packages" | "subscribers" | "profile";

const navItems: { id: PartnerTab; icon: React.ElementType; label: string }[] = [
  { id: "home", icon: Home, label: "Overview" },
  { id: "packages", icon: PackageIcon, label: "My Packages" },
  { id: "subscribers", icon: Users, label: "Subscribers" },
  { id: "profile", icon: UserIcon, label: "Profile" },
];

type ProfileForm = {
  name: string;
  headline: string;
  bio: string;
  contact_email: string;
  contact_phone: string;
  experience_years: string;
  certifications: string;
  languages: string;
  service_locations: string;
  instagram_url: string;
  website_url: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc: string;
};

const asList = (value: unknown): string[] => (Array.isArray(value) ? value.filter(Boolean).map(String) : []);
const listToCsv = (value: unknown) => asList(value).join(", ");
const csvToList = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

function profileToForm(partner: PartnerRecord): ProfileForm {
  return {
    name: partner.name ?? "",
    headline: partner.headline ?? "",
    bio: partner.bio ?? "",
    contact_email: partner.contact_email ?? "",
    contact_phone: partner.contact_phone ?? "",
    experience_years: partner.experience_years == null ? "" : String(partner.experience_years),
    certifications: listToCsv(partner.certifications),
    languages: listToCsv(partner.languages),
    service_locations: listToCsv(partner.service_locations),
    instagram_url: partner.instagram_url ?? "",
    website_url: partner.website_url ?? "",
    address_line1: partner.address_line1 ?? "",
    address_line2: partner.address_line2 ?? "",
    city: partner.city ?? "",
    state: partner.state ?? "",
    pincode: partner.pincode ?? "",
    bank_name: partner.bank_name ?? "",
    bank_account_number: partner.bank_account_number ?? "",
    bank_ifsc: partner.bank_ifsc ?? "",
  };
}

export default function PartnerDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { counts: attentionCounts } = useAttentionCounts();
  const [partner, setPartner] = useState<PartnerRecord | null>(null);
  const [packages, setPackages] = useState<PartnerPackage[]>([]);
  const [slots, setSlots] = useState<PartnerSlot[]>([]);
  const [bookings, setBookings] = useState<PartnerBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PartnerTab>("home");
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [chatWith, setChatWith] = useState<{ subscriberId: string; name: string | null } | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [approveDialog, setApproveDialog] = useState<{
    open: boolean;
    booking: PartnerBooking | null;
    time: string;
    days: number[];
    meet: string;
    saving: boolean;
  }>({ open: false, booking: null, time: "07:00", days: [1, 3, 5], meet: "", saving: false });

  const openApprove = (b: PartnerBooking) => {
    // Prefill from user's preferred_time if it's HH:MM
    const t = /^\d{1,2}:\d{2}$/.test(b.preferred_time || "") ? (b.preferred_time as string) : "07:00";
    const daysMap: Record<string, number> = {
      sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
    };
    const prefDays = (b.preferred_days || [])
      .map((d) => (/^[0-6]$/.test(d) ? Number(d) : daysMap[d.slice(0, 3).toLowerCase()]))
      .filter((n): n is number => typeof n === "number" && !Number.isNaN(n));
    setApproveDialog({
      open: true,
      booking: b,
      time: t,
      days: prefDays.length ? prefDays : [1, 3, 5],
      meet: "",
      saving: false,
    });
  };

  const submitApprove = async () => {
    if (!approveDialog.booking) return;
    if (!approveDialog.days.length) return toast.error("Pick at least one weekday");
    setApproveDialog((s) => ({ ...s, saving: true }));
    try {
      await approveCustomSlotRequest({
        booking_id: approveDialog.booking.id,
        time_of_day: approveDialog.time,
        days_of_week: approveDialog.days,
        meet_link: approveDialog.meet.trim() || null,
      });
      toast.success("Approved — subscriber notified to pay");
      setApproveDialog({ open: false, booking: null, time: "07:00", days: [1, 3, 5], meet: "", saving: false });
      await reloadBookings();
    } catch (e: any) {
      toast.error(e.message ?? "Approve failed");
      setApproveDialog((s) => ({ ...s, saving: false }));
    }
  };

  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    (async () => {
      setLoading(true);
      const p = await fetchMyPartner();
      if (!p) {
        toast.error("No partner account linked to this phone.");
        navigate("/home", { replace: true });
        return;
      }
      setPartner(p);
      setProfileForm(profileToForm(p));
      const [pk, sl, bk] = await Promise.all([
        fetchPartnerPackages(p.id),
        fetchPartnerSlots(p.id),
        fetchPartnerBookings(p.id),
      ]);
      setPackages(pk);
      setSlots(sl);
      setBookings(bk);
      setLoading(false);
    })();
  }, [user, navigate]);

  useEffect(() => {
    const tab = searchParams.get("tab") as PartnerTab | null;
    if (tab && navItems.some((item) => item.id === tab)) {
      setActiveTab(tab);
      setNotificationsOpen(false);
    }
  }, [searchParams]);

  useEffect(() => {
    const openHandler = () => {
      window.dispatchEvent(new CustomEvent("nav:notifications-opened"));
      setNotificationsOpen(true);
    };
    window.addEventListener("nav:open-notifications", openHandler);
    return () => window.removeEventListener("nav:open-notifications", openHandler);
  }, []);

  useEffect(() => {
    if (!partner) return;
    const channel = supabase
      .channel(`partner-bookings-${partner.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "yoga_bookings", filter: `partner_id=eq.${partner.id}` },
        () => void reloadBookings(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partner?.id]);

  const upcomingSlots = useMemo(
    () => slots.filter((s) => new Date(s.scheduled_at) >= new Date(Date.now() - 60 * 60 * 1000)),
    [slots]
  );

  const packagesById = useMemo(() => {
    const m: Record<string, PartnerPackage> = {};
    packages.forEach((p) => (m[p.id] = p));
    return m;
  }, [packages]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const reloadBookings = async () => {
    if (partner) setBookings(await fetchPartnerBookings(partner.id));
  };

  const reloadSlots = async () => {
    if (partner) setSlots(await fetchPartnerSlots(partner.id));
  };

  const updateProfileField = (key: keyof ProfileForm, value: string) => {
    setProfileForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleAvatarUpload = async (blob: Blob, ext: string) => {
    if (!user || !partner) return;
    setAvatarUploading(true);
    try {
      const path = `${user.id}/channel-partner-${partner.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: blob.type || `image/${ext}` });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatar_url = `${publicUrl}?t=${Date.now()}`;
      await updateMyPartnerProfile(partner.id, { avatar_url });
      setPartner({ ...partner, avatar_url });
      toast.success("Teacher photo updated");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!partner || !profileForm) return;
    if (profileForm.name.trim().length < 2) return toast.error("Name is required");
    setProfileSaving(true);
    try {
      const payload = {
        name: profileForm.name.trim(),
        headline: profileForm.headline.trim() || null,
        bio: profileForm.bio.trim() || null,
        contact_email: profileForm.contact_email.trim() || null,
        contact_phone: profileForm.contact_phone.trim() || null,
        experience_years: profileForm.experience_years.trim() ? Number(profileForm.experience_years) : null,
        certifications: csvToList(profileForm.certifications),
        languages: csvToList(profileForm.languages),
        service_locations: csvToList(profileForm.service_locations),
        instagram_url: profileForm.instagram_url.trim() || null,
        website_url: profileForm.website_url.trim() || null,
        address_line1: profileForm.address_line1.trim() || null,
        address_line2: profileForm.address_line2.trim() || null,
        city: profileForm.city.trim() || null,
        state: profileForm.state.trim() || null,
        pincode: profileForm.pincode.trim() || null,
        bank_name: profileForm.bank_name.trim() || null,
        bank_account_number: profileForm.bank_account_number.trim() || null,
        bank_ifsc: profileForm.bank_ifsc.trim() || null,
      };
      await updateMyPartnerProfile(partner.id, payload);
      setPartner({ ...partner, ...payload });
      setEditingProfile(false);
      toast.success("Profile updated");
    } catch (e: any) {
      toast.error(e.message ?? "Update failed");
    } finally {
      setProfileSaving(false);
    }
  };

  if (loading || !partner) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-muted-foreground">
        Loading your studio…
      </div>
    );
  }

  const initial = (partner.name?.[0] ?? "P").toUpperCase();

  const bookingSeries = (b: PartnerBooking) => {
    const reservedIds = new Set(b.booked_slot_ids ?? []);
    const rows = (reservedIds.size > 0
      ? slots.filter((s) => reservedIds.has(s.id))
      : b.template_id
      ? slots.filter((s) => {
          if (s.template_id !== b.template_id) return false;
          const day = new Date(s.scheduled_at);
          day.setHours(0, 0, 0, 0);
          const starts = b.starts_on ? new Date(`${b.starts_on}T00:00:00`) : null;
          const expires = b.expires_on ? new Date(`${b.expires_on}T23:59:59`) : null;
          return (!starts || day >= starts) && (!expires || day <= expires);
        })
      : b.slot_id
      ? slots.filter((s) => s.id === b.slot_id)
      : []
    ).sort((a, z) => a.scheduled_at.localeCompare(z.scheduled_at));
    const booked = rows.reduce((sum, s) => sum + (s.booked_count ?? 0), 0);
    const capacity = rows.reduce((sum, s) => sum + (s.capacity ?? 0), 0);
    return { rows, booked, capacity, first: rows[0], last: rows[rows.length - 1] };
  };

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const inRange = (iso?: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= range.from && d <= range.to;
  };

  const paidStatuses = new Set(["scheduled", "active", "completed", "confirmed"]);
  const isPaid = (b: PartnerBooking) =>
    b.payment_status === "paid" || paidStatuses.has(b.status);

  const bookingsInRange = bookings.filter((b) => inRange(b.created_at));
  const revenueInRange = bookingsInRange
    .filter(isPaid)
    .reduce((sum, b) => sum + (b.price_inr || 0), 0);
  const newSubsInRange = bookingsInRange.filter(isPaid).length;
  const activeSubsNow = bookings.filter(
    (b) => isPaid(b) && (!b.expires_on || new Date(b.expires_on) >= now)
  ).length;
  const upcomingRenewals = bookings
    .filter(
      (b) =>
        isPaid(b) &&
        b.expires_on &&
        new Date(b.expires_on) >= now &&
        new Date(b.expires_on) <= in30
    )
    .sort((a, z) => (a.expires_on || "").localeCompare(z.expires_on || ""));
  const recentSubs = [...bookingsInRange]
    .filter(isPaid)
    .sort((a, z) => (z.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 5);
  const pendingApprovals = bookings.filter(
    (b) => b.status === "custom_slot_requested" || b.status === "awaiting_payment"
  ).length;
  const tabAttentionCounts: Partial<Record<PartnerTab, number>> = {
    subscribers: attentionCounts.partnerMessages + pendingApprovals,
  };

  const statCards: {
    label: string;
    value: string | number;
    icon: React.ElementType;
    tint: string;
    text: string;
    ring: string;
  }[] = [
    { label: "Revenue", value: `₹${revenueInRange.toLocaleString("en-IN")}`, icon: IndianRupee, tint: "bg-emerald-500/10", text: "text-emerald-600", ring: "ring-emerald-500/20" },
    { label: "New subscribers", value: newSubsInRange, icon: UserPlus, tint: "bg-blue-500/10", text: "text-blue-600", ring: "ring-blue-500/20" },
    { label: "Active subscribers", value: activeSubsNow, icon: Users, tint: "bg-violet-500/10", text: "text-violet-600", ring: "ring-violet-500/20" },
    { label: "Packages", value: packages.length, icon: PackageIcon, tint: "bg-amber-500/10", text: "text-amber-600", ring: "ring-amber-500/20" },
    { label: "Upcoming classes", value: upcomingSlots.length, icon: Calendar, tint: "bg-cyan-500/10", text: "text-cyan-600", ring: "ring-cyan-500/20" },
    { label: "Renewals (30d)", value: upcomingRenewals.length, icon: RefreshCw, tint: "bg-rose-500/10", text: "text-rose-600", ring: "ring-rose-500/20" },
  ];

  const HomeTab = (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-bold">
            Channel Partner · {partner.partner_type}
          </p>
          <h1 className="text-2xl font-black text-foreground mt-1">Welcome, {partner.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Studio pulse · <b>{range.label}</b>
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className={`p-4 ring-1 ${c.ring}`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl ${c.tint} ${c.text} flex items-center justify-center shrink-0`}>
                  <Icon className="w-5 h-5" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                    {c.label}
                  </div>
                  <div className={`text-2xl font-black ${c.text} leading-tight`}>{c.value}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {pendingApprovals > 0 && (
        <Card className="p-4 flex items-center gap-3 bg-amber-500/5 ring-1 ring-amber-500/30">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-foreground">{pendingApprovals} request{pendingApprovals === 1 ? "" : "s"} need your attention</div>
            <div className="text-xs text-muted-foreground">Custom slot approvals or pending payments.</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setActiveTab("subscribers")}>Review</Button>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Upcoming renewals · next 30 days</h2>
          </div>
          {upcomingRenewals.length === 0 ? (
            <Card className="p-5 text-sm text-muted-foreground">No renewals due in the next 30 days.</Card>
          ) : (
            <div className="space-y-2">
              {upcomingRenewals.slice(0, 5).map((b) => {
                const days = Math.max(0, Math.ceil((new Date(b.expires_on!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
                return (
                  <Card key={b.id} className="p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{b.user_name || "Subscriber"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {packagesById[b.package_id]?.name ?? "Package"} · expires {new Date(b.expires_on!).toLocaleDateString([], { day: "numeric", month: "short" })}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-600 px-2 py-0.5 rounded-full">
                      {days === 0 ? "today" : `${days}d`}
                    </span>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">New subscribers · {range.label}</h2>
          </div>
          {recentSubs.length === 0 ? (
            <Card className="p-5 text-sm text-muted-foreground">No new subscribers in this period.</Card>
          ) : (
            <div className="space-y-2">
              {recentSubs.map((b) => (
                <Card key={b.id} className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{b.user_name || "Subscriber"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {packagesById[b.package_id]?.name ?? "Package"} · {new Date(b.created_at).toLocaleDateString([], { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-600">₹{(b.price_inr || 0).toLocaleString("en-IN")}</span>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Next 5 classes</h2>
        </div>
        {upcomingSlots.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            No classes scheduled yet. Go to <b>My Packages</b> and add slots to each package.
          </Card>
        ) : (
          <div className="space-y-2">
            {upcomingSlots.slice(0, 5).map((s) => (
              <Card key={s.id} className="p-3 flex items-center gap-3">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">
                    {new Date(s.scheduled_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    <span className="text-xs text-muted-foreground ml-2">
                      · {packagesById[s.package_id ?? ""]?.name ?? s.title ?? "Class"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.duration_min}m · {s.booked_count}/{s.capacity} booked
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const PackagesTab = (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-foreground">My Packages</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add class slots directly under each package. Subscribers pick from these when booking.
        </p>
      </div>
      {packages.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No packages yet. Ask your BBDO admin to create them.
        </Card>
      ) : (
        <div className="space-y-4">
          {packages.map((k) => (
            <Card key={k.id} className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  {k.package_type === "group" ? (
                    <Users className="w-5 h-5 text-primary" />
                  ) : (
                    <UserIcon className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black text-foreground">{k.name}</h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {k.package_type}
                    </span>
                    {!k.is_active && <span className="text-[10px] text-muted-foreground">inactive</span>}
                  </div>
                  {k.description && <p className="text-xs text-muted-foreground mt-1">{k.description}</p>}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                    <span>₹{k.price_inr.toLocaleString("en-IN")}/mo</span>
                    {k.classes_per_month != null && <span>· {k.classes_per_month} classes/mo</span>}
                    {k.duration_minutes != null && <span>· {k.duration_minutes} min</span>}
                  </div>
                </div>
              </div>
              <PackageSlotsManager
                partnerId={partner.id}
                packageId={k.id}
                packageType={k.package_type}
                packageName={k.name}
                defaultDurationMin={k.duration_minutes ?? undefined}
                onChanged={reloadSlots}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const SubscribersTab = (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-foreground">Subscribers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          People who purchased your packages and the recurring slot reserved for their full monthly series.
        </p>
      </div>
      {bookings.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No subscribers yet.</Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const pkgName = packagesById[b.package_id]?.name ?? "Package";
            const isWaiting = b.status === "pending_schedule" || b.status === "custom_slot_requested" || b.status === "awaiting_payment";
            const series = bookingSeries(b);
            const firstAt = series.first ? new Date(series.first.scheduled_at) : null;
            const lastAt = series.last ? new Date(series.last.scheduled_at) : null;
            return (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {b.package_type === "group" ? (
                        <Users className="w-4 h-4 text-primary" />
                      ) : (
                        <UserIcon className="w-4 h-4 text-primary" />
                      )}
                      <span className="font-bold">{b.user_name || "Subscriber"}</span>
                      {b.user_phone && (
                        <span className="text-xs text-muted-foreground">· {b.user_phone}</span>
                      )}
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isWaiting ? "bg-amber-500/15 text-amber-700" : "bg-emerald-500/15 text-emerald-700"
                      }`}>
                        {b.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pkgName} · <span className="capitalize">{b.package_type}</span> · ₹{b.price_inr.toLocaleString("en-IN")}
                    </p>
                    <p className="text-xs mt-1">
                      <span className="text-muted-foreground">Recurring slot: </span>
                      <b className="text-foreground">
                        {b.selected_slot || series.first?.template_label || series.first?.title || (isWaiting ? "Custom slot requested" : "—")}
                      </b>
                    </p>
                    {series.rows.length > 0 && (
                      <p className="text-xs mt-0.5 text-muted-foreground">
                        {series.rows.length} classes · {firstAt?.toLocaleDateString([], { day: "numeric", month: "short" })}
                        {lastAt && firstAt && lastAt.toDateString() !== firstAt.toDateString()
                          ? ` – ${lastAt.toLocaleDateString([], { day: "numeric", month: "short" })}`
                          : ""}
                      </p>
                    )}
                    {(b.preferred_time || (b.preferred_days && b.preferred_days.length > 0)) && (
                      <p className="text-xs mt-0.5 text-muted-foreground">
                        Prefers: {b.preferred_time || ""} {b.preferred_days?.join(", ")}
                      </p>
                    )}
                    {b.notes && <p className="text-xs mt-1 text-muted-foreground italic">"{b.notes}"</p>}
                  </div>
                  <div className="w-full sm:w-56 rounded-xl bg-muted/50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                      Series booking
                    </div>
                    {isWaiting ? (
                      <>
                        <div className="mt-1 text-sm font-black text-amber-700">Custom request</div>
                        {b.status === "custom_slot_requested" && (
                          <Button
                            size="sm"
                            className="w-full mt-2 h-8 text-[11px]"
                            onClick={() => openApprove(b)}
                          >
                            Approve & send to payment
                          </Button>
                        )}
                        {b.status === "pending_schedule" && b.payment_status !== "pending" && (
                          <div className="mt-1 text-[11px] text-muted-foreground">Awaiting payment from subscriber</div>
                        )}
                      </>
                    ) : b.status === "awaiting_payment" ? (
                      <div className="mt-1 text-sm font-black text-amber-700">Awaiting payment</div>
                    ) : series.capacity > 0 ? (
                      <>
                        <div className="mt-1 text-2xl font-black text-foreground">
                          {series.booked}/{series.capacity}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {series.booked >= series.capacity ? "Fully booked for this series" : "Reserved classes"}
                        </div>
                      </>
                    ) : (
                      <div className="mt-1 text-sm font-black text-muted-foreground">No generated classes</div>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setChatWith({ subscriberId: b.user_id, name: b.user_name ?? null })
                    }
                    className="h-8 text-[11px] gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Message
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  const ChatOverlay = chatWith && partner ? (
    <div className="fixed inset-0 z-50 bg-background">
      <YogaChat
        role="partner"
        subscriberId={chatWith.subscriberId}
        partnerId={partner.id}
        subscriberName={chatWith.name}
        onBack={() => setChatWith(null)}
      />
    </div>
  ) : null;

  const ProfileTab = (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground">Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage the teacher identity users see while booking.</p>
        </div>
        <Button variant={editingProfile ? "outline" : "default"} onClick={() => {
          setProfileForm(profileToForm(partner));
          setEditingProfile((v) => !v);
        }}>
          {editingProfile ? "Cancel" : "Edit profile"}
        </Button>
      </div>
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-4">
          <AvatarPhotoPicker
            avatarUrl={partner.avatar_url}
            fallback={initial}
            uploading={avatarUploading}
            onUpload={handleAvatarUpload}
            variant="avatar"
          />
          <div className="min-w-0 flex-1">
            <div className="font-black text-lg">{partner.name}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              Channel Partner · {partner.partner_type}
            </div>
            {partner.headline && <p className="text-sm text-muted-foreground mt-1">{partner.headline}</p>}
            <div className="mt-2">
              <AvatarPhotoPicker
                avatarUrl={partner.avatar_url}
                fallback={initial}
                uploading={avatarUploading}
                onUpload={handleAvatarUpload}
                variant="inline"
                triggerLabel="Update teacher photo"
              />
            </div>
          </div>
        </div>

        {editingProfile && profileForm ? (
          <div className="space-y-5 pt-2">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input value={profileForm.name} onChange={(e) => updateProfileField("name", e.target.value)} />
              </div>
              <div>
                <Label>Headline</Label>
                <Input value={profileForm.headline} onChange={(e) => updateProfileField("headline", e.target.value)} placeholder="Yoga teacher · metabolic mobility" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={profileForm.contact_email} onChange={(e) => updateProfileField("contact_email", e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={profileForm.contact_phone} onChange={(e) => updateProfileField("contact_phone", e.target.value)} />
              </div>
              <div>
                <Label>Experience years</Label>
                <Input type="number" min={0} value={profileForm.experience_years} onChange={(e) => updateProfileField("experience_years", e.target.value)} />
              </div>
              <div>
                <Label>Languages</Label>
                <Input value={profileForm.languages} onChange={(e) => updateProfileField("languages", e.target.value)} placeholder="Hindi, English" />
              </div>
              <div>
                <Label>Certifications</Label>
                <Input value={profileForm.certifications} onChange={(e) => updateProfileField("certifications", e.target.value)} placeholder="RYT 200, Yoga Therapy" />
              </div>
              <div>
                <Label>Service locations</Label>
                <Input value={profileForm.service_locations} onChange={(e) => updateProfileField("service_locations", e.target.value)} placeholder="Online, Delhi NCR" />
              </div>
            </div>
            <div>
              <Label>Bio</Label>
              <Textarea rows={3} value={profileForm.bio} onChange={(e) => updateProfileField("bio", e.target.value)} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Instagram</Label>
                <Input value={profileForm.instagram_url} onChange={(e) => updateProfileField("instagram_url", e.target.value)} placeholder="https://instagram.com/..." />
              </div>
              <div>
                <Label>Website</Label>
                <Input value={profileForm.website_url} onChange={(e) => updateProfileField("website_url", e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Address line 1</Label>
                <Input value={profileForm.address_line1} onChange={(e) => updateProfileField("address_line1", e.target.value)} />
              </div>
              <div>
                <Label>Address line 2</Label>
                <Input value={profileForm.address_line2} onChange={(e) => updateProfileField("address_line2", e.target.value)} />
              </div>
              <div>
                <Label>City</Label>
                <Input value={profileForm.city} onChange={(e) => updateProfileField("city", e.target.value)} />
              </div>
              <div>
                <Label>State</Label>
                <Input value={profileForm.state} onChange={(e) => updateProfileField("state", e.target.value)} />
              </div>
              <div>
                <Label>Pincode</Label>
                <Input value={profileForm.pincode} onChange={(e) => updateProfileField("pincode", e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Bank name</Label>
                <Input value={profileForm.bank_name} onChange={(e) => updateProfileField("bank_name", e.target.value)} />
              </div>
              <div>
                <Label>Account number</Label>
                <Input value={profileForm.bank_account_number} onChange={(e) => updateProfileField("bank_account_number", e.target.value)} />
              </div>
              <div>
                <Label>IFSC</Label>
                <Input value={profileForm.bank_ifsc} onChange={(e) => updateProfileField("bank_ifsc", e.target.value)} />
              </div>
            </div>
            <Button onClick={saveProfile} disabled={profileSaving}>
              <Save className="w-4 h-4 mr-1.5" /> {profileSaving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        ) : (
          <div className="grid gap-2 text-sm">
            {partner.contact_email && <div><b>Email:</b> {partner.contact_email}</div>}
            {partner.contact_phone && <div><b>Phone:</b> {partner.contact_phone}</div>}
            {partner.experience_years != null && <div><b>Experience:</b> {partner.experience_years} years</div>}
            {asList(partner.languages).length > 0 && <div><b>Languages:</b> {asList(partner.languages).join(", ")}</div>}
            {asList(partner.certifications).length > 0 && <div><b>Certifications:</b> {asList(partner.certifications).join(", ")}</div>}
            {asList(partner.service_locations).length > 0 && <div><b>Locations:</b> {asList(partner.service_locations).join(", ")}</div>}
            {partner.bio && <div className="text-muted-foreground">{partner.bio}</div>}
            <div className="text-xs text-muted-foreground pt-2">
              Commission split — BBDO <b>{partner.bbdo_commission_pct}%</b> · You <b>{partner.partner_commission_pct}%</b>
            </div>
          </div>
        )}
        <div className="pt-2">
          <Button
            onClick={handleSignOut}
            variant="outline"
            className="border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10"
          >
            <LogOut className="w-4 h-4 mr-1.5" /> Sign out
          </Button>
        </div>
      </Card>
    </div>
  );

  const tabContent: Record<PartnerTab, React.ReactNode> = {
    home: HomeTab,
    packages: PackagesTab,
    subscribers: SubscribersTab,
    profile: ProfileTab,
  };

  return (
    <div className="h-dvh bg-background flex overflow-hidden">
      {ChatOverlay}
      {/* Sidebar */}
      <aside
        className="hidden md:flex flex-col w-64 xl:w-72 shrink-0 bg-muted h-dvh"
        style={{ boxShadow: "1px 0 0 hsl(var(--border))" }}
      >
        <div
          className="flex items-center gap-3 px-6 pt-8 pb-6"
          style={{ borderBottom: "1px solid hsl(var(--border))" }}
        >
          <img src={logoImg} alt="BBDO" className="h-10 w-auto object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-muted-foreground text-xs">Partner Portal</p>
          </div>

          <NotificationCenter unreadCount={attentionCounts.notifications} />
          <button
            onClick={() => setActiveTab("profile")}
            aria-label="Profile"
            className={`w-9 h-9 rounded-full overflow-hidden border flex items-center justify-center shrink-0 transition-colors ${
              activeTab === "profile" ? "border-primary bg-primary/15" : "border-border bg-muted"
            }`}
          >
            <span className="text-primary font-black text-xs">{initial}</span>
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <motion.button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setNotificationsOpen(false);
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors w-full ${
                  isActive
                    ? "liquid-glass bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                whileTap={{ scale: 0.98 }}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                <span className="font-medium text-sm">{item.label}</span>
                <AttentionBadge count={tabAttentionCounts[item.id] ?? 0} className="ml-auto" />
                {isActive && (tabAttentionCounts[item.id] ?? 0) === 0 && (
                  <motion.div layoutId="partner-sidebar-indicator" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </motion.button>
            );
          })}
        </nav>

        <div className="px-4 pb-6" style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: "12px" }}>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-2.5 rounded-2xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors w-full"
          >
            <LogOut className="w-5 h-5 shrink-0" strokeWidth={1.5} />
            <span className="font-medium text-sm">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <RoleTopBar
          roleLabel="Partner Portal"
          avatarInitial={initial}
          profileActive={activeTab === "profile"}
          onProfileClick={() => setActiveTab("profile")}
          notificationCount={attentionCounts.notifications}
        />

        <main className="admin-shell flex-1 overflow-y-auto overflow-x-hidden pb-[calc(var(--nav-clear,5rem)+1rem)] md:pb-0">
          <div className="w-full max-w-4xl mx-auto">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={notificationsOpen ? "notifications" : activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                {notificationsOpen ? (
                  <NotificationsPanel embedded onClose={() => setNotificationsOpen(false)} />
                ) : (
                  tabContent[activeTab]
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Mobile bottom dock — consistent with all roles */}
        <RoleBottomNav<PartnerTab>
          active={activeTab}
          onSelect={(tab) => {
            setActiveTab(tab);
            setNotificationsOpen(false);
          }}
          items={navItems.map((n) => ({
            id: n.id,
            icon: n.icon,
            label: n.label,
            badge: tabAttentionCounts[n.id] ?? 0,
          }))}
        />
      </div>

      <Dialog open={approveDialog.open} onOpenChange={(o) => !o && setApproveDialog((s) => ({ ...s, open: false }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve custom slot</DialogTitle>
          </DialogHeader>
          {approveDialog.booking && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Subscriber preferred: <b>{approveDialog.booking.preferred_time || "—"}</b>
                {approveDialog.booking.preferred_days?.length ? ` · ${approveDialog.booking.preferred_days.join(", ")}` : ""}
              </p>
              <div>
                <Label className="text-xs">Confirmed time</Label>
                <Input
                  type="time"
                  value={approveDialog.time}
                  onChange={(e) => setApproveDialog((s) => ({ ...s, time: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Days of week</Label>
                <div className="flex flex-wrap gap-1">
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => {
                    const on = approveDialog.days.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setApproveDialog((s) => ({
                          ...s,
                          days: on ? s.days.filter((x) => x !== i) : [...s.days, i],
                        }))}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label className="text-xs">Meet link (optional)</Label>
                <Input
                  value={approveDialog.meet}
                  onChange={(e) => setApproveDialog((s) => ({ ...s, meet: e.target.value }))}
                  placeholder="https://meet.google.com/…"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                On approval, the subscriber gets a notification to pay. Their private slot & full monthly series are created automatically after payment.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApproveDialog((s) => ({ ...s, open: false }))}>Cancel</Button>
            <Button onClick={submitApprove} disabled={approveDialog.saving}>
              {approveDialog.saving ? "Approving…" : "Approve & notify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
