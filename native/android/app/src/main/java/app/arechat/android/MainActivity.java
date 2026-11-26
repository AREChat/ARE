package app.arechat.android;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.util.ArrayList;

/** ARE のチャットを開く入れ物。通知のタップで、そのチャットを直接ひらく */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 1, REQ_PERM = 2, REQ_NOTIF = 3, REQ_GEO = 4;
    private WebView web;
    private ValueCallback<Uri[]> fileCb;
    private PermissionRequest pendingPerm;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeo;
    private volatile String currentHost = "";

    /** いま開いているのが、ARE のページか（アプリの機能を使ってよい相手か） */
    boolean onAllowedPage() { return BuildConfig.SITE_HOST.equals(currentHost); }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        setContentView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " AREAndroid/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new AreBridge(this), "AREAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return route(r.getUrl()); }
            @Override public void onPageStarted(WebView v, String url, Bitmap f) { currentHost = hostOf(url); }
            @Override public void onPageFinished(WebView v, String url) { currentHost = hostOf(url); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try {
                    startActivityForResult(p.createIntent(), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest req) { askMedia(req); }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) { askGeo(origin, cb); }
        });
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        }
        web.loadUrl(urlFor(getIntent()));
    }

    private static String hostOf(String url) {
        try { String h = Uri.parse(url).getHost(); return h == null ? "" : h; } catch (Exception e) { return ""; }
    }

    private String urlFor(Intent i) {
        Uri data = i == null ? null : i.getData();
        if (data != null && BuildConfig.SITE_HOST.equals(data.getHost()) && "https".equals(data.getScheme())) return data.toString();
        String room = i == null ? null : i.getStringExtra("room");
        if (room != null && room.matches("^[0-9a-fA-F-]{36}$")) return BuildConfig.SITE_URL + "?room=" + room;
        return BuildConfig.SITE_URL;
    }

    /** ARE と、その部品（データベース・ファイル置き場）は、アプリの中で開く。ほかのサイトは、ふだんのブラウザで開く */
    private boolean route(Uri u) {
        String h = u.getHost() == null ? "" : u.getHost();
        boolean inside = "https".equals(u.getScheme()) && (h.equals(BuildConfig.SITE_HOST) || h.endsWith(".supabase.co")
                || h.equals("script.google.com") || h.endsWith(".googleusercontent.com") || h.equals("script.googleusercontent.com"));
        if (inside) return false;
        startSafe(new Intent(Intent.ACTION_VIEW, u));
        return true;
    }

    boolean startSafe(Intent i) {
        try { startActivity(i); return true; } catch (Exception e) { return false; }
    }

    void callJs(String js) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); }); }

    private void askMedia(PermissionRequest req) {
        ArrayList<String> need = new ArrayList<>();
        for (String r : req.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.CAMERA);
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.RECORD_AUDIO);
        }
        if (!onAllowedPage()) { req.deny(); return; }
        if (need.isEmpty()) { req.grant(req.getResources()); return; }
        pendingPerm = req;
        requestPermissions(need.toArray(new String[0]), REQ_PERM);
    }

    private void askGeo(String origin, GeolocationPermissions.Callback cb) {
        if (!onAllowedPage()) { cb.invoke(origin, false, false); return; }
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) { cb.invoke(origin, true, false); return; }
        pendingGeoOrigin = origin;
        pendingGeo = cb;
        requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_GEO);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        boolean all = res.length > 0;
        for (int r : res) if (r != PackageManager.PERMISSION_GRANTED) all = false;
        if (code == REQ_PERM && pendingPerm != null) {
            if (all) pendingPerm.grant(pendingPerm.getResources()); else pendingPerm.deny();
            pendingPerm = null;
        } else if (code == REQ_GEO && pendingGeo != null) {
            pendingGeo.invoke(pendingGeoOrigin, all, false);
            pendingGeo = null;
        } else if (code == REQ_NOTIF) {
            Notifier.createChannels(this);
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE && fileCb != null) {
            fileCb.onReceiveValue(res == Activity.RESULT_OK ? WebChromeClient.FileChooserParams.parseResult(res, data) : null);
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        web.loadUrl(urlFor(i));
    }

    @Override
    protected void onResume() {
        super.onResume();
        Notifier.createChannels(this);   // 「おやすみモード」の許可が、あとから変わっていたときのため
        callJs("window.__areResume&&window.__areResume()");
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
