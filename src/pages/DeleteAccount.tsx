import { Mail, Trash2, Shield, Clock } from "lucide-react";

const SUPPORT_EMAIL = "byebyediabetes2025@gmail.com";

export default function DeleteAccount() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Trash2 className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold">Delete your account</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Bye Bye Diabetes &amp; Obesity (BBDO) — Account &amp; Data Deletion
          </p>
        </header>

        <section className="space-y-6 text-sm leading-relaxed">
          <p>
            You can request permanent deletion of your BBDO account and all
            associated personal data at any time. This page explains how, what
            data is removed, and what may be retained.
          </p>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              How to request deletion
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>
                Send an email to{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=Account%20Deletion%20Request`}
                  className="text-primary underline font-medium"
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                from the email address or with the phone number registered on
                your BBDO account.
              </li>
              <li>
                Use the subject line: <b>Account Deletion Request</b>.
              </li>
              <li>
                Include your registered phone number so we can verify your
                identity.
              </li>
              <li>
                We will confirm your identity, delete your account, and email
                you a confirmation within <b>7 business days</b>.
              </li>
            </ol>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-primary" />
              Data that will be deleted
            </h2>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Profile: name, date of birth, gender, phone, email, photo</li>
              <li>Body stats: height, weight, waist, BMI history</li>
              <li>Clinical data: lab reports, HbA1c, glucose, medications</li>
              <li>Health tracker data (steps, sleep, heart rate) synced from Apple Health / Google Health Connect</li>
              <li>Nutrition plans, meal logs, and food photos</li>
              <li>Exercise, yoga, breath, and activity logs</li>
              <li>Community posts, comments, likes, and chat messages</li>
              <li>Coach chat history and uploaded images</li>
              <li>Notification tokens and preferences</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Data that may be retained
            </h2>
            <p className="text-muted-foreground mb-2">
              For legal, tax, and fraud-prevention reasons, we retain the
              following in an anonymised or minimised form:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                Payment and invoice records — retained for up to <b>8 years</b>{" "}
                as required by Indian tax law (GST / Income Tax Act).
              </li>
              <li>
                Anonymised, aggregated analytics that cannot be traced back to
                you.
              </li>
              <li>
                Records legally required to defend against fraud or comply with
                a court order.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Partial data deletion
            </h2>
            <p className="text-muted-foreground">
              If you want to delete only specific data (for example, community
              posts, uploaded photos, or health tracker history) without
              deleting your entire account, email{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Partial%20Data%20Deletion%20Request`}
                className="text-primary underline font-medium"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              with the details of what you would like removed.
            </p>
          </div>

          <p className="text-xs text-muted-foreground pt-4 border-t border-border">
            App: Bye Bye Diabetes &amp; Obesity (BBDO) · Developer: Hyper Revamp
            · Contact: {SUPPORT_EMAIL}
          </p>
        </section>
      </div>
    </div>
  );
}
