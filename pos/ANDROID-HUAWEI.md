# POS สำหรับ Huawei MatePad / Android — 0.6.3

เป้าหมาย: Huawei MatePad 11.5S รุ่น SLG-W09, HarmonyOS 4.3.0 ที่รองรับ Android APK ไม่ใช่ HarmonyOS NEXT แอปไม่ใช้ Google Play Services รองรับ Android API 26 ขึ้นไป ต้องตรวจบนแท็บเล็ตจริงก่อนใช้งานหน้าร้าน

## ติดตั้งบน MatePad

1. คัดลอก `pos/release/8-Sian-POS-Huawei-0.6.3.apk` ไปแท็บเล็ตผ่าน USB, Huawei Share หรือช่องทางส่วนตัว ติดตั้งทับรุ่นเดิมได้ด้วย signing key เดิม ไม่ต้องถอนการติดตั้ง
2. เปิดไฟล์จาก Files หากระบบถาม ให้อนุญาตติดตั้งแอปจาก Files สำหรับไฟล์นี้
3. เปิด **8 เซียน POS** แล้วเข้าสู่ระบบด้วยบัญชีพนักงาน USER สำหรับคิดเงิน หรือ CHEF สำหรับหน้าครัว จากหน้าแอดมิน ไม่ใช้บัญชีแอดมินเข้าสู่ POS
4. แอปเชื่อม `https://api.8sianracha.com` โดยตรง ไม่ต้องตั้ง server.json และไม่ต้องอัปโหลดหน้า POS ขึ้น server
5. ทดสอบโหลดสินค้า เปิดกะ ผูกสมาชิก รับเงิน ปิดกะ และตรวจยอดที่หน้าแอดมิน

ต้องใช้อินเทอร์เน็ต Session พนักงานอยู่ในหน่วยความจำ native ของแอป ไม่บันทึกลงไฟล์ ปิดแอปแล้วเปิดใหม่อาจต้องเข้าสู่ระบบใหม่ อย่าล้างข้อมูลแอปขณะมีบิลที่ยังตรวจผลไม่เสร็จ

## เครื่องพิมพ์และลิ้นชัก

เปิด Bluetooth ที่แท็บเล็ตและเครื่องพิมพ์ จากเมนู **อุปกรณ์** ใน POS:

1. กดค้นหา อนุญาต **อุปกรณ์ใกล้เคียง/Bluetooth** หากระบบขอ รุ่น Android เก่าต้องอนุญาตตำแหน่งเพื่อค้นหา BLE (แอปไม่ใช้พิกัด)
2. เลือก JP80H แล้วเชื่อมต่อ รองรับ BLE service `18F0` / write characteristic `2AF1` แบบตอบรับ ตรงกับโปรไฟล์ที่ใช้บน Windows รุ่นนี้ไม่รองรับ Bluetooth Classic SPP, USB หรือเครื่องพิมพ์อื่นโดยอัตโนมัติ
3. พิมพ์ทดสอบ ตรวจภาษาไทย โลโก้ บาร์โค้ด และขอบกระดาษ 78–80 มม.
4. ทดสอบเปิดลิ้นชักพร้อมเหตุผล แล้วค่อยเปิดตัวเลือกเปิดลิ้นชักอัตโนมัติเมื่อรับเงินสด
5. ทดสอบบิลเงินสด เงินโอน และพิมพ์ซ้ำ พิมพ์ซ้ำต้องไม่เปิดลิ้นชักหรือรับเงินซ้ำ

ใช้ตรรกะ hardware claim/audit และรูปแบบ ESC/POS ร่วมกับ Windows มี Android BLE transport และ Android WebView raster renderer เพิ่มมา การ build ผ่านไม่ใช่หลักฐานว่า Bluetooth/กระดาษ/ลิ้นชักผ่านบนอุปกรณ์จริง หากส่งขาดกลางทางให้ตรวจเครื่องก่อนพิมพ์ซ้ำ ไม่มีการ retry อุปกรณ์อัตโนมัติ

## Backend

ใช้ backend API รุ่น `ff5d5d5` หรือใหม่กว่า พร้อม migrations POS เดิม ไม่ต้องเพิ่มตารางหรือ API สำหรับ Android และไม่ต้อง deploy frontend สำหรับแอป Android ตั้ง `.env` บน server:

```dotenv
FRONTEND_ORIGIN=https://8sianracha.com
POS_ORIGIN=https://api.8sianracha.com
NODE_ENV=production
```

แอปส่ง API ผ่าน native HTTPS พร้อม Origin ของ backend และ cookie พนักงาน ไม่ต้องอนุญาต `null`, `file://`, origin ของ asset WebView หรือ `*` ไม่เปิดพอร์ตเพิ่ม ใช้ API HTTPS เดิม

## Build APK บน Windows

ต้องมี Node.js, JDK 17, Android SDK (platform 35 และ build-tools) และตั้ง `JAVA_HOME`, `ANDROID_HOME` ถ้ามีชุดเครื่องมือใน workspace `.tmp/android-tools` สคริปต์จะใช้ชุดนั้นได้เอง

```powershell
npm.cmd --prefix pos ci
npm.cmd --prefix pos run prepare:android
npm.cmd --prefix pos run check:android
npm.cmd --prefix pos run check:android-ble
npm.cmd --prefix pos test
npm.cmd --prefix pos run build:android
```

Gradle wrapper ดาวน์โหลด Gradle ที่กำหนดไว้ครั้งแรก หน้า UI และตรรกะอุปกรณ์ถูก bundle ลง APK ไม่ต้องใช้ Google Play Services

ตัวติดตั้ง release ลงนามด้วยกุญแจที่สร้างครั้งแรกใน `pos/local-data/android-signing/` โฟลเดอร์นี้ไม่เข้า Git **สำรองทั้งโฟลเดอร์ไว้เป็นส่วนตัว** (มี private key และ credentials) การอัปเดตแอปเดิมต้องใช้กุญแจเดิม ห้ามสร้างใหม่เพื่อทับแอปที่ติดตั้งแล้ว เมื่อออกเวอร์ชันใหม่ให้เพิ่ม versionCode/versionName ใน `android/app/build.gradle` และชื่อผลลัพธ์ในสคริปต์ build

## การตรวจสอบ

- Compile Java/Android APK และตรวจ signature / ไฟล์ที่บรรจุ
- ทดสอบ JS bridge ที่ bundle จริงร่วมกับตรรกะ audit/claim/พิมพ์/ลิ้นชักผ่าน native fixture
- POS unit tests ชุดเดิม
- ยังต้องตรวจการติดตั้ง WebView ภาษาไทย Bluetooth และอุปกรณ์จริงบน SLG-W09; ไม่มีแท็บเล็ตเชื่อมกับเครื่องพัฒนาระหว่างทำงานนี้

อ้างอิง: [Huawei: APK / HarmonyOS 4.3](https://consumer.huawei.com/ph/support/content/en-us00448892/), [Android Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions)

## แก้พิมพ์ช้าใน 0.5.1

0.5.0 ส่งภาพใบเสร็จครั้งละ 20 ไบต์และรอ ACK ทุกแพ็กเกจ รุ่น 0.5.1 ขอ MTU 185 และใช้ payload ตามผลเจรจา (MTU ลบ 3, สูงสุด 180 ไบต์ตามโปรไฟล์ Windows เดิม) ถ้าเจรจาไม่ได้จะใช้ 20 ไบต์ตามเดิม และขอ connection priority สูงระหว่างงานพิมพ์ ยังรอ ACK ทุกแพ็กเกจ ไม่ใช้ write-without-response และไม่ retry งานที่ส่งไปแล้ว

ตัวอย่างข้อมูล 72,000 ไบต์ลดจาก 3,600 เป็น 400 แพ็กเกจเมื่อ MTU รองรับ 185 เป็นจำนวนครั้งส่ง ไม่ใช่การรับประกันว่าระยะเวลาพิมพ์จริงเร็วขึ้น 9 เท่า ยังคงต้องวัดกับแท็บเล็ตและเครื่องพิมพ์จริง

ปุ่มพิมพ์ทดสอบแสดงเวลาตั้งแต่เชื่อม Bluetooth จนส่งข้อมูลจบ Native บันทึก `mtu`, `packetBytes`, `packets`, `bytes`, `transferMs`, `totalMs` ของงานล่าสุดใน private preferences เพื่อวิเคราะห์ได้ เวลาเหล่านี้ไม่ใช่เวลาที่กระดาษออกครบและไม่รวมการเรียก API/สร้างภาพก่อนส่ง
