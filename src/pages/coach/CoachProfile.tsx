import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Star, Award, Briefcase, Clock, LogOut, Loader2, Mail, Phone, MapPin,
  CreditCard, GraduationCap, Languages, Calendar, Percent, Building2,
  Shield, User, Edit3, Save, X, Heart, Camera, Upload, FileText, Eye, Compass
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { coachTypeLabel, type Coach } from "@/lib/coachService";
import { useToast } from "@/hooks/use-toast";

/* ── Reusable sub-components ─────────────────────────────────────────── */

function InfoRow({ icon: Icon, label, value, iconColor = "text-primary", masked = false }: {
  icon: React.ElementType; label: string; value: string | null | undefined;
  iconColor?: string; masked?: boolean;
}) {
  if (!value) return null;
  const display = masked ? value.replace(/./g, "•").slice(0, -4) + value.slice(-4) : value;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/20 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className={`w-4 h-4 ${iconColor}`} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">{label}</p>
        <p className="text-foreground text-sm font-medium mt-0.5 break-words">{display}</p>
      </div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, delay = 0 }: {
  title: string; icon: React.ElementType; children: React.ReactNode; delay?: number;
}) {
  return (
    <motion.div className="liquid-glass rounded-3xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-primary" strokeWidth={1.8} />
        <span className="text-foreground font-bold">{title}</span>
      </div>
      {children}
    </motion.div>
  );
}

