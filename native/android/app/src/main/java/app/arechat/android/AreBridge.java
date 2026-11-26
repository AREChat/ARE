package app.arechat.android;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.UUID;

/**
 * 画面（ARE の Web ページ）から呼べる、アプリ側の機能。window.AREAndroid として見える。
 * ・ARE のページ（arechat.github.io）にいるときだけ使える（ほかのサイトからは、何もしない）
 */
public class AreBridge {
    private final MainActivity act;

    AreBridge(MainActivity act) { this.act = act; }

    private boolean ok() { return act.onAllowedPage(); }

    private Context ctx() { return act.getApplicationContext(); }

    @JavascriptInterface
    public boolean isApp() { return ok(); }

    @JavascriptInterface
    public String version() { return BuildConfig.VERSION_NAME; }

    /** この端末に、ずっと同じ番号（アプリを消すまで） */
    @JavascriptInterface
    public String deviceId() {
        if (!ok()) return "";
        android.content.SharedPreferences sp = ctx().getSharedPreferences("are_app", Context.MODE_PRIVATE);
        String id = sp.getString("device_id", "");
        if (id.isEmpty()) { id = UUID.randomUUID().toString().replace("-", ""); sp.edit().putString("device_id", id).apply(); }
        return id;
    }

    /** GAS から受け取った Firebase の接続値で準備して、通知用の番号（トークン）を取りにいく。結果は window.__areFcm(token, error) に返る */
    @JavascriptInterface
    public void initFirebase(String json) {
        if (!ok()) return;
        boolean ready = FcmGlue.init(ctx(), json, true);
        if (!ready) { act.callJs("window.__areFcm&&window.__areFcm('', 'bad_config')"); return; }
        FcmGlue.fetchToken(ctx(), new FcmGlue.TokenCallback() {
            @Override public void onToken(String token) {
                ctx().getSharedPreferences("are_app", Context.MODE_PRIVATE).edit().putBoolean("fcm_dirty", false).apply();
                act.callJs("window.__areFcm&&window.__areFcm(" + JSONObject.quote(token) + ", '')");
            }
            @Override public void onError(String message) {
                act.callJs("window.__areFcm&&window.__areFcm('', " + JSONObject.quote(message) + ")");
            }
        });
    }

    @JavascriptInterface
    public String status() {
        if (!ok()) return "{}";
        try {
            Context c = ctx();
            JSONObject o = new JSONObject();
            o.put("notif", NotificationManagerCompat.from(c).areNotificationsEnabled());
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            o.put("battery", pm != null && Build.VERSION.SDK_INT >= 23 && pm.isIgnoringBatteryOptimizations(c.getPackageName()));
            o.put("dnd", Notifier.dndGranted(c));
            o.put("fullscreen", Notifier.fullScreenAllowed(c));
            o.put("fcm", !c.getSharedPreferences("are_app", Context.MODE_PRIVATE).getString("fcm_token", "").isEmpty());
            o.put("sdk", Build.VERSION.SDK_INT);
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void openNotificationSettings() {
        if (!ok()) return;
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx().getPackageName());
        act.startSafe(i);
    }

    /** 電池の節約から外す（これをしないと、画面を消してしばらくすると、通知がおくれることがある） */
    @JavascriptInterface
    public void requestBatteryExempt() {
        if (!ok()) return;
        Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx().getPackageName()));
        if (!act.startSafe(i)) act.startSafe(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
    }

    /** 「おやすみモード」でも、着信と朝のお知らせを鳴らす許可の画面を開く */
    @JavascriptInterface
    public void requestDndAccess() {
        if (!ok()) return;
        act.startSafe(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
    }

    /** 画面ロック中に、着信を全画面で出す許可（Android 14 以上） */
    @JavascriptInterface
    public void requestFullScreen() {
        if (!ok()) return;
        if (Build.VERSION.SDK_INT >= 34) {
            act.startSafe(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + ctx().getPackageName())));
        }
    }

    @JavascriptInterface
    public void testNotification(String kind) {
        if (!ok()) return;
        HashMap<String, String> d = new HashMap<>();
        d.put("type", "call".equals(kind) ? "call" : "morning".equals(kind) ? "morning" : "msg");
        d.put("title", "call".equals(kind) ? "📞 着信（テスト）" : "morning".equals(kind) ? "☀️ 朝のお知らせ（テスト）" : "ARE（テスト）");
        d.put("body", "これは、通知のテストです。");
        d.put("tag", "are-test-" + (kind == null ? "msg" : kind));
        Notifier.show(ctx(), d);
    }
}
