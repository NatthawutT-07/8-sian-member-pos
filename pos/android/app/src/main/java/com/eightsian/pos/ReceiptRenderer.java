package com.eightsian.pos;

import android.graphics.*;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.*;
import org.json.JSONObject;

final class ReceiptRenderer {
    private final MainActivity activity;
    private final FrameLayout root;
    private WebView view;
    private CompletableFuture<String> result;
    ReceiptRenderer(MainActivity activity, FrameLayout root) { this.activity = activity; this.root = root; }
    String render(JSONObject input) throws Exception {
        CompletableFuture<String> job = new CompletableFuture<>();
        result = job;
        activity.runOnUiThread(() -> {
            destroy();
            view = new WebView(activity);
            activity.configure(view);
            view.setInitialScale(100);
            view.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(576, 1000);
            params.leftMargin = -4000;
            root.addView(view, params);
            view.addJavascriptInterface(new Object() {
                @JavascriptInterface public void ready(int height) { activity.runOnUiThread(() -> capture(height, job)); }
                @JavascriptInterface public void failed(String error) { job.completeExceptionally(new Exception(error)); }
            }, "NativeRender");
            // Preserve the same asset-only resource interception while detecting document load.
            view.setWebChromeClient(new WebChromeClient() {
                private boolean started;
                @Override public void onProgressChanged(WebView w, int progress) {
                    if (progress == 100 && !started) {
                        started = true;
                        w.evaluateJavascript("Promise.resolve(window.preparePrint(" + input.toString() + ")).then(h=>NativeRender.ready(h)).catch(e=>NativeRender.failed(String(e)))", null);
                    }
                }
            });
            view.loadUrl(MainActivity.LOCAL + "desktop/print.html");
        });
        try { return job.get(40, TimeUnit.SECONDS); }
        finally { activity.runOnUiThread(this::destroy); }
    }
    private void capture(int height, CompletableFuture<String> job) {
        try {
            if (height < 1 || height > 24000) throw new Exception("ใบเสร็จยาวเกินกำหนด");
            view.measure(View.MeasureSpec.makeMeasureSpec(576, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
            view.layout(0, 0, 576, height);
            // Let WebView finish layout before drawing Thai glyphs into printer-width strips.
            view.postDelayed(() -> {
                try {
                    ByteArrayOutputStream output = new ByteArrayOutputStream();
                    output.write(new byte[]{27, 64, 27, 97, 0});
                    for (int top = 0; top < height; top += 128) {
                        int rows = Math.min(128, height - top);
                        Bitmap bitmap = Bitmap.createBitmap(576, rows, Bitmap.Config.ARGB_8888);
                        Canvas canvas = new Canvas(bitmap);
                        canvas.drawColor(Color.WHITE);
                        canvas.translate(0, -top);
                        view.draw(canvas);
                        output.write(new byte[]{29, 118, 48, 0, 72, 0, (byte) rows, 0});
                        byte[] pixels = new byte[72 * rows];
                        int[] colors = new int[576 * rows];
                        bitmap.getPixels(colors, 0, 576, 0, 0, 576, rows);
                        for (int y = 0; y < rows; y++) for (int x = 0; x < 576; x++) {
                            int color = colors[y * 576 + x];
                            int gray = (Color.red(color) * 299 + Color.green(color) * 587 + Color.blue(color) * 114) / 1000;
                            // Match desktop: retain light glyph edges; solid barcode geometry stays unchanged.
                            if (gray < 200) pixels[y * 72 + x / 8] |= (byte) (128 >> (x % 8));
                        }
                        output.write(pixels);
                        bitmap.recycle();
                    }
                    job.complete(android.util.Base64.encodeToString(output.toByteArray(), android.util.Base64.NO_WRAP));
                } catch (Exception error) { job.completeExceptionally(error); }
            }, 200);
        } catch (Exception error) { job.completeExceptionally(error); }
    }
    void destroy() {
        if (view != null) { root.removeView(view); view.removeJavascriptInterface("NativeRender"); view.destroy(); view = null; }
    }
}
