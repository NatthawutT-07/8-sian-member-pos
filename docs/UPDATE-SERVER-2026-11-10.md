# อัปเดต server และแอป — 10 พฤศจิกายน 2026

ชุดนี้รวมลำดับรายการอาหารในหมวดหมู่ ลำดับสินค้า POS แถบหมวดหมู่ติดด้านบน การลดโหลดเมนูและป้องกันส่งออเดอร์ถี่ และ POS 0.6.18 หน้าต่างเลือกโซนใหม่

## 1. Backend บน Droplet

ใช้โฟลเดอร์ `~/8-sian-member-backend`, PM2 process `8sian-backend` และฐานข้อมูล `sian_member` ตามคู่มือ server เดิม หากเครื่องจริงใช้ชื่ออื่นให้แทนด้วยชื่อที่ใช้อยู่

ตรวจไฟล์ที่แก้ค้างก่อน ถ้ามีรายการขึ้นมา ให้ตรวจสอบและเก็บงานก่อน pull:

```bash
cd ~/8-sian-member-backend
git status --short
```

สำรองฐานข้อมูลก่อนอัปเดต และคงไฟล์ `.env` เดิมไว้:

```bash
mkdir -p ~/backups &&
chmod 700 ~/backups &&
sudo -u postgres pg_dump -Fc sian_member > ~/backups/sian_member_$(date +%Y%m%d_%H%M%S).dump
```

เมื่อ backup สำเร็จแล้ว ให้รันชุดนี้ (มีช่วงที่ API หยุดให้บริการระหว่างติดตั้ง):

```bash
git pull --ff-only origin main &&
pm2 stop 8sian-backend &&
npm ci &&
npm run generate &&
npm run migrate &&
pm2 restart 8sian-backend --update-env
```

คำสั่งเชื่อมด้วย `&&` เพื่อหยุดเมื่อมีขั้นตอนผิดพลาด ให้แก้ error ก่อนทำต่อ ไม่ใช้ `prisma migrate reset` และไม่เปลี่ยน DATABASE_URL หรือค่า LINE เดิม

Migration ใหม่ที่ควรเห็นว่ารันแล้ว:

- `202611100001_ordering_item_order`
- `202611100002_pos_product_order`
- `202611100003_ordering_throttle`

ถ้ายังไม่ได้อัปเดตรอบก่อน ระบบจะรัน `202611090001_ordering_category_order` ให้ด้วย

ตรวจผล:

```bash
pm2 status
pm2 logs 8sian-backend --lines 50 --nostream
curl --fail-with-body http://127.0.0.1:3001/api/health
curl --fail-with-body https://api.8sianracha.com/api/health
```

Health ต้องตอบ `{"status":"ok"}` เมื่อเรียบร้อยแล้วจึงบันทึก PM2:

```bash
pm2 save
```

## 2. Frontend บน Cloudflare Pages

หลัง backend พร้อม ให้ตรวจ deployment ล่าสุดของ repository `8-sian-member-frontend`, branch `main` หากเปิด auto deploy การ push จะเริ่ม build เอง ถ้าปิดไว้ให้ deploy/retry commit ล่าสุด

- Root directory: repository root (เว้นว่าง)
- Build command: `npm ci && npm run build`
- Output directory: `dist`
- `NODE_VERSION=22`
- `VITE_API_URL=https://api.8sianracha.com`
- คง `VITE_ADMIN_PATH` และค่าอื่นเดิม

ถ้า frontend deploy อัตโนมัติก่อนอัปเดต backend ให้ทำขั้น backend ให้ครบก่อนทดสอบหน้าเว็บ รุ่นใหม่นี้ใช้ endpoint ตรวจสถานะเมนูและ migration ใหม่

## 3. POS ที่เครื่องร้าน

ปิดแอปแล้วติดตั้งทับด้วยไฟล์ที่สร้างไว้ใน workspace:

- Huawei / Android: `pos/release/8-Sian-POS-Huawei-0.6.18.apk`
- Windows: `pos/release/8 Sian POS Setup 0.6.18.exe`

ไฟล์ติดตั้งไม่ได้เก็บใน Git หลังติดตั้งแล้วเปิดแอปใหม่เพื่อโหลดสินค้าและลำดับล่าสุด การเปลี่ยนลำดับสินค้าในครั้งต่อไปใช้การโหลดรายการใหม่ ไม่ต้องติดตั้งแอปทุกครั้ง

## 4. ตรวจการใช้งาน

- แอดมินตั้งลำดับอาหารภายในหมวดหมู่และลำดับสินค้าภายในกลุ่มได้
- POS แสดงสินค้าตามลำดับ และหน้าต่างเลือกโซนแสดงจำนวนโซนที่เลือก
- หน้า QR โต๊ะเรียงอาหารโดยไม่มีเลขลำดับ แถบหมวดหมู่ติดด้านบนขณะเลื่อน
- เมนูโหลดครั้งแรก แล้วใช้ endpoint `/api/ordering/:token/status` ตรวจทุก 60–70 วินาทีขณะเปิดดูหน้าเว็บ แทนโหลดเมนูเต็มทุก 10 วินาที
- ส่งออเดอร์แล้วตรวจว่าครัวได้รับเพียงครั้งเดียว เมื่อส่งถี่จะมีเวลารอและยังใช้รหัสออเดอร์เดิม

ผลตรวจล่าสุด: backend tests 94 รายการ, frontend menu-client tests 3 รายการ, production build/check:views, POS tests 15 รายการ และการทดสอบ 100 คำขอพร้อมกันกับ PostgreSQL ในเครื่องผ่านแล้ว รายละเอียดอยู่ใน [ORDERING-CAPACITY.md](ORDERING-CAPACITY.md)

การทดสอบในเครื่องไม่ได้อัปเดต Droplet จริง คู่มือนี้เป็นขั้นตอนสำหรับนำโค้ดที่ push แล้วขึ้น server
