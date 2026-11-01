# เปิดใช้ LINE Login สำหรับ 8 เซียน

## ค่าใน LINE Developers ที่ตั้งไว้แล้ว

- Provider: `8sianracha` (`2005679414`)
- LINE Login: `8sianracha Member` — Channel ID `2012229080`
- Messaging API: Channel ID `2012228427` — ห้ามใช้ secret ของ channel นี้สำหรับล็อกอิน
- Linked LINE Official Account: `@467rhsjz`
- App types: Web app; ประเทศ Thailand
- Callback URL: `https://api.8sianracha.com/api/auth/line/callback`
- สถานะเริ่มต้น: Developing สำหรับทดสอบ

## พฤติกรรมล่าสุด: LINE เป็นบัญชีหลัก

`/register` และ `/login` แสดงหน้า LINE Login เดียวกัน ไม่มีแบบฟอร์มสมัครใหม่ เมื่อยืนยัน LINE สำเร็จ backend สร้างสมาชิกให้อัตโนมัติด้วย LINE user ID และชื่อ LINE แล้วส่งไป `/coupons` ชื่อ LINE อัปเดตเมื่อเข้าสู่ระบบครั้งถัดไป ไม่บังคับเบอร์โทร รหัสผ่าน หรือวันเกิด และไม่สมัครรับข่าวสารอัตโนมัติ

ลิงก์สำหรับ Rich Menu ของ OA: `https://8sianracha.com/login` การกดลิงก์ยังต้องผ่าน LINE Login เพื่อยืนยันตัวตน

ผู้ที่มีคูปองในบัญชีเบอร์โทรเดิมต้องเลือก “เชื่อมสมาชิกเดิม” ก่อนเข้าใช้ LINE ครั้งแรก ทางเลือกนี้จึงจะแสดงช่องยืนยันเบอร์และรหัสผ่าน หากสร้างบัญชี LINE แยกไปแล้ว ให้ติดต่อร้าน ไม่มีการรวมบัญชีหรือย้ายคูปองโดยอัตโนมัติ

## 1. Deploy backend และ migration

สำรองฐานข้อมูลก่อน deploy ใช้ migration ใหม่ `202610270001_line_login` ซึ่งเพิ่ม `Member.lineUserId`, อนุญาตให้เบอร์โทรว่าง และเพิ่มตาราง flow ชั่วคราว ตามด้วย `202610270002_line_auto_member` เพื่อเพิ่มชื่อ LINE และแยก flow เชื่อมบัญชีเก่า ทั้งสอง migration ไม่ลบสมาชิก/คูปองและไม่แก้ migration เก่า

DigitalOcean App Platform → แอป backend → Settings → backend component → Environment Variables:

```dotenv
NODE_ENV=production
PORT=3001
FRONTEND_ORIGIN=https://8sianracha.com
LINE_LOGIN_CHANNEL_ID=2012229080
LINE_LOGIN_CHANNEL_SECRET=<ค่าจาก Basic settings ของ LINE Login 2012229080>
LINE_LOGIN_CALLBACK_URL=https://api.8sianracha.com/api/auth/line/callback
```

เก็บ `LINE_LOGIN_CHANNEL_SECRET` เป็น encrypted/secret runtime variable คง `DATABASE_URL` เดิมไว้ ไม่ใส่ secret ใน Git, frontend, VITE_* หรือข้อความแชต ตัวแปร LINE ต้องครบทั้งสาม หากไม่ใส่ทั้งสาม ระบบแจ้งว่า LINE Login ยังไม่พร้อม โดยไม่แสดงแบบฟอร์มสมัครเดิม หากใส่เพียงบางตัว backend จะหยุดเริ่มทำงานพร้อมข้อความแจ้งชื่อค่าที่ขาด

Build command: `npm ci && npm run generate -w backend`

Run command: `npm run migrate -w backend && npm run start -w backend`

HTTP port: `3001`; Health check path: `/api/health`

Migration นี้ให้ทำผ่าน deploy ของ backend ที่ใช้ฐานข้อมูลเป้าหมาย ไม่ควรใช้ `prisma migrate reset` หรือ `db push --accept-data-loss`

ตรวจ `https://api.8sianracha.com/api/health` ได้ `{"status":"ok"}` และ `/api/auth/line/status` ได้ `{"enabled":true}`

## 2. Deploy frontend

Cloudflare Pages → โปรเจกต์ → Settings → Variables and Secrets → Production:

```dotenv
VITE_API_URL=https://api.8sianracha.com
```

คง `VITE_ADMIN_PATH` เดิมไว้ Build command: `npm ci && npm run build`; output: `frontend/dist`; source directory: repository root

ค่า VITE ถูกฝังในไฟล์ build ต้อง deploy ใหม่หลังแก้ค่า ใช้โดเมนหลัก `https://8sianracha.com` และ redirect www มาที่โดเมนหลัก อย่า cache `/api/auth/*`, `/api/members/*` หรือ `/api/admin/*` ที่ CDN

