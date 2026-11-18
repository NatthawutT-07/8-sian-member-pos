# อัปเดต backend, frontend และ POS วันที่ 18 พฤศจิกายน 2026

ชุดนี้เพิ่มชำระเงินสดร่วมกับเงินโอน, นับธนบัตร/เหรียญตอนเปิดกะ และปรับหน้าครัวสำหรับแท็บเล็ตพร้อมใบพิมพ์เฉพาะเลขโต๊ะ

## Backend ต้องอัปเดตก่อน POS

มี migration ใหม่ `202611180001_pos_mixed_payment` เพิ่ม `PosSale.transferSatang` และวิธีชำระ `MIXED` ไม่แก้ยอดบิลเก่า รองรับ POS เดิมที่ใช้เงินสดหรือโอนอย่างเดียวต่อได้ ใช้ชื่อฐานข้อมูล, path และชื่อ PM2 ของ server จริง (ด้านล่างอิง deployment เดิมของร้าน)

สำรองฐานข้อมูลและตรวจว่าไฟล์สำรองสร้างสำเร็จ:

```bash
mkdir -p ~/backups && chmod 700 ~/backups &&
sudo -u postgres pg_dump -Fc sian_member > ~/backups/sian_member_$(date +%Y%m%d_%H%M%S).dump
```

ตรวจงานค้างก่อนดึงโค้ด หากมีไฟล์แก้ค้าง ให้เก็บงานก่อน ห้าม reset ทับ:

```bash
cd ~/8-sian-member-backend
git status --short
git pull --ff-only origin main
git log -1 --oneline
```

ช่วงบำรุงรักษาให้หยุด API แล้วติดตั้งและ migrate ตามลำดับ คง `.env` เดิม ไม่ต้องเพิ่มตัวแปรใหม่:

```bash
pm2 stop 8sian-backend &&
npm ci &&
npm run generate &&
npm run migrate &&
pm2 restart 8sian-backend --update-env
```

ถ้าขั้นใดผิดพลาด ให้แก้ก่อนทำต่อ ห้ามใช้ `migrate reset` และห้ามรัน backend ใหม่ก่อน migration สำเร็จ ตรวจผล:

```bash
npx prisma migrate status
curl --fail-with-body http://127.0.0.1:3001/api/health
curl --fail-with-body https://api.8sianracha.com/api/health
pm2 logs 8sian-backend --lines 50 --nostream
pm2 status
pm2 save
```

Health ต้องตอบ `{"status":"ok"}` และ migration ต้องไม่มีรายการค้าง การ push Git ไม่ได้รันคำสั่งเหล่านี้บน server ให้อัตโนมัติ

## Frontend และแอป POS

Deploy `main` ของ `8-sian-member-frontend` ผ่าน Cloudflare Pages ตามเดิม (`npm ci && npm run build`, output `dist`) เพื่ออัปเดตหน้าครัว `/chef` และรายงานวิธีชำระแบบผสม

POS Windows/Android ใช้ UI ที่บรรจุในแอป ต้อง build และติดตั้งแอปใหม่จาก `main` ของ `8-sian-member-pos` การ push Git อย่างเดียวไม่อัปเดตแอปที่ติดตั้งอยู่

## ตรวจการใช้งานหลังอัปเดต

- เปิดกะ: ใส่จำนวนเงินแต่ละชนิด ตรวจยอดรวมเงินตั้งต้น
- ชำระผสม: บิล 1,000 บาท โอน 600 บาท รับเงินสด 500 บาท ต้องทอน 100 บาท ใบเสร็จแยกยอดโอน/รับเงินสด/เงินทอน
- ปิดกะ: บิลตัวอย่างเพิ่มเงินสดสุทธิ 400 บาทและเงินโอน 600 บาท เงินตั้งต้นไม่รวมเป็นรายได้
- ครัว: รายการอาหารยังแสดงบนจอ ใบพิมพ์ต้องมีเฉพาะเลขโต๊ะ ตรวจทั้งแนวตั้ง/แนวนอนบนแท็บเล็ตและกระดาษจริง
