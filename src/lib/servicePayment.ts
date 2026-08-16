import { Capacitor } from "@capacitor/core";
import { Checkout } from "capacitor-razorpay";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window { Razorpay: any }
}

export type ServiceKind = "lab" | "yoga";

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    const src = "https://checkout.razorpay.com/v1/checkout.js";
    if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

async function verifyPayment(response: any) {
  const { data, error } = await supabase.functions.invoke("razorpay-service-payment", {
    body: { action: "verify", ...response },
  });
  if (error || !data?.verified) throw new Error("Payment received but verification failed. Contact support.");
}

/**
 * Collect payment for an add-on booking (lab test or yoga package).
 * The amount is always resolved server-side from the booking row.
 * Returns true when payment completed, false when nothing was due.
 */
export async function payForService(kind: ServiceKind, refId: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("razorpay-service-payment", {
    body: { action: "order", kind, ref_id: refId },
  });
  if (error) throw error;
  if (data?.already_paid) return false;
  if (data?.error) throw new Error(data.error);
  if (!data?.order_id) throw new Error("Could not start payment.");

  const checkoutOptions = {
    key: data.key_id,
    amount: String(data.amount),
    currency: data.currency,
    order_id: data.order_id,
    name: "Bye Bye Diabetes",
    description: data.description || "BBDO service",
    image: "https://bbdo.hyperrevamp.com/favicon.ico",
    theme: { color: "#248CCB" },
    retry: { enabled: true, max_count: 1 },
  };

  const nativeCheckoutAvailable =
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Checkout");
  if (nativeCheckoutAvailable) {
    try {
      const result = await Checkout.open(checkoutOptions as any);
      const response = (result as any)?.response;
      if (!response?.razorpay_payment_id) throw new Error("Razorpay did not confirm the payment.");
      await verifyPayment(response);
      return true;
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (!/not implemented|unimplemented|not available/i.test(msg)) throw e;
    }
  }

  const ok = await loadRazorpayScript();
  if (!ok) throw new Error("Failed to load Razorpay checkout.");

  await new Promise<void>((resolve, reject) => {
    const rzp = new window.Razorpay({
      ...checkoutOptions,
      method: { upi: true, card: true, netbanking: true, wallet: true },
      handler: async (resp: any) => {
        try {
          await verifyPayment(resp);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      modal: { ondismiss: () => reject(new Error("Payment cancelled.")) },
    });
    rzp.on("payment.failed", (resp: any) => reject(new Error(resp?.error?.description || "Payment failed.")));
    rzp.open();
  });
  return true;
}