เปิดหน้า `/privacy` ให้เข้าถึงได้ แล้วตั้ง LINE Login → Basic settings → Privacy policy URL เป็น `https://8sianracha.com/privacy` หลังตรวจว่า deploy แล้ว ไม่ควรบันทึก URL ก่อนหน้านี้มีเนื้อหาจริง

## 3. ทดสอบ Developing

ใช้บัญชีที่มี role ใน LINE Login channel:

1. เปิด `/login` แล้วกดเข้าสู่ระบบด้วย LINE (เป็นการเปลี่ยนหน้าเต็มไป backend ไม่ใช้ fetch OAuth)
2. ยกเลิก LINE ต้องกลับหน้า login พร้อมข้อความที่ลองใหม่ได้
3. สมาชิกใหม่: หลัง LINE ยืนยันตัวตน ต้องเข้าหน้าคูปองทันที ใช้ชื่อ LINE ไม่มีหน้ากรอกข้อมูล และสร้างสมาชิกเพียงครั้งเดียว
4. สมาชิกเดิม: เริ่มจากลิงก์เชื่อมสมาชิกเดิมในหน้า login ก่อนเข้าใช้ LINE ครั้งแรก แล้วจึงยืนยันเบอร์และรหัสผ่านเดิม ตรวจว่าเลขสมาชิกและคูปองเดิมยังอยู่
5. ถ้าจำรหัสผ่านไม่ได้ ให้ร้านตรวจตัวตนก่อนใช้ระบบตั้งรหัสผ่านเดิม ห้ามสร้างบัญชีซ้ำแทนการกู้บัญชี
6. ออกจากระบบ แล้วกด LINE อีกครั้ง ต้องเข้าบัญชีเดิม ไม่สมัครซ้ำ
7. รีเฟรช `/coupons` ต้องยังล็อกอินอยู่ ทดสอบ Chrome/Safari และเบราว์เซอร์ใน LINE
8. ตรวจหน้าแอดมินว่าค้นหา/แจกคูปองให้สมาชิก LINE ที่ไม่มีเบอร์ได้

เมื่อทดสอบผ่านแล้ว เปลี่ยน Developing เป็น Published ใน LINE Login channel และทดสอบด้วยบัญชีลูกค้าที่ไม่มี role อีกครั้ง

## การทำงานและการป้องกัน

- Authorization code flow + PKCE S256 + state ที่ผูกกับคุกกี้เบราว์เซอร์ + nonce
- Backend ส่ง ID token ไปตรวจผ่าน LINE และตรวจ issuer/audience/nonce/expiry/subject ซ้ำ
- ไม่เชื่อ LINE user ID จาก frontend ไม่ใช้ชื่อหรือเบอร์ที่กรอกเพื่อผูกบัญชีโดยไม่ยืนยันรหัสผ่าน
- Flow เก็บใน PostgreSQL รองรับ API หลาย instance มีอายุ 10 นาทีและถูกใช้ได้ครั้งเดียว คุกกี้ flow เป็น HttpOnly, Secure ใน production, SameSite=Lax
- สมาชิกใช้ session cookie เดิม ไม่ส่ง token ผ่าน URL หรือ localStorage
- การผูกบัญชีและ consume flow ทำใน transaction; unique constraint กัน LINE เดียวผูกหลายสมาชิก
- ไม่เก็บ access token, refresh token หรือ ID token ของ LINE ไว้ในฐานข้อมูล
- POST ต้องมาจาก frontend origin ที่กำหนด และมี rate limit
- แถว flow หมดอายุจะถูกล้างเมื่อมีการเริ่ม/สร้าง flow ถ้าไม่มี traffic อาจยังมีแถวหมดอายุในฐานข้อมูลแต่ใช้งานไม่ได้

## แก้ปัญหา

- `enabled:false`: ยังไม่ได้ตั้งตัวแปร LINE ทั้งสามใน backend runtime หรือยังไม่ได้ redeploy
- Invalid redirect URI: callback ใน LINE Developers ต้องตรงกับ `LINE_LOGIN_CALLBACK_URL` รวม scheme/path
- บัญชีทั่วไปเข้าไม่ได้: ตรวจสถานะ Published; Developing ใช้ทดสอบเฉพาะบัญชีที่ได้รับสิทธิ์
- `line_error=expired`: flow เกิน 10 นาที, เปิดล็อกอินหลายแท็บ, callback ซ้ำ หรือคุกกี้ถูกบล็อก ให้เริ่มใหม่จาก `/login`
- `line_error=failed`: ตรวจ Channel ID/secret ว่าเป็นของ LINE Login ไม่ใช่ Messaging API และ backend ติดต่อ `api.line.me` ได้ ไม่บันทึก secrets/codes/tokens ลง log
- หน้าคูปองเด้งกลับ login: ตรวจ HTTPS ทั้งสองโดเมน, frontend origin, fetch credentials, reverse proxy และ cookie ไม่เพิ่ม Domain ให้ cookie ที่ชื่อขึ้นต้น `__Host-`

เอกสารอ้างอิง: https://developers.line.biz/en/docs/line-login/integrate-line-login/ และ https://developers.line.biz/en/reference/line-login/#verify-id-token
