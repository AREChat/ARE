package app.arechat.android;

import android.app.Application;

public class AreApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        Notifier.createChannels(this);
        FcmGlue.initFromSaved(this);   // アプリが閉じている間に届く通知を受けるため、起動のたびに Firebase を準備する
    }
}
