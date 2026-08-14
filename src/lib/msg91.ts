// MSG91 OTP widget bridge.
// The widget script is loaded in index.html and exposes sendOtp / verifyOtp / retryOtp
// on window (exposeMethods: true).

declare global {
  interface Window {
    sendOtp?: (identifier: string, success: (data: any) => void, failure: (err: any) => void) => void;
    verifyOtp?: (
      otp: string | number,
      success: (data: any) => void,
      failure: (err: any) => void,
      reqId?: string,
    ) => void;
    retryOtp?: (
      channel: string,
      success: (data: any) => void,
      failure: (err: any) => void,
      reqId?: string,
    ) => void;
  }
}


/** Wait until the widget script has finished loading (it is async). */
export async function waitForMsg91(timeoutMs = 8000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (typeof window.sendOtp === "function") return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return typeof window.sendOtp === "function";
}

function pickReqId(data: any): string | null {
  const rid = data?.message ?? data?.request_id ?? data?.reqId ?? null;
  return rid ? String(rid) : null;
}

/** Sends an OTP over SMS. `identifier` must be country code + number, digits only. */
export async function msg91SendOtp(identifier: string): Promise<string | null> {
  const ready = await waitForMsg91();
  if (!ready || !window.sendOtp) throw new Error("SMS service is still loading. Please try again.");
  return new Promise<string | null>((resolve, reject) => {
    window.sendOtp!(
      identifier,
      (data) => resolve(pickReqId(data)),
      (err) => reject(new Error(err?.message || "Could not send the code. Please try again.")),
    );
  });
}

/** Resends the OTP over SMS (channel 11). */
export async function msg91RetryOtp(reqId?: string | null): Promise<void> {
  const ready = await waitForMsg91();
  if (!ready || !window.retryOtp) throw new Error("SMS service is still loading. Please try again.");
  return new Promise<void>((resolve, reject) => {
    window.retryOtp!(
      "11",
      () => resolve(),
      (err) => reject(new Error(err?.message || "Could not resend the code.")),
      reqId || undefined,
    );
  });
}

/** Verifies the OTP client-side and returns the MSG91 access token. */
export async function msg91VerifyOtp(otp: string, reqId?: string | null): Promise<string> {
  const ready = await waitForMsg91();
  if (!ready || !window.verifyOtp) throw new Error("SMS service is still loading. Please try again.");
  return new Promise<string>((resolve, reject) => {
    window.verifyOtp!(
      otp,
      (data) => {
        const token = data?.message ?? data?.["access-token"] ?? data?.accessToken;
        if (!token) reject(new Error("Verification failed. Please try again."));
        else resolve(String(token));
      },
      (err) => reject(new Error(err?.message || "Wrong code. Please try again.")),
      reqId || undefined,
    );
  });
}
