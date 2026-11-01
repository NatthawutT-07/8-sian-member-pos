# 8 เซียน — Member Club

เริ่มแก้ไขโค้ดได้จาก [คู่มือผู้พัฒนาและโครงสร้างโปรเจกต์](docs/DEVELOPMENT.md) พร้อมตารางระบุว่าแต่ละงานต้องแก้ไฟล์ไหน

เว็บสมัครและเข้าสู่ระบบสมาชิกด้วย LINE พร้อมรองรับบัญชีเบอร์โทรและรหัสผ่านเดิม React + Vite / Node.js Express / PostgreSQL + Prisma ไม่ใช้ SMS ดูขั้นตอนตั้งค่าและ deploy ที่ [คู่มือ LINE Login](docs/LINE-LOGIN.md)

## เริ่มใช้งาน

ต้องมี Node.js 22 ขึ้นไป และ PostgreSQL

```powershell
# จาก repository root
npm.cmd install
# คัดลอกเฉพาะเมื่อยังไม่มี .env อย่าเขียนทับค่าที่ตั้งไว้แล้ว
Copy-Item frontend/.env.example frontend/.env
Copy-Item backend/.env.example backend/.env
```

สร้างฐานข้อมูลและตั้ง DATABASE_URL ใน backend/.env จากนั้น:

```powershell
npm.cmd run generate -w backend
npm.cmd run migrate -w backend
npm.cmd run dev:api
# อีก terminal
npm.cmd run dev
```

เปิด http://localhost:5173 ตรวจฐานข้อมูลที่ http://localhost:3001/api/health

หากอยู่ในโฟลเดอร์ backend หรือ frontend แล้ว ใช้ `npm.cmd run dev` ได้เลย หาก generate พบ EPERM บน Windows ให้หยุด backend ด้วย Ctrl+C ก่อน generate ใหม่

## สมัครและเข้าสู่ระบบ

- ขั้นตอน 1: เบอร์มือถือไทย 10 หลัก ชื่อ นามสกุล และวันเดือนปีเกิด
- ขั้นตอน 2: ตั้งรหัสผ่านอย่างน้อย 8 ตัว ยืนยันรหัสผ่าน และยอมรับนโยบาย
- ย้อนกลับไปแก้ข้อมูลขั้นตอนแรกได้โดยข้อมูลยังอยู่
- เข้าสู่ระบบด้วยเบอร์โทรและรหัสผ่าน เปิดบัตรสมาชิกเดิม และออกจากระบบได้
- หนึ่งเบอร์สมัครได้หนึ่งบัญชี เบอร์โทรใช้เป็นชื่อบัญชี ยังไม่ได้พิสูจน์ว่าเป็นเจ้าของเบอร์
- เก็บรหัสผ่านเป็น scrypt hash พร้อม salt ไม่เก็บ plaintext
- Session อายุ 7 วัน เก็บ token ใน HttpOnly cookie และเก็บเฉพาะ hash ในฐานข้อมูล
- ตรวจ origin ของคำขอแก้ไขข้อมูล และจำกัดความถี่สมัคร/เข้าสู่ระบบ

## ลืมรหัสผ่าน

ปัจจุบันหน้า login แนะนำให้ติดต่อร้าน แอดมินสามารถตั้งรหัสผ่านใหม่จากหลังบ้านหลังตรวจสอบตัวตน พร้อมยืนยันรหัสผ่านแอดมิน ระบุเหตุผล และยกเลิก session สมาชิกเดิม

## หลังบ้านแอดมิน

เปิด http://localhost:5173/control-8sian-4d9c7a2e7f มีแอดมิน 1 บัญชี ไม่มีรหัสผ่านเริ่มต้น สร้างครั้งแรกด้วย:

```powershell
cd backend
node --env-file=.env scripts/create-admin.mjs
```

ค้นหาสมาชิก ดูข้อมูลและประวัติคูปอง สร้างแคมเปญ แจกคูปองทีละสมาชิก และช่วยตั้งรหัสผ่านได้ สมาชิกกดรับแคมเปญที่เปิดแจกจากหน้าหลักหลัง login ได้ โดยรับครั้งเดียวต่อแคมเปญร่วมกับสิทธิ์ที่แอดมินแจกให้ ไม่มีการแจกอัตโนมัติ URL เปลี่ยนได้ด้วย VITE_ADMIN_PATH แต่การตรวจสิทธิ์จริงทำที่ API ดูรายละเอียด [backend](backend/README.md) และ [frontend](frontend/README.md)

เจ้าหน้าที่ต้องตรวจสอบตัวตนตามกระบวนการของร้านก่อนช่วยกู้บัญชี ห้ามรีเซ็ตจากเพียงชื่อ เบอร์ หรือวันเกิด เพราะคนอื่นอาจทราบข้อมูลเหล่านี้ การตั้งรหัสผ่านผ่านหลังบ้านจะเพิกถอน session เดิมและเก็บเหตุผลไว้ตรวจย้อนหลัง

