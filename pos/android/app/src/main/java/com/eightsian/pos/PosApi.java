package com.eightsian.pos;

import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;

final class PosApi {
    static final String ORIGIN = "https://api.8sianracha.com";
    private String cookie = "";
    long writePermitUntil = 0;

    synchronized JSONObject request(JSONObject input) throws Exception {
        String route = input.getString("route");
        String method = input.optString("method", "POST");
        if (!route.matches("[a-zA-Z0-9/-]+(?:\\?date=\\d{4}-\\d{2}-\\d{2})?") || route.contains("//") || !(method.equals("POST") || method.equals("GET")))
            throw new Exception("คำขอ POS ไม่ถูกต้อง");
        Object body = input.opt("body");
        if (body == null || body == JSONObject.NULL) method = "GET";
        HttpsURLConnection connection = (HttpsURLConnection) new URL(ORIGIN + "/api/pos/" + route).openConnection();
        try {
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Origin", ORIGIN);
            if (!cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
            if (!method.equals("GET")) {
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                if (bytes.length > 8192) throw new Exception("คำขอใหญ่เกินกำหนด");
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setDoOutput(true);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) throw new Exception("API เปลี่ยนเส้นทาง กรุณาตรวจการตั้งค่า server");
            for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
                if ("Set-Cookie".equalsIgnoreCase(entry.getKey())) for (String value : entry.getValue())
                    if (value.startsWith("__Host-pos_session=") || value.startsWith("pos_session=")) cookie = value.split(";", 2)[0];
            }
            if (status == 401 || (route.equals("logout") && status < 300)) { cookie = ""; writePermitUntil = 0; }
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream == null) throw new Exception("ไม่ได้รับข้อมูลจาก backend");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (InputStream in = stream) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = in.read(buffer)) != -1) {
                    if (output.size() + count > 4000000) throw new Exception("ข้อมูลตอบกลับใหญ่เกินกำหนด");
                    output.write(buffer, 0, count);
                }
            }
            Object data;
            try { data = new org.json.JSONTokener(output.toString("UTF-8")).nextValue(); }
            catch (Exception error) { throw new Exception("backend ไม่ได้ตอบกลับเป็น JSON"); }
            if (status < 300 && route.equals("hardware/events") && body instanceof JSONObject && ((JSONObject) body).optString("status").equals("REQUESTED"))
                writePermitUntil = android.os.SystemClock.elapsedRealtime() + 60000;
            return new JSONObject().put("ok", status >= 200 && status < 300).put("status", status).put("data", data);
        } finally { connection.disconnect(); }
    }
    void requireSession() throws Exception {
        if (!request(new JSONObject().put("route", "me")).getBoolean("ok")) throw new Exception("กรุณาเข้าสู่ระบบ POS");
    }
    void consumeWritePermit() throws Exception {
        if (android.os.SystemClock.elapsedRealtime() > writePermitUntil || writePermitUntil == 0) throw new Exception("ต้องบันทึกคำขออุปกรณ์กับ server ก่อน");
        writePermitUntil = 0;
    }
}
