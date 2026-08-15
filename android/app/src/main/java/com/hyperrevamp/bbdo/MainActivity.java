package com.hyperrevamp.bbdo;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.content.Intent;
import android.webkit.WebSettings;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.ionicframework.capacitor.Checkout;

public class MainActivity extends BridgeActivity {
    private static final String BBDO_PUSH_CHANNEL_ID = "bbdo-alerts-v14";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BBDOAndroidPushPlugin.class);
        registerPlugin(BBDOBiometricsPlugin.class);
        registerPlugin(Checkout.class);
        super.onCreate(savedInstanceState);
        createBbdoNotificationChannel();
        // Android can recreate this Activity while the system WebView provider
        // is updating after a settings/permission round-trip. Capacitor then
        // renders its fallback without a Bridge; dereferencing it crashed the
        // process immediately on resume.
        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) return;
        WebSettings settings = bridge.getWebView().getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setTextZoom(100);
        // Razorpay Checkout hides UPI when the user agent identifies an Android
        // WebView (the "; wv" marker). Presenting a plain Chrome mobile UA makes
        // Checkout offer UPI Intent/Collect exactly like a mobile browser.
        try {
            String ua = settings.getUserAgentString();
            if (ua != null && ua.contains("; wv")) {
                settings.setUserAgentString(ua.replace("; wv", ""));
            }
        } catch (Exception ignored) {}

        // Razorpay Checkout launches UPI apps via `upi:`/`intent:` URLs. A plain
        // WebView refuses to load those schemes, so Checkout hides UPI entirely.
        // Handing them to the system lets GPay/PhonePe/Paytm open normally.
        bridge.getWebView().setWebViewClient(new UpiAwareWebViewClient(bridge));
    }

    private class UpiAwareWebViewClient extends BridgeWebViewClient {
        UpiAwareWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (request != null && request.getUrl() != null
                && launchExternalApp(request.getUrl().toString())) {
                return true;
            }
            return super.shouldOverrideUrlLoading(view, request);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (launchExternalApp(url)) return true;
            return super.shouldOverrideUrlLoading(view, url);
        }
    }

    private boolean launchExternalApp(String url) {
        if (url == null) return false;
        String scheme = Uri.parse(url).getScheme();
        if (scheme == null) return false;
        scheme = scheme.toLowerCase();
        boolean isAppLink = scheme.equals("upi") || scheme.equals("intent")
            || scheme.equals("tez") || scheme.equals("phonepe") || scheme.equals("paytmmp")
            || scheme.equals("gpay") || scheme.equals("bhim") || scheme.equals("credpay")
            || scheme.equals("mailto") || scheme.equals("tel") || scheme.equals("sms")
            || scheme.equals("whatsapp") || scheme.equals("market");
        if (!isAppLink) return false;

        try {
            Intent intent;
            if (scheme.equals("intent")) {
                intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (Exception e) {
            if (scheme.equals("upi") || scheme.equals("intent")) {
                Toast.makeText(this, "No UPI app found. Please pick another payment method.",
                    Toast.LENGTH_LONG).show();
                return true;
            }
            return false;
        }
    }

    private void createBbdoNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        try { manager.deleteNotificationChannel("bbdo-alerts-v6"); } catch (Exception ignored) {}
        try { manager.deleteNotificationChannel("bbdo-alerts-v5"); } catch (Exception ignored) {}
        try { manager.deleteNotificationChannel("bbdo-alerts-v7"); } catch (Exception ignored) {}
        try { manager.deleteNotificationChannel("bbdo-alerts-v8"); } catch (Exception ignored) {}
        try { manager.deleteNotificationChannel("bbdo-alerts-v9"); } catch (Exception ignored) {}
        try { manager.deleteNotificationChannel("bbdo-alerts-v10"); } catch (Exception ignored) {}
        try { manager.deleteNotificationChannel("bbdo-alerts-v11"); } catch (Exception ignored) {}
        try { manager.deleteNotificationChannel("bbdo-alerts-v12"); } catch (Exception ignored) {}
        try { manager.deleteNotificationChannel("bbdo-alerts-v13"); } catch (Exception ignored) {}

        if (manager.getNotificationChannel(BBDO_PUSH_CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            BBDO_PUSH_CHANNEL_ID,
            "BBDO notifications",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Reminders, coach messages, and health nudges");
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

        Uri bbdoSound = Uri.parse("android.resource://" + getPackageName() + "/raw/bbdo_chime");
        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(bbdoSound, attributes);

        manager.createNotificationChannel(channel);
    }
}
