# อัปเดต POS 0.6.23 และ server

รุ่นนี้เพิ่มตัวนับเวลาบน POS เท่านั้น Backend เพิ่มข้อยืนยันใน test ว่าหมดเวลาแล้วไม่ปิดโต๊ะอัตโนมัติ ไม่มี runtime API หรือ migration ใหม่ หาก server ใช้ backend สำหรับ POS 0.6.22 อยู่แล้ว ติดตั้ง APK 0.6.23 ได้เลย

หากยังไม่แน่ใจว่า server ทันรุ่น 0.6.22 หรือไม่ ให้อัปเดต backend ตามขั้นตอนนี้ โดยใช้ path / ชื่อฐานข้อมูล / ชื่อ PM2 ของร้านจริง (ค่าด้านล่างใช้ deployment เดิมของร้าน)

## สำรองฐานข้อมูล

```bash
mkdir -p ~/backups && chmod 700 ~/backups &&
sudo -u postgres pg_dump -Fc sian_member > ~/backups/sian_member_$(date +%Y%m%d_%H%M%S).dump
```

ตรวจว่าสำรองสำเร็จก่อนทำต่อ

## ตรวจและดึง backend

```bash
cd ~/8-sian-member-backend
git status --short
```

หากมีไฟล์แก้ค้าง ให้ตรวจและเก็บงานก่อน pull ห้าม reset ทับ จากนั้น:

```bash
git pull --ff-only origin main
git log -1 --oneline
```

ตรวจ `.env` ให้ตรง production โดยเก็บ DATABASE_URL และค่า LINE เดิม:

```dotenv
FRONTEND_ORIGIN=https://8sianracha.com
POS_ORIGIN=https://api.8sianracha.com
NODE_ENV=production
```

## ติดตั้งและ restart

```bash
pm2 stop 8sian-backend &&
npm ci &&
npm run generate &&
npm run migrate &&
pm2 restart 8sian-backend --update-env
```

หากขั้นใดผิดพลาด ให้แก้ก่อนทำต่อ ห้ามใช้ migrate reset รุ่นนี้ไม่มี migration ใหม่ แต่หากยังไม่เคยอัปเดต 0.6.21 migration QR รายรอบที่ค้างจะยกเลิก QR ถาวรเดิม ต้องยืนยันโซนสำหรับโต๊ะที่ชำระแล้วเพื่อออก QR ใหม่ ไม่ต้องรับเงินซ้ำ

```bash
curl --fail-with-body https://api.8sianracha.com/api/health
pm2 logs 8sian-backend --lines 50 --nostream
```

Health ควรตอบ `{"status":"ok"}` และ log ไม่มีข้อผิดพลาดเกี่ยวกับฐานข้อมูล

## ติดตั้ง POS

ติดตั้ง `8-Sian-POS-Huawei-0.6.23.apk` ทับรุ่นเดิมบน Android/Huawei แล้วเข้าหน้าโต๊ะ / ออเดอร์อาหาร ตรวจเวลาเริ่มรอบ เวลาสิ้นสุด และเวลาคงเหลือ เมื่อหมดเวลาโต๊ะต้องเป็นสีเหลือง รอสั่งปิดจาก POS ออเดอร์ใหม่ถูกปฏิเสธ อาหารที่รับแล้วคงอยู่ และโต๊ะยังเลือกขายรอบใหม่ไม่ได้จนกว่าจะปิดเอง

ไม่ต้องนำ POS repository ขึ้น API server รุ่นนี้ไม่มี frontend เปลี่ยนเพิ่ม หากยังไม่ deploy frontend ของ 0.6.22 ให้ deploy branch main ของ `8-sian-member-frontend` ผ่าน Cloudflare Pages (build `npm ci && npm run build`, output `dist`)