function EditField({ label, value, onChange, placeholder, type = "text", multiline = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; multiline?: boolean;
}) {
  const cls = "w-full bg-background/50 border border-border/30 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30";
  return (
    <div>
      <label className="text-muted-foreground text-xs font-medium mb-1 block">{label}</label>
      {multiline ? (
        <textarea className={`${cls} resize-none`} rows={3} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} className={cls} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function DocUploadBox({ label, docUrl, uploading, onUpload, onView }: {
  label: string; docUrl: string | null | undefined;
  uploading: boolean; onUpload: (f: File) => void; onView: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="liquid-glass rounded-2xl p-4">
      <p className="text-muted-foreground text-xs font-medium mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-2 bg-primary/10 border border-primary/20 text-primary rounded-xl py-2.5 text-sm font-medium"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {docUrl ? "Replace" : "Upload"}
        </button>
        {docUrl && (
          <button onClick={onView} className="flex items-center gap-1.5 bg-muted/50 rounded-xl py-2.5 px-3 text-sm font-medium text-foreground">
            <Eye className="w-4 h-4" /> View
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }} />
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────── */

export default function CoachProfile({ onSignOut, onReplayTour }: { onSignOut: () => void; onReplayTour?: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Coach>>({});
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [aadhaarUploading, setAadhaarUploading] = useState(false);
  const [panUploading, setPanUploading] = useState(false);
  const [commission, setCommission] = useState<{ name: string; percent: number; payout_frequency: string } | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("coaches" as any)
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(async ({ data }) => {
        const c = data as unknown as Coach;
        setCoach(c);
        setForm(c ?? {});
        setLoading(false);

        const modelId = (c as any)?.commission_model_id;
        let model: any = null;
        if (modelId) {
          const { data: m } = await supabase
            .from("commission_models" as any)
            .select("name, percent, payout_frequency")
            .eq("id", modelId)
            .maybeSingle();
          model = m;
        }
        if (!model) {
          const { data: m } = await supabase
            .from("commission_models" as any)
            .select("name, percent, payout_frequency")
            .eq("is_default", true)
            .eq("is_active", true)
            .maybeSingle();
          model = m;
        }
        if (model) {
          setCommission({
            name: model.name,
            percent: Number(model.percent) || 0,
            payout_frequency: model.payout_frequency || "monthly",
          });
        }
      });
  }, [user]);

  const updateField = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  /* ── Avatar upload ─────────────────────────────────────────────────── */
  const handleAvatarUpload = async (file: File) => {
    if (!user || !coach) return;
    setAvatarUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); setAvatarUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;
    await supabase.from("coaches" as any).update({ avatar_url: url } as any).eq("id", coach.id);
    setCoach({ ...coach, avatar_url: url });
    setForm((prev) => ({ ...prev, avatar_url: url }));
    setAvatarUploading(false);
    toast({ title: "Photo updated!" });
  };

  /* ── Document upload ───────────────────────────────────────────────── */
  const handleDocUpload = async (file: File, docType: "aadhaar" | "pan") => {
    if (!user || !coach) return;
    const setUploading = docType === "aadhaar" ? setAadhaarUploading : setPanUploading;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${docType}_doc.${ext}`;
    const { error: upErr } = await supabase.storage.from("coach-documents").upload(path, file, { upsert: true });
    if (upErr) { toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); setUploading(false); return; }

    const colKey = docType === "aadhaar" ? "aadhaar_doc_url" : "pan_doc_url";
    await supabase.from("coaches" as any).update({ [colKey]: path } as any).eq("id", coach.id);
    const updated = { ...coach, [colKey]: path } as Coach;
    setCoach(updated);
    setForm((prev) => ({ ...prev, [colKey]: path }));
    setUploading(false);
    toast({ title: `${docType === "aadhaar" ? "Aadhaar" : "PAN"} document uploaded!` });
  };

  const viewDocument = async (docPath: string) => {
    const { data, error } = await supabase.storage.from("coach-documents").createSignedUrl(docPath, 300);
    if (error || !data?.signedUrl) { toast({ title: "Could not open document", variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank");
  };

  /* ── Save all fields ───────────────────────────────────────────────── */
  const handleSave = async () => {
    if (!coach) return;
    setSaving(true);
    const { error } = await supabase
      .from("coaches" as any)
      .update({
        name: form.name,
        email: form.email,
        phone: form.phone,
        specialization: form.specialization,
        description: form.description,
        date_of_birth: form.date_of_birth,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_phone: form.emergency_contact_phone,
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        pan_card: form.pan_card,
        aadhaar_card: form.aadhaar_card,
        qualification: form.qualification,
        bio: form.bio,
        bank_name: form.bank_name,
        bank_account_number: form.bank_account_number,
        bank_ifsc: form.bank_ifsc,
      } as any)
      .eq("id", coach.id);

    setSaving(false);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      setCoach({ ...coach, ...form } as Coach);
      setEditing(false);
      toast({ title: "Profile updated!" });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
  if (!coach) return null;

  const tenure = coach.start_date
    ? Math.max(1, Math.floor((Date.now() - new Date(coach.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : null;
  const fullAddress = [coach.address_line1, coach.address_line2, coach.city, coach.state, coach.pincode].filter(Boolean).join(", ");
  const avatarSrc = form.avatar_url || coach.avatar_url || "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=120&h=120&fit=crop&crop=face";

  /* ═══════════════════════  EDIT MODE  ═══════════════════════════════ */
  if (editing) {
    const editGroups = [
      { section: "Basic Info", fields: [
        { key: "name", label: "Full Name", placeholder: "Dr. Kavita Reddy" },
        { key: "phone", label: "Phone", placeholder: "9876543005" },
        { key: "email", label: "Email", placeholder: "coach@email.com" },
        { key: "specialization", label: "Specialization", placeholder: "Diabetes Management" },
        { key: "date_of_birth", label: "Date of Birth", placeholder: "YYYY-MM-DD", type: "date" },
        { key: "qualification", label: "Qualification", placeholder: "MBBS, MD..." },
        { key: "bio", label: "Bio", placeholder: "About yourself...", multiline: true },
      ]},
      { section: "Address", fields: [
        { key: "address_line1", label: "Address Line 1", placeholder: "House/Flat number" },
        { key: "address_line2", label: "Address Line 2", placeholder: "Street, Area" },
        { key: "city", label: "City", placeholder: "City" },
        { key: "state", label: "State", placeholder: "State" },
        { key: "pincode", label: "Pincode", placeholder: "6-digit pincode" },
      ]},
      { section: "Identity", fields: [
        { key: "pan_card", label: "PAN Number", placeholder: "ABCDE1234F" },
        { key: "aadhaar_card", label: "Aadhaar Number", placeholder: "1234-5678-9012" },
      ]},
      { section: "Emergency Contact", fields: [
        { key: "emergency_contact_name", label: "Contact Name", placeholder: "Name" },
        { key: "emergency_contact_phone", label: "Contact Phone", placeholder: "Phone number" },
      ]},
      { section: "Banking", fields: [
        { key: "bank_name", label: "Bank Name", placeholder: "Bank name" },
        { key: "bank_account_number", label: "Account Number", placeholder: "Account number" },
        { key: "bank_ifsc", label: "IFSC Code", placeholder: "IFSC code" },
      ]},
    ];

    return (
      <div className="flex flex-col gap-5 px-5 pt-14 pb-4">
        {/* Header */}
        <motion.div className="flex items-center justify-between" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-foreground">Edit Profile</h1>
            <p className="text-muted-foreground text-sm">Update your details</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setForm(coach); setEditing(false); }} className="liquid-glass rounded-xl p-2.5 text-muted-foreground">
              <X className="w-5 h-5" strokeWidth={1.8} />
            </button>
            <button onClick={handleSave} disabled={saving} className="gradient-blue text-primary-foreground font-bold py-2.5 px-4 rounded-xl text-sm flex items-center gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </motion.div>

        {/* Avatar Edit */}
        <motion.div className="liquid-glass rounded-3xl p-5 flex flex-col items-center" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="relative">
            <img src={avatarSrc} alt="Avatar" className="w-24 h-24 rounded-2xl object-cover" />
            <button
              onClick={() => avatarRef.current?.click()}
              disabled={avatarUploading}
              className="absolute -bottom-2 -right-2 w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg"
            >
              {avatarUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </button>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleAvatarUpload(e.target.files[0]); }} />
          </div>
          <p className="text-muted-foreground text-xs mt-3">Tap camera to change photo</p>
        </motion.div>

        {/* Editable Field Groups */}
        {editGroups.map((group, gi) => (
          <motion.div key={group.section} className="liquid-glass rounded-3xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * gi }}>
            <p className="text-foreground font-bold mb-3">{group.section}</p>
            <div className="flex flex-col gap-3">
              {group.fields.map((f: any) => (
                <EditField
                  key={f.key}
                  label={f.label}
                  placeholder={f.placeholder}
                  type={f.type}
                  multiline={f.multiline}
                  value={(form as any)[f.key] ?? ""}
                  onChange={(v) => updateField(f.key, v)}
                />
              ))}
            </div>
          </motion.div>
        ))}

        {/* Document Uploads */}
        <motion.div className="liquid-glass rounded-3xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-5 h-5 text-primary" strokeWidth={1.8} />
            <span className="text-foreground font-bold">Document Uploads</span>
            <span className="text-muted-foreground text-[10px] ml-1">(Optional)</span>
          </div>
          <div className="flex flex-col gap-3">
            <DocUploadBox
              label="Aadhaar Card Document"
              docUrl={form.aadhaar_doc_url}
              uploading={aadhaarUploading}
              onUpload={(f) => handleDocUpload(f, "aadhaar")}
              onView={() => form.aadhaar_doc_url && viewDocument(form.aadhaar_doc_url)}
            />
            <DocUploadBox
              label="PAN Card Document"
              docUrl={form.pan_doc_url}
              uploading={panUploading}
              onUpload={(f) => handleDocUpload(f, "pan")}
              onView={() => form.pan_doc_url && viewDocument(form.pan_doc_url)}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  /* ═══════════════════════  VIEW MODE  ═══════════════════════════════ */
  return (
    <div className="flex flex-col gap-5 px-5 pt-14 pb-4">
      <motion.div className="flex items-center justify-between" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground">My Profile</h1>
          <p className="text-muted-foreground text-sm">Coach settings & details</p>
        </div>
        <button onClick={() => setEditing(true)} className="liquid-glass rounded-xl p-2.5 text-primary">
          <Edit3 className="w-5 h-5" strokeWidth={1.8} />
        </button>
      </motion.div>

      {/* Hero Card */}
      <motion.div className="liquid-glass rounded-3xl p-6 flex flex-col items-center text-center" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <img src={avatarSrc} alt={coach.name} className="w-20 h-20 rounded-2xl object-cover mb-4" />
        <h2 className="text-foreground font-black text-lg">{coach.name}</h2>
        <p className="text-muted-foreground text-sm mt-0.5">{coach.specialization}</p>
        <span className="inline-block text-[10px] font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20 mt-2">
          {coachTypeLabel(coach.coach_type)}
        </span>
        {coach.bio && <p className="text-muted-foreground text-xs leading-relaxed mt-4 max-w-sm">{coach.bio}</p>}
      </motion.div>

      {/* Stats */}
      <motion.div className="grid grid-cols-3 gap-3" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="liquid-glass rounded-2xl p-4 text-center">
          <Star className="w-5 h-5 text-warning mx-auto mb-1.5 fill-warning" />
          <p className="stat-number text-2xl text-foreground">{coach.avg_rating}</p>
          <p className="text-muted-foreground text-[10px] font-medium">{coach.total_ratings} reviews</p>
        </div>
        <div className="liquid-glass rounded-2xl p-4 text-center">
          <Briefcase className="w-5 h-5 text-success mx-auto mb-1.5" strokeWidth={1.8} />
          <p className="stat-number text-2xl text-foreground">{coach.total_consultations.toLocaleString()}</p>
          <p className="text-muted-foreground text-[10px] font-medium">Sessions</p>
        </div>
        <div className="liquid-glass rounded-2xl p-4 text-center">
          <Clock className="w-5 h-5 text-primary mx-auto mb-1.5" strokeWidth={1.8} />
          <p className="stat-number text-2xl text-foreground">{coach.years_experience}</p>
          <p className="text-muted-foreground text-[10px] font-medium">Years exp</p>
        </div>
      </motion.div>

      {/* Contact */}
      <SectionCard title="Contact Information" icon={User} delay={0.15}>
        <InfoRow icon={Phone} label="Phone" value={coach.phone} />
        <InfoRow icon={Mail} label="Email" value={coach.email} />
        <InfoRow icon={MapPin} label="Address" value={fullAddress || null} />
        <InfoRow icon={Calendar} label="Date of Birth" value={coach.date_of_birth ? new Date(coach.date_of_birth).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null} />
        <InfoRow icon={Heart} label="Emergency Contact" value={coach.emergency_contact_name ? `${coach.emergency_contact_name} — ${coach.emergency_contact_phone}` : null} iconColor="text-destructive" />
      </SectionCard>

      {/* Professional */}
      <SectionCard title="Professional Details" icon={GraduationCap} delay={0.2}>
        <InfoRow icon={GraduationCap} label="Qualification" value={coach.qualification} />
        <InfoRow icon={Languages} label="Languages" value={coach.languages?.join(", ") || null} />
        <InfoRow icon={Calendar} label="Joined" value={coach.start_date ? new Date(coach.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null} />
        {tenure && <InfoRow icon={Clock} label="Tenure" value={`${tenure} month${tenure !== 1 ? "s" : ""}`} />}
      </SectionCard>

      {/* Identity */}
      <SectionCard title="Identity Documents" icon={Shield} delay={0.25}>
        <InfoRow icon={CreditCard} label="PAN Card" value={coach.pan_card} masked />
        <InfoRow icon={Shield} label="Aadhaar Card" value={coach.aadhaar_card} masked />
        {(coach.aadhaar_doc_url || coach.pan_doc_url) && (
          <div className="flex gap-2 mt-2">
            {coach.aadhaar_doc_url && (
              <button onClick={() => viewDocument(coach.aadhaar_doc_url!)} className="flex items-center gap-1.5 text-xs text-primary font-medium bg-primary/10 px-3 py-1.5 rounded-lg">
                <Eye className="w-3.5 h-3.5" /> Aadhaar Doc
              </button>
            )}
            {coach.pan_doc_url && (
              <button onClick={() => viewDocument(coach.pan_doc_url!)} className="flex items-center gap-1.5 text-xs text-primary font-medium bg-primary/10 px-3 py-1.5 rounded-lg">
                <Eye className="w-3.5 h-3.5" /> PAN Doc
              </button>
            )}
          </div>
        )}
      </SectionCard>

      {/* Earnings */}
      <SectionCard title="Earnings & Banking" icon={Percent} delay={0.3}>
        <div className="liquid-glass rounded-2xl p-4 mb-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Percent className="w-5 h-5 text-primary" strokeWidth={1.8} />
          </div>
          <div className="flex-1">
            <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
              Commission Plan{commission ? ` · ${commission.name}` : ""}
            </p>
            <p className="stat-number text-2xl text-foreground">
              {commission ? commission.percent : (coach.commission_percent ?? 0)}%
            </p>
            {commission && (
              <p className="text-muted-foreground text-[11px] capitalize mt-0.5">
                {commission.payout_frequency} payout
              </p>
            )}
          </div>
        </div>
        <InfoRow icon={Building2} label="Bank" value={coach.bank_name} />
        <InfoRow icon={CreditCard} label="Account Number" value={coach.bank_account_number} masked />
        <InfoRow icon={CreditCard} label="IFSC Code" value={coach.bank_ifsc} />
      </SectionCard>

      {/* Sign out */}
      <motion.button
        onClick={onSignOut}
        className="rounded-3xl p-4 flex items-center justify-center gap-2 text-destructive font-bold mb-6 border border-destructive/40 bg-destructive/5 hover:bg-destructive/10 transition-colors w-full"
        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        whileTap={{ scale: 0.98 }}
      >
        <LogOut className="w-5 h-5" strokeWidth={1.8} />
        Sign Out
      </motion.button>
    </div>
  );
}
