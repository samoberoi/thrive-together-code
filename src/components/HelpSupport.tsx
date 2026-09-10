import { useState } from "react";
import { useCareTerms } from "@/lib/careTerms";
import { ChevronDown, LifeBuoy, Mail, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

interface Faq {
  category: string;
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    category: "Getting started",
    q: "How do I log my daily readings?",
    a: "Tap the + button at the bottom of the home screen and pick what you want to log — blood pressure, blood sugar, weight, or water. You can also tap a ring on your home screen to open its tracking page directly.",
  },
  {
    category: "Getting started",
    q: "Why can't I see the blood pressure or blood sugar ring?",
    a: "These rings only appear if you've told us you have that condition. Go to Profile → Edit Profile and check your health conditions. If you have BP or diabetes and still can't see the ring, check Profile → Ring Manager to make sure tracking is switched on for today.",
  },
  {
    category: "Rings & tracking",
    q: "Can I track a reading only on certain days?",
    a: "Yes. Open Profile → Ring Manager, pick the reading (blood pressure, blood sugar, weight, or water), choose \"Pick days\", and select your days. The ring will only appear on those days.",
  },
  {
    category: "Rings & tracking",
    q: "My steps look wrong. What should I do?",
    a: "Steps are read from your phone's health app (Health Connect on Android, Apple Health on iPhone). Make sure the app has permission to read steps, then pull down on the home screen to refresh. If the number still looks off, raise a query below and we'll check.",
  },
  {
    category: "Rings & tracking",
    q: "How does the streak work?",
    a: "Your BBDO streak counts a day as active when you complete at least five of the seven daily activities. You can miss up to two days in a seven-day window without breaking your streak. Check Profile → Achievements to see where you stand.",
  },
  {
    category: "Fasting & supplements",
    q: "How do I mark my fasting meals (FMOD / LMOD)?",
    a: "Open the Fasting section from your home screen and tap to log your first meal (FMOD) and last meal (LMOD) of the day. Your fasting ring fills as both are logged.",
  },
  {
    category: "Fasting & supplements",
    q: "Where do I mark my supplements as taken?",
    a: "Tap the Supplements ring or open the Supplements section — your active plan lists every item for the day with a tick button. If you don't see a plan, your coach may not have assigned one yet.",
  },
  {
    category: "Coach & meetings",
    q: "How do I reach my coach?",
    a: "Go to the My Coach tab — Call and Chat options are at the top. You can message your coach any time; they typically respond within working hours.",
  },
  {
    category: "Coach & meetings",
    q: "How do I book or reschedule a meeting?",
    a: "In the My Coach tab, open Meetings to see upcoming sessions and request a new slot. If a slot doesn't work, your coach can reschedule it for you.",
  },
  {
    category: "Lab tests & reports",
    q: "How do I upload an old lab report?",
    a: "Open Lab Tests → upload your report PDF or a clear photo. Our system reads the values automatically, and you can compare your latest report with previous ones marker by marker.",
  },
  {
    category: "Payments & plan",
    q: "How do I upgrade or renew my plan?",
    a: "Go to Profile → My Plan to see your current package and renewal options. Upgrades are prorated — you only pay the difference for the remaining days.",
  },
  {
    category: "Payments & plan",
    q: "I'm being shown the wrong currency. What do I do?",
    a: "Your currency follows the country you selected on the login screen. Sign out, pick the correct country at the top of the login page, and sign back in — the pricing will update automatically.",
  },
];

/** Foundation Care has no assigned coach — those answers are replaced. */
const FOUNDATION_FAQS: Faq[] = [
  {
    category: "Expert support",
    q: "Who supports me on Foundation Care?",
    a: "Foundation Care is a self-guided plan supported by the BBDO expert desk. Use the Expert Connect button on WhatsApp for guidance, or raise a query below — you don't have a personal coach on this plan.",
  },
  {
    category: "Expert support",
    q: "Can I get one-to-one sessions?",
    a: "One-to-one sessions come with the higher plans. Go to Profile → My Plan to upgrade and get a personal coach with scheduled calls.",
  },
];

function faqsFor(isFoundation: boolean): Faq[] {
  if (!isFoundation) return FAQS;
  return [
    ...FAQS.filter((f) => f.category !== "Coach & meetings").map((f) =>
      f.a.includes("your coach may not have assigned one yet")
        ? { ...f, a: f.a.replace("your coach may not have assigned one yet", "one may not be assigned to you yet") }
        : f,
    ),
    ...FOUNDATION_FAQS,
  ];
}

export default function HelpSupport() {
  const { user } = useAuth();
  const care = useCareTerms();
  const allFaqs = faqsFor(care.isFoundation);
  const CATEGORIES = ["All", ...Array.from(new Set(allFaqs.map((f) => f.category)))];
  const [category, setCategory] = useState("All");
  const [open, setOpen] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const faqs = category === "All" ? allFaqs : allFaqs.filter((f) => f.category === category);

  const submit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error("Please fill in both the subject and your question.");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("support-query", {
        body: {
          name: (user as any)?.user_metadata?.name || user?.email || "App user",
          email: user?.email || "",
          userId: user?.id || "",
          subject: subject.trim(),
          message: message.trim(),
        },
      });
      if (error) throw error;
      setSent(true);
      setSubject("");
      setMessage("");
      toast.success("Your query has been sent. We'll get back to you soon.");
    } catch {
      toast.error("Could not send right now. Please email hello@byebyediabetesandobesity.com directly.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm leading-relaxed">
        Answers to the most common questions. Can't find yours? Raise a query and our team will respond over email.
      </p>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => { setCategory(c); setOpen(null); }}
            className={`shrink-0 h-8 px-3 rounded-full text-xs font-semibold transition ${
              category === c ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={`${f.category}-${i}`} className="rounded-2xl liquid-glass overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-center gap-3 p-4 text-left"
                aria-expanded={isOpen}
              >
                <LifeBuoy className="w-4 h-4 shrink-0 text-primary" strokeWidth={1.8} />
                <span className="flex-1 min-w-0 text-foreground font-semibold text-sm leading-snug">{f.q}</span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 -mt-1">
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.a}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl liquid-glass p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" strokeWidth={1.8} />
          <h3 className="text-foreground font-bold text-sm">Didn't find your answer? Raise a query</h3>
        </div>
        {sent ? (
          <div className="flex items-start gap-3 py-2">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
            <div>
              <p className="text-foreground font-semibold text-sm">Query sent</p>
              <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                Our team will reply to your email shortly. Need to ask something else?{" "}
                <button className="text-primary font-semibold" onClick={() => setSent(false)}>
                  Raise another query
                </button>
              </p>
            </div>
          </div>
        ) : (
          <>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject — e.g. Steps not syncing"
              maxLength={120}
              className="h-11 rounded-xl bg-muted/60 px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your question or issue in a few lines…"
              rows={4}
              maxLength={2000}
              className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <Button onClick={() => void submit()} disabled={sending} className="h-11 rounded-xl font-semibold">
              <Send className="w-4 h-4 mr-2" />
              {sending ? "Sending…" : "Send query"}
            </Button>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              This goes straight to our support team at hello@byebyediabetesandobesity.com with your account details so we can help faster.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
