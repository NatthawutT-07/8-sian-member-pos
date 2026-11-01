package com.eightsian.pos;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import android.net.Uri;
import android.widget.FrameLayout;
import android.content.pm.PackageManager;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    static final String LOCAL = "https://appassets.androidplatform.net/assets/";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final PosApi api = new PosApi();
    private WebView web;
    private BlePrinter bluetooth;
    private ReceiptRenderer renderer;
    private CompletableFuture<Boolean> permission;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WebView.enableSlowWholeDocumentDraw();
        FrameLayout root = new FrameLayout(this);
        root.setPadding(0, 0, 0, 0);
        setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        web = new WebView(this);
        configure(web);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        bluetooth = new BlePrinter(this, getPreferences(0));
        renderer = new ReceiptRenderer(this, root);
        web.addJavascriptInterface(new Bridge(), "PosNative");
        web.loadUrl(LOCAL + "web/index.html");
    }

    void configure(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView w, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (!url.startsWith(LOCAL)) return emptyResponse();
                String file = Uri.decode(url.substring(LOCAL.length()));
                if (!file.matches("[a-zA-Z0-9_./-]+") || file.contains("..")) return emptyResponse();
                try {
                    String mime = file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".png") ? "image/png" : file.endsWith(".html") ? "text/html" : "application/octet-stream";
                    WebResourceResponse response = new WebResourceResponse(mime, "UTF-8", getAssets().open(file));
                    java.util.Map<String, String> headers = new java.util.HashMap<>();
                    headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'");
                    headers.put("X-Content-Type-Options", "nosniff");
                    response.setResponseHeaders(headers);
                    return response;
                } catch (Exception ignored) { return emptyResponse(); }
            }
            @Override public void onReceivedSslError(WebView w, android.webkit.SslErrorHandler handler, android.net.http.SslError error) { handler.cancel(); }
        });
    }
    private WebResourceResponse emptyResponse() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    final class Bridge {
        @JavascriptInterface public void postMessage(String message) {
            if (message == null || message.length() > 4000000) return;
            // Only packaged content can load; external navigation, subframes and network loads are blocked.
            runOnUiThread(() -> {
                if (!(LOCAL + "web/index.html").equals(web.getUrl())) return;
                worker.execute(() -> dispatch(message));
            });
        }
    }
    private void dispatch(String message) {
        int id = 0;
        JSONObject result = new JSONObject();
        try {
            JSONObject request = new JSONObject(message);
            id = request.getInt("id");
            String action = request.getString("action");
            JSONObject input = request.optJSONObject("input");
            if (input == null) input = new JSONObject();
            Object value;
            switch (action) {
                case "api":
                    try { value = api.request(input); }
                    catch (Exception error) { value = new JSONObject().put("ok", false).put("status", 0).put("data", new JSONObject().put("message", "เชื่อมต่อ backend ไม่สำเร็จ ตรวจอินเทอร์เน็ตและ server")); }
                    break;
                case "settings": value = new JSONObject(getPreferences(0).getString("hardware", "{}")); break;
                case "saveSettings": getPreferences(0).edit().putString("hardware", input.toString()).commit(); value = true; break;
                case "render": api.requireSession(); value = renderer.render(input); break;
                case "transport":
                    api.requireSession();
                    ensureBluetoothPermission();
                    if (input.optString("action").equals("write")) api.consumeWritePermit();
                    value = bluetooth.execute(input);
                    break;
                default: throw new Exception("คำสั่งไม่ถูกต้อง");
            }
            result.put("ok", true).put("value", value);
        } catch (Exception error) {
            try { result.put("ok", false).put("error", error.getMessage() == null ? "ดำเนินการไม่สำเร็จ" : error.getMessage()); } catch (Exception ignored) {}
        }
        final int replyId = id;
        final String json = result.toString();
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.__posNativeResult(" + replyId + "," + json + ")", null); });
    }
    private void ensureBluetoothPermission() throws Exception {
        String[] permissions = android.os.Build.VERSION.SDK_INT >= 31
            ? new String[]{"android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_CONNECT"}
            : new String[]{"android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"};
        boolean granted = true;
        for (String item : permissions) if (checkSelfPermission(item) != PackageManager.PERMISSION_GRANTED) granted = false;
        if (granted) return;
        permission = new CompletableFuture<>();
        runOnUiThread(() -> requestPermissions(permissions, 41));
        if (!permission.get(45, TimeUnit.SECONDS)) throw new Exception("กรุณาอนุญาต Bluetooth / อุปกรณ์ใกล้เคียง แล้วลองอีกครั้ง");
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] names, int[] grants) {
        super.onRequestPermissionsResult(requestCode, names, grants);
        if (requestCode == 41 && permission != null) {
            boolean granted = grants.length > 0;
            for (int value : grants) granted &= value == PackageManager.PERMISSION_GRANTED;
            permission.complete(granted);
        }
    }
    @Override public void onBackPressed() {
        new android.app.AlertDialog.Builder(this).setMessage("ปิด POS? หากมีบิลกำลังส่งให้ตรวจผลบิลเดิมเมื่อเปิดใหม่")
            .setPositiveButton("ปิด", (dialog, which) -> finish()).setNegativeButton("ยกเลิก", null).show();
    }
    @Override protected void onDestroy() {
        worker.shutdownNow();
        if (web != null) { web.removeJavascriptInterface("PosNative"); web.destroy(); web = null; }
        if (renderer != null) renderer.destroy();
        super.onDestroy();
    }
}
