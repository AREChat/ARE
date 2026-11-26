package app.arechat.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import java.util.ArrayList;
import java.util.Map;

/**
 * 通知を「強く」出す係。
 *  ・メッセージ：画面の上にポップアップ＋バイブ。同じチャットの通知は、1つにまとめて（最大5行）出す
 *  ・着信：電話のように鳴りつづける（60秒）＋画面ロック中でも全画面で出る＋「出る／切る」ボタン
 *  ・朝のお知らせ：アラームの音
 *  ・しずか：音もバイブもなし（サーバーが「しずかに」と指定したとき）
 *  ・「おやすみモード」の許可をもらえたときは、着信と朝のお知らせは、おやすみモード中でも鳴らす
 */
public final class Notifier {
    public static final String CH_MSG = "msg_v2", CH_CALL = "call_v2", CH_MORNING = "morning_v2", CH_QUIET = "quiet_v2";
    public static final String CH_CALL_DND = "call_dnd_v2", CH_MORNING_DND = "morning_dnd_v2";
    private static final long[] VIB_MSG = {0, 200, 100, 200, 100, 200};
    private static final long[] VIB_CALL = {0, 500, 150, 500, 150, 500, 150, 500, 150, 500, 150, 500};
    private static final long[] VIB_MORNING = {0, 400, 150, 400, 150, 400, 150, 400};
    private static final int MAX_LINES = 5;

    private Notifier() {}

    public static boolean dndGranted(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return Build.VERSION.SDK_INT >= 23 && nm != null && nm.isNotificationPolicyAccessGranted();
    }

