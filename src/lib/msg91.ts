// MSG91 OTP bridge. Ordinary Indian users use the server-side OTP endpoint so
// delivery does not depend on the browser widget loading or completing its
// encrypted request. The endpoint uses MSG91's configured default template.

export const OTP_LENGTH = 4;

declare global {
  interface Window {
    sendOtp?: (identifier: string, success: (data: unknown) => void, failure: (error: unknown) => void) => void;
    verifyOtp?: (otp: string, success: (data: unknown) => void, failure: (error: unknown) => void, reqId?: string) => void;
    retryOtp?: (channel: string, success: (data: unknown) => void, failure: (error: unknown) => void, reqId?: string) => void;
  }
}

type OtpResponse = { ok?: boolean; error?: string; reqId?: string | null };

async function callOtpFunction(action: "send" | "retry" | "verify", payload: Record<string, unknown>): Promise<OtpResponse> {
  const backendUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${backendUrl}/functions/v1/msg91-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = (await response.json().catch(() => null)) as OtpResponse | null;
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || "SMS service is unavailable. Please try again.");
  }
  return data;
}

/** Sends an OTP over SMS. `identifier` must be country code + number, digits only. */
export async function msg91SendOtp(identifier: string): Promise<string | null> {
  const data = await callOtpFunction("send", { identifier });
  return data.reqId ?? null;
}

/** Resends the OTP over SMS. */
export async function msg91RetryOtp(identifier: string): Promise<string | null> {
  const data = await callOtpFunction("retry", { identifier });
  return data.reqId ?? null;
}

/** Verifies an OTP against the same server-side transaction used to send it. */
export async function msg91VerifyOtp(identifier: string, otp: string): Promise<void> {
  await callOtpFunction("verify", { identifier, otp });
}

// ---------------------------------------------------------------------------
// Staff authentication is checked and verified server-side. End users continue
// to use the MSG91 widget above without any change to their working flow.
// ---------------------------------------------------------------------------

async function callStaffOtpFunction(action: "check" | "send" | "retry" | "verify", payload: Record<string, unknown>) {
  const backendUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${backendUrl}/functions/v1/staff-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "SMS service is unavailable. Please try again.");
  if (!data?.ok) throw new Error((data as { error?: string })?.error || "SMS service failed. Please try again.");
  return data as { ok: true; staff?: boolean; reqId?: string | null };
}

export async function startStaffOtp(phone: string, dial: string): Promise<{ staff: boolean; reqId: string | null }> {
  const data = await callStaffOtpFunction("send", { phone, dial });
  return { staff: data.staff === true, reqId: data.reqId ?? null };
}

export async function verifyStaffOtp(phone: string, dial: string, otp: string): Promise<void> {
  await callStaffOtpFunction("verify", { phone, dial, otp });
}
