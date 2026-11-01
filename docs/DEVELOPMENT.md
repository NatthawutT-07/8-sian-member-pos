# คู่มือกลับมาแก้ไขโปรเจกต์

โปรเจกต์นี้ยังแยก backend กับ frontend เพื่อ deploy และเก็บ Git คนละ repository ได้ ส่วน root มี workspace และเครื่องมือสำหรับพัฒนาทั้งสองส่วนพร้อมกัน โฟลเดอร์ pos เป็นงานขั้นถัดไปตามแผนเดิม

## แผนผังและจุดแก้ไข

- [Frontend: หน้าเว็บ ฟอร์ม สมาชิก และแอดมิน](../frontend/docs/STRUCTURE.md)
- [Backend: API การยืนยันตัวตน คูปอง และฐานข้อมูล](../backend/docs/STRUCTURE.md)
- [POS: แผนระบบคิดเงินและอุปกรณ์](../pos/README.md)

## คำสั่งจาก root

```powershell
# Terminal 1
npm.cmd run dev:backend
# Terminal 2
npm.cmd run dev:frontend

# ตรวจสอบ
npm.cmd run build
npm.cmd test
npm.cmd run check:barcode
npm.cmd run check:views
npm.cmd run test:integration

# จัดโค้ดให้อ่านง่าย และตรวจรูปแบบ
npm.cmd run format
npm.cmd run format:check
```

คำสั่งเดิม dev และ dev:api ยังใช้ได้ .env อยู่ที่ backend/.env กับ frontend/.env ตามเดิม ไม่สร้าง secret ไว้ใน root หรือ src

## ก่อนแก้ไข

เริ่มจากตารางจุดแก้ไขใน STRUCTURE.md ของฝั่งนั้น รักษาชื่อฟีเจอร์และ import ให้ตรงตำแหน่งจริง ไม่แก้ dist หรือ node_modules การแก้ source ไม่ต้องสร้าง migration ยกเว้นเปลี่ยน prisma/schema.prisma

Prettier และ .editorconfig กำหนดรูปแบบร่วมกัน: UTF-8, เยื้อง 2 ช่อง, single quotes และขึ้นบรรทัดโค้ดให้อ่านง่าย ไม่รัน formatter กับ .env, รูปภาพ, lockfiles หรือ migration เดิม

Integration tests ต้องเชื่อม PostgreSQL: check-auth สร้างและลบข้อมูลของตนเท่านั้น ส่วน check-admin ใช้ schema ทดสอบแยกและลบเมื่อจบ ห้ามใช้ reset ฐานข้อมูลเพียงเพื่อแก้ error จาก import หรือการย้ายไฟล์

check:views ตรวจ render หน้าสมาชิก หลังบ้าน และ components ตัวอย่าง 9 ส่วนแบบไม่เปิด browser และไม่ส่งคำขอ backend ใช้ตรวจ import, props และตัวแปรที่หลุดหลังแยกไฟล์ โดยไม่แทนที่การตรวจหน้าตาบนมือถือจริง
