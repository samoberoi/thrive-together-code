// MSG91 OTP Widget bridge. The configured widget owns sending, retrying and
// verifying, so delivery uses the exact channels/default template configured
// in the MSG91 dashboard.

export const OTP_LENGTH = 4;

declare global {
  interface Window {
    sendOtp?: (identifier: string, success: (data: unknown) => void, failure: (error: unknown) => void) => void;
    verifyOtp?: (otp: string, success: (data: unknown) => void, failure: (error: unknown) => void, reqId?: string) => void;
    retryOtp?: (channel: string, success: (data: unknown) => void, failure: (error: unknown) => void, reqId?: string) => void;
  }
}

type WidgetData = { message?: string; request_id?: string; reqId?: string; "access-token"?: string; accessToken?: string };
type WidgetError = { message?: string };

async function waitForWidget(timeoutMs = 10000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (typeof window.sendOtp === "function") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("SMS service is still loading. Please try again.");
}

function widgetMessage(error: unknown, fallback: string): string {
  return (error as WidgetError | undefined)?.message || fallback;
}

/** Sends an OTP over SMS. `identifier` must be country code + number, digits only. */
export async function msg91SendOtp(identifier: string): Promise<string | null> {
  await waitForWidget();
  if (!window.sendOtp) throw new Error("SMS service is unavailable. Please try again.");
  return new Promise((resolve, reject) => {
    window.sendOtp?.(
      identifier,
      (value) => {
        const data = value as WidgetData;
        resolve(data.request_id ?? data.reqId ?? data.message ?? null);
      },
      (error) => reject(new Error(widgetMessage(error, "Could not send the code. Please try again."))),
    );
  });
}

/** Resends the OTP over SMS. */
export async function msg91RetryOtp(reqId?: string | null): Promise<void> {
  await waitForWidget();
  if (!window.retryOtp) throw new Error("SMS service is unavailable. Please try again.");
  return new Promise((resolve, reject) => {
    window.retryOtp?.(
      "11",
      () => resolve(),
      (error) => reject(new Error(widgetMessage(error, "Could not resend the code."))),
      reqId ?? undefined,
    );
  });
}

/** Verifies the OTP in the widget and returns its short-lived access token. */
export async function msg91VerifyOtp(otp: string, reqId?: string | null): Promise<string> {
  await waitForWidget();
  if (!window.verifyOtp) throw new Error("SMS service is unavailable. Please try again.");
  return new Promise((resolve, reject) => {
    window.verifyOtp?.(
      otp,
      (value) => {
        const data = value as WidgetData;
        const token = data["access-token"] ?? data.accessToken ?? data.message;
        if (token) resolve(token);
        else reject(new Error("Verification failed. Please request a new code."));
      },
      (error) => reject(new Error(widgetMessage(error, "Wrong code. Please try again."))),
      reqId ?? undefined,
    );
  });
}

// ---------------------------------------------------------------------------
// Direct (server-side) SMS fallback.
// The MSG91 browser widget silently drops sends for numbers that hit its
// per-number request limit — the transaction shows in the MSG91 console but no
// SMS goes out. That is what blocks the admin numbers. These helpers call the
// `msg91-otp` edge function, which talks to the MSG91 API v5 directly, so a
// blocked widget can never stop delivery.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";

async function callOtpFunction(action: "send" | "retry" | "verify", payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("msg91-otp", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message || "SMS service is unavailable. Please try again.");
  if (!data?.ok) throw new Error((data as { error?: string })?.error || "SMS service failed. Please try again.");
  return data as { ok: true; reqId?: string | null };
}

/** Sends an OTP straight through the MSG91 API, bypassing the browser widget. */
export async function msg91DirectSendOtp(identifier: string): Promise<string | null> {
  const data = await callOtpFunction("send", { identifier });
  return data.reqId ?? null;
}

/** Verifies an OTP that was sent through the direct (non-widget) route. */
export async function msg91DirectVerifyOtp(identifier: string, otp: string): Promise<void> {
  await callOtpFunction("verify", { identifier, otp });
}
