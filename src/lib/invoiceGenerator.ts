import type { Subscription } from "./subscriptionService";
import { fetchPackageByPlanKey } from "./subscriptionService";
import logoUrl from "@/assets/logo.png";

interface InvoiceData {
  subscription: Subscription;
  userName: string;
  userEmail?: string;
  userPhone?: string;
  userCity?: string;
  healthScore?: number;
  coachName?: string;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function generateInvoiceNumber(sub: Subscription): string {
  const date = new Date(sub.created_at);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const short = sub.id.slice(0, 8).toUpperCase();
  return `BBDO-${y}${m}-${short}`;
}

/** Inline the logo as a data URI so the downloaded/shared HTML shows it offline. */
async function getLogoDataUri(): Promise<string> {
  try {
    const absolute = new URL(logoUrl, window.location.origin).href;
    const res = await fetch(absolute);
    if (!res.ok) return absolute;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    try {
      return new URL(logoUrl, window.location.origin).href;
    } catch {
      return logoUrl;
    }
  }
}


export async function downloadInvoice({ subscription, userName, userEmail, userPhone, userCity, healthScore, coachName }: InvoiceData) {
  const sub = subscription;
  const invoiceNo = generateInvoiceNumber(sub);
  const startDate = new Date(sub.started_at);
  const expiryDate = new Date(sub.expires_at);
  const planDetail = await fetchPackageByPlanKey(sub.plan_id);
  const baseAmount = Math.round(sub.plan_price / 1.18);
  const gst = sub.plan_price - baseAmount;
  const daysSinceJoin = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  // Never show internal phone-based alias addresses on the invoice
  const displayEmail = userEmail && !userEmail.toLowerCase().endsWith("@bbd.app") ? userEmail : undefined;
  const firstName = (userName || "").trim().split(/\s+/)[0] || userName;

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${invoiceNo} — ${userName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; background: #FCFCFD; color: #0F1A3D; padding: 40px; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; padding-bottom: 22px; border-bottom: 2px solid #248CCB; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand img { height: 56px; width: auto; border-radius: 8px; }
  .brand-text h1 { font-size: 22px; font-weight: 800; color: #0F1A3D; line-height: 1.2; letter-spacing: -0.01em; }
  .brand-text p { color: #4B5675; font-size: 11px; margin-top: 4px; }
  .invoice-meta { text-align: right; }
  .invoice-meta h2 { font-size: 11px; color: #4B5675; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; font-weight: 600; }
  .invoice-meta .inv-number { font-size: 18px; font-weight: 800; color: #0F1A3D; }
  .invoice-meta .inv-date { color: #4B5675; font-size: 13px; margin-top: 4px; }
  .billed-to-name { font-size: 16px; font-weight: 800; color: #0F1A3D; margin-bottom: 8px; letter-spacing: -0.01em; }
  .parties { display: flex; justify-content: space-between; gap: 32px; margin-bottom: 36px; }
  .party { flex: 1; }
  .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #4B5675; margin-bottom: 10px; font-weight: 600; }
  .party p { font-size: 13px; color: #0F1A3D; line-height: 1.7; }
  .personalization { background: #EEF2FF; border-left: 3px solid #248CCB; padding: 16px 20px; margin-bottom: 30px; border-radius: 0 12px 12px 0; }
  .personalization p { font-size: 13px; color: #0F1A3D; line-height: 1.7; }
  .personalization strong { color: #248CCB; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead th { background: #F4F6FB; padding: 12px 16px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #4B5675; font-weight: 700; }
  thead th:last-child { text-align: right; }
  tbody td { padding: 16px; border-bottom: 1px solid #E5E9F2; font-size: 14px; color: #0F1A3D; }
  tbody td:last-child { text-align: right; font-weight: 600; }
  .plan-name { font-weight: 700; color: #0F1A3D; }
  .plan-detail { color: #4B5675; font-size: 12px; margin-top: 2px; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 40px; }
  .totals-table { width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #4B5675; }
  .totals-row.total { border-top: 2px solid #0F1A3D; padding-top: 12px; margin-top: 8px; font-size: 18px; font-weight: 800; color: #0F1A3D; }
  .footer { text-align: center; padding-top: 28px; border-top: 1px solid #E5E9F2; color: #4B5675; font-size: 12px; line-height: 1.8; }
  .badge { display: inline-block; background: #248CCB; color: #FCFCFD; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px; margin-left: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <img src="${logoUrl}" alt="Bye Bye Diabetes & Obesity" />
      <div class="brand-text">
        <h1>Bye Bye Diabetes<br/>&amp; Obesity</h1>
        <p>Your health transformation partner</p>
      </div>
    </div>
    <div class="invoice-meta">
      <h2>Invoice</h2>
      <div class="inv-number">${invoiceNo}</div>
      <div class="inv-date">Date: ${formatDate(startDate)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Billed To</h3>
      <p class="billed-to-name">${userName}</p>
      ${displayEmail ? `<p>${displayEmail}</p>` : ""}
      ${userPhone ? `<p>${userPhone}</p>` : ""}
      ${userCity ? `<p>${userCity}</p>` : ""}
    </div>
    <div class="party" style="text-align: right;">
      <h3>Plan Period</h3>
      <p>${formatDate(startDate)} — ${formatDate(expiryDate)}</p>
      <p style="color: #4B5675; font-size: 13px;">${sub.duration_months} month${sub.duration_months > 1 ? "s" : ""}</p>
    </div>
  </div>

  <div class="personalization">
    <p>Dear <strong>${firstName}</strong>, thank you for being part of the BBDO family${daysSinceJoin > 0 ? ` for <strong>${daysSinceJoin} days</strong>` : ""}!
    ${coachName ? ` Your dedicated coach <strong>${coachName}</strong> is with you on this journey.` : ""}
    ${healthScore ? ` Your current health score is <strong>${healthScore}</strong> — keep going!` : ""}
    We're honoured to support your transformation.</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <div class="plan-name">${sub.plan_name}<span class="badge">${planDetail?.name ?? sub.plan_id}</span></div>
          <div class="plan-detail">${sub.duration_months}-month subscription • ${planDetail?.features?.length ?? 0} features included</div>
        </td>
        <td>₹${baseAmount.toLocaleString("en-IN")}</td>
      </tr>
      <tr>
        <td>GST (18%)</td>
        <td>₹${gst.toLocaleString("en-IN")}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-table">
      <div class="totals-row"><span>Subtotal</span><span>₹${baseAmount.toLocaleString("en-IN")}</span></div>
      <div class="totals-row"><span>GST (18%)</span><span>₹${gst.toLocaleString("en-IN")}</span></div>
      <div class="totals-row total"><span>Total Paid</span><span>₹${sub.plan_price.toLocaleString("en-IN")}</span></div>
    </div>
  </div>

  <div class="footer">
    <p><strong style="color:#0F1A3D;">Thank you for choosing BBDO, ${firstName}!</strong></p>
    <p>This is a computer-generated invoice and does not require a signature.</p>
    <p>For queries, contact support@byebyediabetes.com</p>
  </div>
</body>
</html>`;

  const filename = `Invoice-${invoiceNo}.html`;

  // Native (iOS/Android via Capacitor): write file and open the native share sheet
  // so the user can save/print/share. window.open + a.download do not work reliably
  // inside WKWebView / Android WebView.
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: html,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({
        title: "BBDO Invoice",
        text: `Invoice ${invoiceNo}`,
        url: writeResult.uri,
        dialogTitle: "Save or share invoice",
      });
      return;
    }
  } catch (err) {
    console.warn("[invoice] native share failed, falling back to browser download", err);
  }

  // Browser: try to open in a new tab for print; fall back to blob download.
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}
