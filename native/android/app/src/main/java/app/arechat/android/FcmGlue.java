package app.arechat.android;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

/**
 * Firebase の準備。設定ファイル（google-services.json）は使いません。
 * 接続の値（公開してよいもの）は、ARE の GAS から画面経由で受け取り、ここで保存して使います。
 */
public final class FcmGlue {
    public interface TokenCallback { void onToken(String token); void onError(String message); }

    private FcmGlue() {}

    /** 保存してある値で、Firebase を準備する。値がなければ何もしない */
    public static boolean initFromSaved(Context c) {
        SharedPreferences sp = c.getSharedPreferences("are_app", Context.MODE_PRIVATE);
        String json = sp.getString("fb_opts", "");
        return !json.isEmpty() && init(c, json, false);
    }

    /** 画面から受け取った値で、Firebase を準備して保存する */
    public static boolean init(Context c, String json, boolean save) {
        try {
            JSONObject o = new JSONObject(json);
            String projectId = o.optString("projectId"), appId = o.optString("appId"), apiKey = o.optString("apiKey"), sender = o.optString("senderId");
            if (projectId.isEmpty() || appId.isEmpty() || apiKey.isEmpty() || sender.isEmpty()) return false;
            if (FirebaseApp.getApps(c).isEmpty()) {
                FirebaseOptions opts = new FirebaseOptions.Builder()
                        .setProjectId(projectId).setApplicationId(appId).setApiKey(apiKey).setGcmSenderId(sender).build();
                FirebaseApp.initializeApp(c, opts);
            }
            if (save) c.getSharedPreferences("are_app", Context.MODE_PRIVATE).edit().putString("fb_opts", json).apply();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public static void fetchToken(Context c, TokenCallback cb) {
        try {
            if (FirebaseApp.getApps(c).isEmpty()) { cb.onError("firebase_not_ready"); return; }
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(t -> {
                if (t.isSuccessful() && t.getResult() != null) {
                    c.getSharedPreferences("are_app", Context.MODE_PRIVATE).edit().putString("fcm_token", t.getResult()).apply();
                    cb.onToken(t.getResult());
                } else {
                    cb.onError(t.getException() == null ? "token_failed" : String.valueOf(t.getException().getMessage()));
                }
            });
        } catch (Exception e) {
            cb.onError(String.valueOf(e.getMessage()));
        }
    }
}