    public static boolean fullScreenAllowed(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 34 && nm != null) return nm.canUseFullScreenIntent();
        return true;
    }

    /** チャンネル（通知の種類ごとの設定）を作る。何度呼んでもよい */
    public static void createChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        AudioAttributes note = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        AudioAttributes ring = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        AudioAttributes alarm = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        Uri uNote = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        Uri uRing = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        Uri uAlarm = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);

        nm.createNotificationChannel(channel(c, CH_MSG, R.string.ch_msg, R.string.ch_msg_desc, NotificationManager.IMPORTANCE_HIGH, uNote, note, VIB_MSG, false));
        nm.createNotificationChannel(channel(c, CH_CALL, R.string.ch_call, R.string.ch_call_desc, NotificationManager.IMPORTANCE_HIGH, uRing, ring, VIB_CALL, false));
        nm.createNotificationChannel(channel(c, CH_MORNING, R.string.ch_morning, R.string.ch_morning_desc, NotificationManager.IMPORTANCE_HIGH, uAlarm, alarm, VIB_MORNING, false));
        nm.createNotificationChannel(channel(c, CH_QUIET, R.string.ch_quiet, R.string.ch_quiet_desc, NotificationManager.IMPORTANCE_DEFAULT, null, null, null, false));
        if (dndGranted(c)) {   // おやすみモードの許可がある人だけ、おやすみモードでも鳴るチャンネルを足す
            nm.createNotificationChannel(channel(c, CH_CALL_DND, R.string.ch_call, R.string.ch_call_desc, NotificationManager.IMPORTANCE_HIGH, uRing, ring, VIB_CALL, true));
            nm.createNotificationChannel(channel(c, CH_MORNING_DND, R.string.ch_morning, R.string.ch_morning_desc, NotificationManager.IMPORTANCE_HIGH, uAlarm, alarm, VIB_MORNING, true));
        }
    }

    private static NotificationChannel channel(Context c, String id, int name, int desc, int importance, Uri sound, AudioAttributes attr, long[] vib, boolean bypassDnd) {
        NotificationChannel ch = new NotificationChannel(id, c.getString(name), importance);
        ch.setDescription(c.getString(desc));
        ch.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        if (sound != null) ch.setSound(sound, attr); else ch.setSound(null, null);
        if (vib != null) { ch.enableVibration(true); ch.setVibrationPattern(vib); } else ch.enableVibration(false);
        if (importance >= NotificationManager.IMPORTANCE_HIGH) ch.enableLights(true);
        if (bypassDnd) ch.setBypassDnd(true);
        return ch;
    }

    private static String get(Map<String, String> d, String k, String def) {
        String v = d.get(k);
        return v == null || v.isEmpty() ? def : v;
    }

    private static boolean truthy(String s) { return "1".equals(s) || "true".equalsIgnoreCase(s); }

    /** サーバー（GAS）から届いた1件を、通知として出す（または消す） */
    public static void show(Context c, Map<String, String> d) {
        createChannels(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String type = get(d, "type", "msg");
        String room = get(d, "room", "");
        String tag = get(d, "tag", room.isEmpty() ? "are" : "room-" + room);
        SharedPreferences sp = c.getSharedPreferences("are_notif", Context.MODE_PRIVATE);

        if ("clear".equals(type)) {   // 他の端末で読んだ → ここの通知も消す
            nm.cancel(tag, 1);
            sp.edit().remove("l:" + tag).apply();
            return;
        }
        boolean silent = truthy(d.get("silent"));
        boolean call = "call".equals(type) || "emergency".equals(type);
        boolean morning = "morning".equals(type);
        String title = trim(get(d, "title", "ARE"), 80);
        String body = trim(get(d, "body", call ? "着信です。タップして出る" : "新しいメッセージがあります"), 140);

        boolean dnd = dndGranted(c);
        String ch = silent ? CH_QUIET : call ? (dnd ? CH_CALL_DND : CH_CALL) : morning ? (dnd ? CH_MORNING_DND : CH_MORNING) : CH_MSG;

        Intent open = new Intent(c, MainActivity.class).setAction(Intent.ACTION_MAIN)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra("room", room).putExtra("call", call);
        PendingIntent tap = PendingIntent.getActivity(c, tag.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, ch)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF4C8DFF)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(tap)
                .setAutoCancel(!call)
                .setPriority(silent ? NotificationCompat.PRIORITY_DEFAULT : NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(new NotificationCompat.Builder(c, ch).setSmallIcon(R.drawable.ic_stat).setContentTitle("ARE").setContentText(call ? "着信" : "新しいお知らせ").build())
                .setCategory(call ? NotificationCompat.CATEGORY_CALL : morning ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_MESSAGE);

        if (!call && !morning) {   // メッセージ：同じチャットの新着を、最大5行ためて、1つの通知にまとめる
            ArrayList<String> lines = loadLines(sp, tag);
            lines.add(body);
            while (lines.size() > MAX_LINES) lines.remove(0);
            saveLines(sp, tag, lines);
            b.setNumber(lines.size());
            if (lines.size() > 1) {
                NotificationCompat.InboxStyle st = new NotificationCompat.InboxStyle().setBigContentTitle(title);
                for (String s : lines) st.addLine(s);
                st.setSummaryText(lines.size() + "件の新着");
                b.setStyle(st);
            } else {
                b.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
            }
            b.setOnlyAlertOnce(false);
        }
        if (call) {
            b.setOngoing(true).setTimeoutAfter(60_000);
            Intent dec = new Intent(c, CallActionReceiver.class).putExtra("tag", tag);
            PendingIntent decline = PendingIntent.getBroadcast(c, tag.hashCode() + 1, dec, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.addAction(0, c.getString(R.string.call_accept), tap);
            b.addAction(0, c.getString(R.string.call_decline), decline);
            if (!silent && fullScreenAllowed(c)) b.setFullScreenIntent(tap, true);   // 画面ロック中でも、全画面で出す
        }
        Notification n = b.build();
        if (call && !silent) n.flags |= Notification.FLAG_INSISTENT;   // 切るまで（60秒）、音をくりかえす
        if (Build.VERSION.SDK_INT < 26 && !silent) {   // 古い Android：チャンネルがないので、ここで音とバイブを決める
            n.vibrate = call ? VIB_CALL : morning ? VIB_MORNING : VIB_MSG;
            n.sound = RingtoneManager.getDefaultUri(call ? RingtoneManager.TYPE_RINGTONE : morning ? RingtoneManager.TYPE_ALARM : RingtoneManager.TYPE_NOTIFICATION);
        }
        try {
            nm.notify(tag, 1, n);
        } catch (SecurityException e) {
            // 通知の許可がないとき。何もしない
        }
    }

    public static void cancelAll(Context c, String tag) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(tag, 1);
        c.getSharedPreferences("are_notif", Context.MODE_PRIVATE).edit().remove("l:" + tag).apply();
    }

    private static String trim(String s, int n) { return s.length() <= n ? s : s.substring(0, n); }

    static ArrayList<String> loadLines(SharedPreferences sp, String tag) {
        ArrayList<String> out = new ArrayList<>();
        String raw = sp.getString("l:" + tag, "");
        if (!raw.isEmpty()) for (String s : raw.split("\u0001", -1)) out.add(s);
        return out;
    }

    static void saveLines(SharedPreferences sp, String tag, ArrayList<String> lines) {
        sp.edit().putString("l:" + tag, String.join("\u0001", lines)).apply();
    }
}
