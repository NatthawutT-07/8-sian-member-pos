package com.eightsian.pos;

import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.Context;
import android.os.SystemClock;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;

// MainActivity requests runtime permissions before calling execute. Catch revocation as well.
@android.annotation.SuppressLint("MissingPermission")
final class BlePrinter {
    private final Context context;
    private final android.content.SharedPreferences preferences;
    private final UUID serviceId = UUID.fromString("000018f0-0000-1000-8000-00805f9b34fb");
    private final UUID writeId = UUID.fromString("00002af1-0000-1000-8000-00805f9b34fb");
    private final Map<String, BluetoothDevice> discovered = new ConcurrentHashMap<>();
    BlePrinter(Context context, android.content.SharedPreferences preferences) { this.context = context; this.preferences = preferences; }
    JSONObject execute(JSONObject input) throws Exception {
        try { return executeGranted(input); }
        catch (SecurityException error) { throw new Exception("สิทธิ์ Bluetooth ถูกปิด กรุณาอนุญาตอุปกรณ์ใกล้เคียงอีกครั้ง"); }
    }
    private JSONObject executeGranted(JSONObject input) throws Exception {
        BluetoothManager manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null || !adapter.isEnabled()) throw new Exception("เปิด Bluetooth ของแท็บเล็ตก่อน");
        String action = input.getString("action");
        if (action.equals("list")) return list(adapter);
        String id = input.getString("deviceId");
        if (!BluetoothAdapter.checkBluetoothAddress(id)) throw new Exception("รหัสเครื่องพิมพ์ไม่ถูกต้อง");
        // Only a printer discovered by this app or paired in system settings may be used.
        BluetoothDevice device = discovered.get(id);
        if (device == null) for (BluetoothDevice paired : adapter.getBondedDevices()) if (paired.getAddress().equals(id)) device = paired;
        if (device == null && id.equals(new JSONObject(preferences.getString("hardware", "{}")).optString("deviceId"))) device = adapter.getRemoteDevice(id);
        if (device == null) throw new Exception("ค้นหาและเลือกเครื่องพิมพ์อีกครั้ง");
        if (!(action.equals("probe") || action.equals("write"))) throw new Exception("คำสั่ง Bluetooth ไม่ถูกต้อง");
        byte[] bytes = action.equals("write") ? android.util.Base64.decode(input.getString("base64"), android.util.Base64.DEFAULT) : new byte[0];
        if (bytes.length > 2000000) throw new Exception("งานพิมพ์ใหญ่เกินกำหนด");
        Connection connection = new Connection();
        long startedAt = SystemClock.elapsedRealtime();
        BluetoothGatt gatt = device.connectGatt(context, false, connection, BluetoothDevice.TRANSPORT_LE);
        try {
            int status = connection.connected.get(15, TimeUnit.SECONDS);
            if (status != BluetoothGatt.GATT_SUCCESS) throw new Exception("เชื่อมต่อเครื่องพิมพ์ไม่สำเร็จ: " + status);
            if (!gatt.discoverServices() || connection.services.get(15, TimeUnit.SECONDS) != BluetoothGatt.GATT_SUCCESS)
                throw new Exception("อ่านบริการเครื่องพิมพ์ไม่สำเร็จ");
            BluetoothGattService service = gatt.getService(serviceId);
            BluetoothGattCharacteristic characteristic = service == null ? null : service.getCharacteristic(writeId);
            if (characteristic == null || (characteristic.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE) == 0)
                throw new Exception("เครื่องนี้ไม่รองรับโปรไฟล์ BLE JP80H (18F0/2AF1)");
            if (action.equals("probe")) return new JSONObject().put("connected", true);
            gatt.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH);
            int mtu = 23;
            if (bytes.length > 20 && gatt.requestMtu(185)) {
                try { mtu = connection.mtu.get(3, TimeUnit.SECONDS); }
                catch (TimeoutException ignored) { /* Legacy firmware: retain the safe 20-byte payload. */ }
            }
            long transferStartedAt = SystemClock.elapsedRealtime();
            long deadline = SystemClock.elapsedRealtime() + 240000;
            // Keep acknowledged, ordered writes; only increase the payload after successful negotiation.
            int packets = BlePackets.send(bytes, mtu, packet -> {
                if (Thread.currentThread().isInterrupted() || SystemClock.elapsedRealtime() > deadline) throw new Exception("หมดเวลาส่งข้อมูล ตรวจเครื่องก่อนพิมพ์ซ้ำ");
                connection.written = new CompletableFuture<>();
                characteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                characteristic.setValue(packet);
                if (!gatt.writeCharacteristic(characteristic) || connection.written.get(15, TimeUnit.SECONDS) != BluetoothGatt.GATT_SUCCESS)
                    throw new Exception("ส่งข้อมูลไม่ครบ อาจพิมพ์ได้บางส่วน ตรวจเครื่องก่อนพิมพ์ซ้ำ");
            });
            JSONObject result = new JSONObject().put("ok", true).put("bytes", bytes.length)
                .put("mtu", mtu).put("packetBytes", BlePackets.packetBytes(mtu)).put("packets", packets)
                .put("transferMs", SystemClock.elapsedRealtime() - transferStartedAt)
                .put("totalMs", SystemClock.elapsedRealtime() - startedAt);
            preferences.edit().putString("lastPrinterTransfer", result.toString()).apply();
            return result;
        } catch (TimeoutException error) {
            throw new Exception("Bluetooth หมดเวลา อาจพิมพ์ได้บางส่วน กรุณาตรวจเครื่องก่อนพิมพ์ซ้ำ");
        } finally { gatt.disconnect(); gatt.close(); }
    }
    private JSONObject list(BluetoothAdapter adapter) throws Exception {
        discovered.clear();
        for (BluetoothDevice device : adapter.getBondedDevices()) if (device.getType() != BluetoothDevice.DEVICE_TYPE_CLASSIC) discovered.put(device.getAddress(), device);
        BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) throw new Exception("เครื่องนี้ไม่รองรับการค้นหา Bluetooth LE");
        CompletableFuture<Integer> failed = new CompletableFuture<>();
        ScanCallback callback = new ScanCallback() {
            @Override public void onScanResult(int callbackType, ScanResult result) {
                try {
                    BluetoothDevice device = result.getDevice();
                    if (device.getName() != null) discovered.put(device.getAddress(), device);
                } catch (SecurityException error) { failed.complete(-1); }
            }
            @Override public void onScanFailed(int code) { failed.complete(code); }
        };
        scanner.startScan(callback);
        try {
            Thread.sleep(6000);
            if (failed.isDone()) throw new Exception("ค้นหา Bluetooth ไม่สำเร็จ: " + failed.get());
        } finally { scanner.stopScan(callback); }
        JSONArray devices = new JSONArray();
        for (BluetoothDevice device : discovered.values()) devices.put(new JSONObject().put("id", device.getAddress()).put("name", device.getName() == null ? device.getAddress() : device.getName()));
        return new JSONObject().put("devices", devices);
    }
    private static final class Connection extends BluetoothGattCallback {
        final CompletableFuture<Integer> connected = new CompletableFuture<>();
        final CompletableFuture<Integer> services = new CompletableFuture<>();
        final CompletableFuture<Integer> mtu = new CompletableFuture<>();
        volatile CompletableFuture<Integer> written = new CompletableFuture<>();
        @Override public void onConnectionStateChange(BluetoothGatt gatt, int status, int state) {
            if (state == BluetoothProfile.STATE_CONNECTED) connected.complete(status);
            else if (state == BluetoothProfile.STATE_DISCONNECTED) {
                connected.complete(-1); services.complete(-1); written.complete(-1); mtu.complete(23);
            }
        }
        @Override public void onServicesDiscovered(BluetoothGatt gatt, int status) { services.complete(status); }
        @Override public void onMtuChanged(BluetoothGatt gatt, int value, int status) { mtu.complete(status == BluetoothGatt.GATT_SUCCESS && value >= 23 ? value : 23); }
        @Override public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) { written.complete(status); }
    }
}
