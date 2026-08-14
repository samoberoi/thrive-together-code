// MSG91 OTP bridge — all calls go through the `msg91-otp` edge function so the
// exact same flow works on web and inside the native Android/iOS webviews.

import { supabase } from "@/integrations/supabase/client";

export const OTP_LENGTH = 4;

type OtpResponse = { ok?: boolean; reqId?: string | null; error?: string };

async function callOtp(payload: Record<string, unknown>, fallbackError: string): Promise<OtpResponse> {
  const { data, error } = await supabase.functions.invoke<OtpResponse>("msg91-otp", { body: payload });
  if (error && !data) throw new Error(fallbackError);
  if (!data?.ok) throw new Error(data?.error || fallbackError);
  return data;
}

/** Sends an OTP over SMS. `identifier` must be country code + number, digits only. */
export async function msg91SendOtp(identifier: string): Promise<string | null> {
  const data = await callOtp({ action: "send", identifier }, "Could not send the code. Please try again.");
  return data.reqId ?? null;
}

/** Resends the OTP over SMS. */
export async function msg91RetryOtp(identifier: string): Promise<void> {
  await callOtp({ action: "retry", identifier }, "Could not resend the code.");
}

/** Verifies the OTP server-side. Throws when the code is wrong or expired. */
export async function msg91VerifyOtp(identifier: string, otp: string): Promise<void> {
  await callOtp({ action: "verify", identifier, otp }, "Wrong code. Please try again.");
}