หากต้องการให้ผู้ใช้กู้บัญชีเอง แนะนำเพิ่มอีเมลสำรองที่ยืนยันแล้วเพื่อส่งลิงก์รีเซ็ต หรือแจก recovery code ตอนสมัครให้ผู้ใช้เก็บไว้ ทั้งสองวิธียังไม่ได้เพิ่มในรุ่นนี้

อ้างอิง: [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

## การย้ายฐานข้อมูล

เก็บ migration เดิมไว้เพื่อให้ฐานข้อมูลที่เคยใช้งานแล้วอัปเกรดได้ ไม่แก้ประวัติ migration และไม่ใช้ database reset

- 202610250002_phone_auth เก็บข้อมูลสมาชิกและเลขเดิมไว้ ลบคอลัมน์ LINE เพิ่ม password hash และ session หากมีเบอร์ซ้ำจะหยุดให้แก้ข้อมูลก่อน
- 202610250003_birthday_no_sms เพิ่มวันเกิดและนำโครงสร้าง SMS ออก สมาชิกเดิมเว้นวันเกิดว่างได้ แต่สมาชิกใหม่ต้องกรอก
- 202610250004_member_coupons เพิ่มคูปองสมาชิก
- 202610250005_single_admin เพิ่มแคมเปญ แอดมินหนึ่งคน session แอดมิน และ audit log พร้อมรักษาประวัติคูปองเดิมไว้

บัญชีจากรุ่น LINE ยังไม่มีรหัสผ่าน ต้องตรวจสอบตัวตนกับร้านก่อนตั้งรหัสผ่าน ไม่สามารถรับบัญชีเดิมเพียงกรอกเบอร์โทรได้

## Cloudflare Pages — frontend

- Root directory: repository root
- Build command: `npm ci && npm run build`
- Build output: frontend/dist
- Environment: `VITE_API_URL=https://<backend-domain>`

ค่า VITE ถูกฝังตอน build ต้อง rebuild หลังเปลี่ยนค่า ห้ามใส่ secrets ใน frontend

## DigitalOcean App Platform — backend

ใช้ repository root เป็น source directory และ Node.js buildpack, HTTP port 3001, health check /api/health

- Build command: `npm ci && npm run generate -w backend`
- Run command: `npm run migrate -w backend && npm run start -w backend`
- Node.js 22 ขึ้นไป

Runtime environment:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:25060/DB?sslmode=require
FRONTEND_ORIGIN=https://<frontend-domain>
PORT=3001
NODE_ENV=production
```

ตั้ง DATABASE_URL เป็น secret อนุญาตฐานข้อมูลเฉพาะ App และเปิด backup ใช้ FRONTEND_ORIGIN ตรงกับ URL frontend โดยไม่มี slash ท้าย

Production cookie เป็น Secure, HttpOnly, SameSite=None ต้องใช้ HTTPS ทั้งสองฝั่ง แนะนำใช้โดเมนร่วมกัน เช่น member.example.com บน Cloudflare และ api.example.com บน DigitalOcean เพื่อให้เป็น same-site บาง browser บล็อก third-party cookies หากใช้ pages.dev คู่กับ ondigitalocean.app ทำให้ login ไม่คงอยู่

## API

- GET /api/health ตรวจฐานข้อมูล
- POST /api/auth/register สมัคร: firstName, lastName, phone, birthDate (YYYY-MM-DD), password, privacyConsent, marketingConsent
- POST /api/auth/login เข้าสู่ระบบ: phone, password
- POST /api/auth/logout ออกจากระบบ
- GET /api/members/me อ่านสมาชิกปัจจุบันด้วย session cookie

POST ต้องส่ง Origin ตรงกับ FRONTEND_ORIGIN และ frontend fetch ต้องใช้ credentials: include

## ขั้นแรกของการเชื่อม POS

ปุ่มใช้คูปองเปลี่ยนเป็นเปิดบาร์โค้ด CODE128-C ให้สแกน รหัสมีอายุ 10 นาที คูปองยังไม่ถูกใช้จนกว่า POS จะยืนยันชำระบิลสำเร็จ รุ่นนี้มีเฉพาะการสร้างรหัสและตรวจสถานะ ยังไม่มีระบบคิดเงิน รับสแกน ชำระเงิน หรือไฟล์ .exe แผนขั้นต่อไปอยู่ใน [pos/README.md](pos/README.md)

## ตรวจสอบโค้ด

```powershell
npm.cmd run build
npm.cmd test
npm.cmd exec -w backend -- prisma validate
```

## ก่อนเปิดใช้งานจริง

โลโก้ใช้ตราตัวอักษรชั่วคราว ยังไม่ได้ใช้ภาพต้นฉบับ เปลี่ยน .brand-icon เป็นไฟล์ใน frontend/public ได้ ตรวจชื่อแบรนด์ สิทธิพิเศษ และรายละเอียดนโยบายข้อมูลกับร้าน เพิ่มรายละเอียดผู้ควบคุมข้อมูล ช่องทางติดต่อ และระยะเก็บข้อมูล รุ่นนี้ไม่มีระบบสะสมแต้ม/คูปอง และยังไม่ได้ deploy ไปบัญชีโฮสต์จริง
