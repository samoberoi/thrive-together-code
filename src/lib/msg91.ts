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
