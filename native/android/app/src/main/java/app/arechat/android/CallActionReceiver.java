package app.arechat.android;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 着信の「切る」ボタン：通知を消すだけ */
public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String tag = intent == null ? null : intent.getStringExtra("tag");
        if (tag != null) Notifier.cancelAll(context, tag);
    }
}
