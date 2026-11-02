# อัปเดตระบบสั่งอาหารและหน้าพ่อครัว

โปรเจกต์นี้แยก Git 3 repository บน branch `main`: POS (`8-sian-member-pos`), backend (`8-sian-member-backend`), frontend (`8-sian-member-frontend`) การ push ยังไม่ใช่การ deploy backend บน Droplet

## 1. Backend บน Droplet

อัปเดตช่วงที่ไม่มีการรับเงิน/ส่งอาหาร สำรองฐานข้อมูลก่อน โดยอ้างอิงฐานจริงที่ตั้งไว้ใน `.env` คู่มือเดิมใช้ `sian_member`:

```bash
cd /home/deploy/8-sian-member-backend
git status --short
git rev-parse --short HEAD
mkdir -p ~/backups
chmod 700 ~/backups
umask 077
backup_file="$HOME/backups/sian_member-$(date -u +%Y%m%dT%H%M%SZ).dump"
sudo -u postgres pg_dump -Fc sian_member > "$backup_file"
test -s "$backup_file"
pg_restore --list "$backup_file"
```

หากมีโค้ดแก้ค้างหรือสำรองไม่สำเร็จ ให้หยุดตรวจสอบก่อน ไม่ใช้ reset/clean หรือ reset ฐานข้อมูล จากนั้น:

```bash
git pull --ff-only origin main
pm2 stop 8sian-backend
npm ci && npm run generate && npm run migrate && pm2 restart 8sian-backend --update-env
```

หากขั้นตอนใดผิดพลาดให้แก้ก่อน restart การอัปเดตรอบนี้มี migrations เพิ่มโต๊ะ/เมนู/ออเดอร์ รูปอาหาร การยกเลิกออเดอร์เมื่อปิดโต๊ะ และ role CHEF:

- `202611020001_table_ordering`
- `202611020002_ordering_images`
- `202611020003_cancel_closed_table_orders`
- `202611020004_chef_role`

ตรวจ `.env`: `FRONTEND_ORIGIN=https://8sianracha.com`, `POS_ORIGIN=https://api.8sianracha.com`, `NODE_ENV=production` ตามโดเมนจริงที่ใช้ ห้ามเปลี่ยนโดเมนหน้าลูกค้าหลังพิมพ์ QR โดยไม่มี redirect

Nginx เดิมจำกัด body 16k ต้องเพิ่ม location สำหรับรูปอาหารใน server block ของ API ตาม `backend/docs/DEPLOY-DROPLET.md` (หาก Certbot แยกบล็อก HTTPS ให้ใส่ในบล็อก HTTPS ที่รับคำขอจริง):

```nginx
location ~ ^/api/admin/ordering-menu/[a-f0-9-]+/image$ {
    client_max_body_size 2m;
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
pm2 status
curl --fail-with-body http://127.0.0.1:3001/api/health
curl --fail-with-body https://api.8sianracha.com/api/health
```

## 2. Frontend / Cloudflare Pages

หลัง backend พร้อม ให้ Cloudflare Pages deploy commit ล่าสุดจาก `8-sian-member-frontend` branch `main` หากตั้ง auto deploy ไว้ การ push จะเริ่ม build เอง ตรวจสถานะให้สำเร็จ:

- Build command: `npm ci && npm run build`
- Output directory: `dist`
- Root directory: เว้นว่าง
- `NODE_VERSION=22`
- `VITE_API_URL=https://api.8sianracha.com`

URL `/order/<token>` ต้องเปิดตรงและ refresh ได้ (SPA fallback) หาก frontend deploy ก่อน backend ให้รอ backend/migrations เสร็จก่อนทดสอบฟีเจอร์ใหม่

## 3. POS บน Windows

ปิดแอป POS เดิมให้เรียบร้อยโดยตรวจผลบิลค้างก่อน จาก PowerShell:

```powershell
cd C:\Project_Code\member-sian
git pull --ff-only origin main
npm.cmd --prefix pos ci
npm.cmd --prefix pos test
npm.cmd --prefix pos start
```

หากใช้โปรแกรมติดตั้ง ให้ build แล้วนำ installer ใน `pos/release` ไปอัปเดตเครื่องคิดเงินและเครื่องครัว:

```powershell
npm.cmd --prefix pos run build:win
```

ต้องปิดและเปิดโปรแกรมใหม่ เพราะมีคำสั่งอุปกรณ์ใน preload เพิ่มมา เก็บ `server.json` และการตั้งค่าเครื่องพิมพ์เดิมไว้ ไม่ต้องล้างข้อมูลแอป

## 4. Android / Huawei (ถ้าใช้งาน)

สำรอง `pos/local-data/android-signing` เป็นส่วนตัวและใช้กุญแจเดิม ตาม `pos/ANDROID-HUAWEI.md` เพิ่ม versionCode/versionName ให้สูงกว่ารุ่นที่ติดตั้งอยู่ก่อนเผยแพร่ APK ใหม่ ต้องมี JDK 17 และ Android SDK:

```powershell
npm.cmd --prefix pos run prepare:android
npm.cmd --prefix pos run check:android
npm.cmd --prefix pos run check:android-ble
npm.cmd --prefix pos run build:android
```

ติดตั้ง APK ใหม่จาก `pos/release` ทับแอปเดิมด้วย signing key เดิม ไม่ถอนแอปเพื่อกลบปัญหาลายเซ็น

## 5. ตรวจหลังอัปเดต

1. แอดมินเพิ่มโต๊ะและเมนูตามโซน/หมวดหมู่ อัปโหลดรูปให้สำเร็จ แล้วดาวน์โหลด QR จากโดเมนจริง
2. สร้าง/แก้บัญชีพนักงานเป็น **CHEF** และล็อกอินใน POS ต้องเข้าหน้าออเดอร์รอทำทันที
3. ทดสอบในฐานทดสอบก่อน: USER เลือกโต๊ะ รับชำระ และยืนยันสิทธิ์โซน ลูกค้าจึงสั่งได้ โดยจำกัดจำนวนเต็ม 1–10 ต่อรายการต่อครั้ง
4. ส่งหลายออเดอร์ ตรวจคิวเก่าไปใหม่ กดสำเร็จให้ออกจากคิว และตรวจยอดอาหารสำเร็จของโต๊ะ ต้องนับเฉพาะรายการ DONE และแสดงให้เลือกเฉพาะโต๊ะที่ยังมีลูกค้าอยู่
5. พิมพ์ใบอาหารกับเครื่องจริง ตรวจภาษาไทย เลขโต๊ะ จำนวน และตำแหน่งตัดกระดาษ การพิมพ์ไม่เปิดลิ้นชัก
6. ปิดโต๊ะจาก USER: รายการรอทำหาย ยอดฝั่งครัวรีเซ็ต หน้าลูกค้าส่งต่อไม่ได้ เปิดรอบใหม่ใช้ QR เดิมและเริ่มยอดจากศูนย์

การชำระเงินในฐานใช้งานจริงจะบันทึกยอดขายจริง การทดสอบ API/ภาพใบพิมพ์บนเครื่องพัฒนาไม่ใช่การยืนยันผลเครื่องพิมพ์/Bluetooth จริง
