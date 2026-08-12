package com.hyperrevamp.bbdo;

import android.os.Build;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * First-party Android biometric bridge.
 *
 * Replaces the third-party plugin whose transparent AuthActivity terminated the
 * host task after a successful fingerprint. This implementation hosts
 * BiometricPrompt directly on MainActivity (no extra Activity, no process
 * hand-off) and never combines a negative button with device-credential
 * fallback, which is the illegal combination that crashed BiometricPrompt.
 */
@CapacitorPlugin(name = "BBDOBiometrics")
public class BBDOBiometricsPlugin extends Plugin {

    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_STRONG
            | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    private static final int WEAK_AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK
            | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    private int allowedAuthenticators() {
        // BIOMETRIC_STRONG + DEVICE_CREDENTIAL is unsupported on API 28/29.
        if (Build.VERSION.SDK_INT == Build.VERSION_CODES.P || Build.VERSION.SDK_INT == Build.VERSION_CODES.Q) {
            return BiometricManager.Authenticators.BIOMETRIC_WEAK;
        }
        return AUTHENTICATORS;
    }

    @PluginMethod
    public void check(PluginCall call) {
        JSObject result = new JSObject();
        try {
            BiometricManager manager = BiometricManager.from(getContext());
            int biometricStatus = manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
            int credentialStatus = manager.canAuthenticate(BiometricManager.Authenticators.DEVICE_CREDENTIAL);

            boolean biometryAvailable = biometricStatus == BiometricManager.BIOMETRIC_SUCCESS;
            boolean deviceSecure = credentialStatus == BiometricManager.BIOMETRIC_SUCCESS;

            String code;
            String reason;
            switch (biometricStatus) {
                case BiometricManager.BIOMETRIC_SUCCESS:
                    code = "available";
                    reason = "Biometric unlock is ready.";
                    break;
                case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                    code = "biometryNotEnrolled";
                    reason = deviceSecure
                        ? "No fingerprint or face enrolled — your device PIN can be used."
                        : "No fingerprint, face, or screen lock is set up on this device.";
                    break;
                case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                    code = "biometryNotAvailable";
                    reason = "This device has no biometric hardware.";
                    break;
                case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                    code = "biometryTemporarilyUnavailable";
                    reason = "Biometric hardware is busy. Try again in a moment.";
                    break;
                default:
                    code = "unavailable";
                    reason = "Biometric unlock is not available on this device.";
                    break;
            }

            result.put("available", biometryAvailable || deviceSecure);
            result.put("biometryAvailable", biometryAvailable);
            result.put("deviceSecure", deviceSecure);
            result.put("biometryType", biometryAvailable ? "fingerprint" : "none");
            result.put("label", biometryAvailable ? "Fingerprint / Face Unlock" : "Device unlock");
            result.put("code", code);
            result.put("reason", reason);
            call.resolve(result);
        } catch (Exception e) {
            result.put("available", false);
            result.put("biometryAvailable", false);
            result.put("deviceSecure", false);
            result.put("biometryType", "none");
            result.put("label", "Biometrics");
            result.put("code", "plugin-error");
            result.put("reason", e.getMessage() == null ? "Biometric check failed." : e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void authenticate(final PluginCall call) {
        final FragmentActivity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable");
            return;
        }

        final String reason = call.getString("reason", "Unlock bye bye diabetes");

        // BiometricPrompt/AndroidX is known to invoke a second, terminal
        // callback (typically onAuthenticationError with ERROR_CANCELED) right
        // after onAuthenticationSucceeded while the prompt fragment tears
        // itself down. Capacitor's PluginCall throws if resolve()/reject() is
        // invoked more than once, which crashed the app a beat after a
        // successful touch. Guard with a one-shot flag so only the first
        // terminal callback ever touches the call.
        final AtomicBoolean settled = new AtomicBoolean(false);

        activity.runOnUiThread(() -> {
            try {
                Executor executor = androidx.core.content.ContextCompat.getMainExecutor(activity);
                BiometricPrompt prompt = new BiometricPrompt(
                    activity,
                    executor,
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            if (!settled.compareAndSet(false, true)) return;
                            JSObject ret = new JSObject();
                            ret.put("success", true);
                            call.resolve(ret);
                        }

                        @Override
                        public void onAuthenticationError(int errorCode, CharSequence errString) {
                            if (!settled.compareAndSet(false, true)) return;
                            JSObject ret = new JSObject();
                            ret.put("success", false);
                            ret.put("code", errorCode);
                            ret.put("message", errString == null ? "" : errString.toString());
                            call.resolve(ret);
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // Non-terminal: the prompt stays open for a retry.
                        }
                    }
                );

                int authenticators = allowedAuthenticators();
                BiometricPrompt.PromptInfo.Builder builder = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("bye bye diabetes")
                    .setSubtitle(reason)
                    .setConfirmationRequired(false)
                    .setAllowedAuthenticators(authenticators);

                // A negative button is ONLY legal when device credential is not
                // an allowed authenticator. Sending both crashes BiometricPrompt.
                if ((authenticators & BiometricManager.Authenticators.DEVICE_CREDENTIAL) == 0) {
                    builder.setNegativeButtonText("Cancel");
                }

                prompt.authenticate(builder.build());
            } catch (Exception e) {
                if (settled.compareAndSet(false, true)) {
                    JSObject ret = new JSObject();
                    ret.put("success", false);
                    ret.put("code", "prompt-error");
                    ret.put("message", e.getMessage() == null ? "Biometric prompt failed." : e.getMessage());
                    call.resolve(ret);
                }
            }
        });
    }
}
