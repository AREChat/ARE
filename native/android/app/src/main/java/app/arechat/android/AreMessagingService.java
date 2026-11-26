package app.arechat.android;

import android.content.SharedPreferences;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** Firebase（無料）から届いた「お知らせ」を受け取って、Notifier に渡す。アプリが閉じていても、ここが動く */
public class AreMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Notifier.show(getApplicationContext(), message.getData());
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // 新しいトークンは、次にアプリを開いたとき、画面側が GAS へ登録しなおす
        SharedPreferences sp = getSharedPreferences("are_app", MODE_PRIVATE);
        sp.edit().putString("fcm_token", token).putBoolean("fcm_dirty", true).apply();
    }
}
