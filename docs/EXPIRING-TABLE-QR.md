# QR สั่งอาหารรายรอบ — 11 พฤศจิกายน 2026

- ไม่มี QR ถาวรประจำโต๊ะแล้ว การเพิ่มหมายเลขโต๊ะไม่สร้าง QR
- รับชำระและเริ่มรอบใหม่ใน POS จะสร้าง token ใหม่ทุกครั้ง เมื่อตรวจและยืนยันโซนจะเริ่มนับอายุ QR
- ค่าเริ่มต้น 2 ชั่วโมง ตั้งได้ 1–168 ชั่วโมงในหน้าต่างเลือกโซนของ POS หรือบันทึกค่าเริ่มต้นรายโต๊ะในหน้าแอดมิน “โต๊ะและเมนูสั่งอาหาร”
- หลังยืนยันโซน POS แสดง QR และวันหมดอายุ กดพิมพ์ QR ได้ ถ้าเปิด “พิมพ์ QR สั่งอาหารหลังเปิดโต๊ะอัตโนมัติ” ไว้ จะพิมพ์ใบ QR แยกหลังยืนยันโซน
- ใบเสร็จที่พิมพ์อัตโนมัติก่อนเลือกโซนจะไม่มี QR หากต้องการพิมพ์ QR บนใบเสร็จซ้ำ ให้ติ๊กในหน้าต่างใบเสร็จหลังเปิดโซนแล้ว ระบบอ่าน URL และอายุของรอบปัจจุบันก่อนพิมพ์
- QR เดิมใช้ไม่ได้หลังปิดโต๊ะ เปลี่ยนรอบ หรือหมดเวลา ทั้งการโหลดเมนู ตรวจสถานะ ส่งออเดอร์ใหม่ และตรวจผลผ่าน key เดิม ไม่มีการต่ออายุหรือชุบชีวิต token ที่หมดอายุโดยแก้ค่าเริ่มต้น
- เมื่อ QR หมดอายุ รายการอาหารที่ส่งสำเร็จแล้วคงอยู่ให้ครัวดำเนินการต่อ ไม่มีการลบประวัติหรือบิลรับเงิน
- ยกเลิก GPS/geolocation ทั้งหน้าเว็บและ backend คำขอจาก client เก่าที่มี location จะถูกละทิ้ง ไม่ใช้ตรวจสิทธิ์ QR
- ระบบแคชเมนูและกันสแปมเดิมยังทำงาน โดยอ่านสิทธิ์และอายุ QR จากฐานข้อมูลทุกครั้งก่อนรับคำขอ

## นำขึ้นระบบ

ต้องอัปเดต backend, frontend และ POS 0.6.21 ร่วมกัน โดยทำ backend ก่อน:

เว็บไซต์ production สำหรับลูกค้าคือ `https://8sianracha.com` ตรวจ `.env` ของ backend ให้มีค่าดังนี้ก่อน restart:

```dotenv
FRONTEND_ORIGIN=https://8sianracha.com
POS_ORIGIN=https://api.8sianracha.com
NODE_ENV=production
```

QR ที่ออกใน production จะเป็น `https://8sianracha.com/order/<token-ของรอบโต๊ะ>` โดย backend ใช้ `FRONTEND_ORIGIN` สร้างลิงก์ ไม่ใส่ localhost ลงใน QR production

```bash
mkdir -p ~/backups && chmod 700 ~/backups &&
sudo -u postgres pg_dump -Fc sian_member > ~/backups/sian_member_$(date +%Y%m%d_%H%M%S).dump
```

ตรวจว่าการสำรองสำเร็จ แล้วอัปเดต (หาก `git status` พบไฟล์แก้ค้าง ให้ตรวจและเก็บงานก่อน pull):

```bash
cd ~/8-sian-member-backend
git status --short
git pull --ff-only origin main &&
pm2 stop 8sian-backend &&
npm ci && npm run generate && npm run migrate &&
pm2 restart 8sian-backend --update-env
curl --fail-with-body https://api.8sianracha.com/api/health
pm2 logs 8sian-backend --lines 50 --nostream
```

สำรองฐานข้อมูลตามขั้นตอนเดิมก่อนรัน Migration `202611110001_expiring_table_qr` จะยกเลิก QR ถาวรเดิมทั้งหมด โดยเก็บบิลและรอบที่ชำระแล้วไว้ แต่หยุดสั่งอาหารชั่วคราว พนักงานต้องเข้า “โต๊ะ / ออเดอร์อาหาร → เลือกโซน / เปิดโต๊ะ” เพื่อยืนยันโซนและออก QR ใหม่สำหรับโต๊ะที่ชำระแล้ว ไม่ต้องคิดเงินซ้ำ

จากนั้น deploy frontend ล่าสุดและติดตั้ง POS 0.6.21 ทับรุ่นเดิม QR ที่เคยแปะถาวรบนโต๊ะต้องเลิกใช้และเปลี่ยนเป็น QR รอบปัจจุบัน

สำหรับ Cloudflare Pages ให้ตรวจ production deployment ของ repository `8-sian-member-frontend` branch `main` หลัง push (build `npm ci && npm run build`, output `dist`) หากไม่ได้เปิด auto deploy ให้กด deploy commit ล่าสุด แล้วทดสอบผ่าน `https://8sianracha.com` บนมือถือว่าเปิด QR ใหม่ได้โดยไม่ขอ GPS และ QR ของโต๊ะที่ปิดแล้วเข้าไม่ได้

ค่าเริ่มต้นรายโต๊ะที่บันทึกในแอดมินใช้กับรอบถัดไปเท่านั้น ไม่เปลี่ยน deadline ของ QR ที่แจกไปแล้ว

Migration และ Prisma Client อัปเดตในเครื่องพัฒนาแล้ว ยังไม่ได้อัปเดต server จริง
