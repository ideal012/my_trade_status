# Task List: My Trade Status

แผนภาพรวมและเหตุผลการออกแบบ: `tasks/plan.md`

คำสั่งที่ใช้ทุก task:
- Test: `npm test` (= `node --test`)
- Run: `npm start` แล้วเปิด http://localhost:3000
- ไม่มี build step

---

## Phase 1: Foundation — บันทึกเทรดได้

### - [x] Task 1: Server + DB + หน้าเว็บโครงหลัก

**Description:** สร้างโปรเจกต์ Node, server `node:http` ที่ serve ไฟล์ static และ JSON API, สร้าง schema SQLite ทุกตาราง (ตาม Data Model ใน plan.md) พร้อมบัญชี default 1 บัญชี, หน้าเว็บ shell ธีมขาว มีเมนูและ hash router ที่สลับหน้าได้ (แต่ละหน้ายังว่าง)

**Acceptance criteria:**
- [ ] `npm start` เปิด server ที่ `127.0.0.1:3000` และสร้าง `data/journal.db` อัตโนมัติถ้ายังไม่มี
- [ ] หน้าเว็บมีเมนู ภาพรวม / รายการเทรด / วิเคราะห์ / กลยุทธ์ / Import / ตั้งค่า กดแล้ว URL hash และเนื้อหาเปลี่ยน
- [ ] `GET /api/health` ตอบ `{ ok: true }`; ขอ path แบบ `/../server.js` ได้ 404

**Verification:**
- [ ] `npm test` ผ่าน (test: health endpoint, path traversal ถูกปฏิเสธ)
- [ ] Manual: เปิด browser เห็นธีมขาว เมนูทำงาน ไม่มี error ใน console

**Dependencies:** None

**Files likely touched:** `package.json`, `.gitignore`, `server/index.js`, `server/db.js`, `public/index.html`, `public/app.css`, `public/app.js`, `test/server.test.js`

**Estimated scope:** M

---

### - [x] Task 2: เพิ่มเทรดและดูรายการเทรด

**Description:** API `POST /api/trades`, `GET /api/trades` + หน้า "รายการเทรด" มีปุ่มเพิ่มเทรด เปิดฟอร์มกลุ่ม ① ออเดอร์ (คู่เงิน, Buy/Sell, lot, entry, SL, TP, เวลาเปิด) ② ผลลัพธ์ (exit, เวลาปิด, profit, commission, swap) แล้วแสดงในตาราง เรียงใหม่สุดก่อน กำไรสีเขียว ขาดทุนสีแดง

**Acceptance criteria:**
- [ ] กรอกฟอร์มแล้วบันทึก → เทรดขึ้นในตารางทันที และยังอยู่หลังรีสตาร์ท server
- [ ] Server ตรวจข้อมูล: ช่องบังคับครบ, ตัวเลขเป็นตัวเลข, direction เป็น buy/sell, เวลาปิดไม่ก่อนเวลาเปิด → ผิดตอบ 400 พร้อมข้อความภาษาไทย ฟอร์มแสดงข้อความนั้น
- [ ] เวลาที่กรอกตีความตาม timezone ที่ตั้งไว้ (default Asia/Bangkok) และเก็บเป็น UTC
- [ ] ตารางว่างแสดงคำแนะนำ "ยังไม่มีเทรด กดเพิ่มเทรดแรก"

**Verification:**
- [ ] `npm test` ผ่าน (test: สร้าง/ดึงเทรด, validation ผิดได้ 400)
- [ ] Manual: เพิ่ม 3 ไม้ (กำไร/ขาดทุน/เสมอ) ตารางแสดงถูก สีถูก

**Dependencies:** Task 1

**Files likely touched:** `server/index.js`, `server/trades.js`, `public/pages/trades.js`, `public/app.css`, `test/trades.test.js`

**Estimated scope:** M

---

### - [x] Task 3: แก้ไข/ลบเทรด + ค่าคำนวณ

**Description:** `PUT/DELETE /api/trades/:id`, คลิกแถวเพื่อแก้ไข, ปุ่มลบมีการยืนยันในหน้าเว็บ สร้าง `public/lib/calc.js` คำนวณ net P/L, pips, planned RR, realized R, session (Asia/London/New York/ทับซ้อน) แสดงในตาราง และแสดง RR สดขณะกรอกฟอร์ม

**Acceptance criteria:**
- [ ] แก้ไขแล้วค่าในตารางเปลี่ยน, ลบแล้วหายไป (มีขั้นยืนยันก่อนลบ)
- [ ] ค่าคำนวณถูกต้องทั้ง Buy และ Sell, คู่ JPY และ XAUUSD; ไม่มี SL → RR แสดง "—" ไม่ error
- [ ] Session คิดจากเวลาเปิดแบบ UTC ถูกต้อง

**Verification:**
- [ ] `npm test` ผ่าน (test `calc.js`: buy/sell, JPY, XAU, ไม่มี SL, ขอบเวลา session)
- [ ] Manual: แก้ไข/ลบเทรดในหน้าเว็บ

**Dependencies:** Task 2

**Files likely touched:** `server/trades.js`, `public/lib/calc.js`, `public/pages/trades.js`, `test/calc.test.js`

**Estimated scope:** M

---

### Checkpoint: Foundation
- [ ] `npm test` ผ่านทั้งหมด
- [ ] เพิ่ม/แก้/ลบเทรดผ่านหน้าเว็บได้ ข้อมูลอยู่หลังรีสตาร์ท
- [ ] ให้ผู้ใช้ลองกรอกและรีวิวหน้าตาฟอร์มก่อนไปต่อ

---

## Phase 2: Journal — กลยุทธ์, checklist, รูป, บัญชี

### - [x] Task 4: กลยุทธ์ + checklist และผูกกับเทรด

**Description:** หน้า "กลยุทธ์" เพิ่ม/แก้/เก็บถาวรกลยุทธ์ แต่ละกลยุทธ์มีคำอธิบายและรายการ checklist (เพิ่ม/ลบ/เรียงลำดับ) ในฟอร์มเทรดเพิ่มกลุ่ม ③ เลือกกลยุทธ์ → checklist ของกลยุทธ์นั้นขึ้นให้ติ๊ก, ช่อง tag (คั่นด้วย comma) และกลุ่ม ④ อารมณ์ (ตัวเลือก เช่น มั่นใจ/ปกติ/กลัว/โลภ/รีบ/แก้แค้นตลาด) + โน้ต

**Acceptance criteria:**
- [ ] สร้างกลยุทธ์พร้อม checklist 3 ข้อ แล้วเลือกในฟอร์มเทรด เห็น checklist ให้ติ๊ก บันทึกแล้วเปิดอีกครั้งยังติ๊กอยู่
- [ ] ตารางเทรดแสดงกลยุทธ์ และ "checklist 2/3" ต่อไม้
- [ ] เก็บถาวรกลยุทธ์แล้วไม่ขึ้นในตัวเลือกใหม่ แต่เทรดเก่ายังแสดงชื่อได้

**Verification:**
- [ ] `npm test` ผ่าน (test API strategies + บันทึก checklist_done)
- [ ] Manual: flow สร้างกลยุทธ์ → ใช้ในเทรด

**Dependencies:** Task 3

**Files likely touched:** `server/strategies.js`, `server/index.js`, `public/pages/strategies.js`, `public/pages/trades.js`, `test/strategies.test.js`

**Estimated scope:** M

---

### - [x] Task 5: แนบ screenshot กราฟ

**Description:** ในฟอร์ม/หน้ารายละเอียดเทรด แนบรูปได้หลายรูป (เลือกไฟล์ หรือวาง Ctrl+V จาก clipboard) ใส่คำบรรยายได้ กดรูปเพื่อดูขนาดเต็ม ลบรูปได้ ไฟล์เก็บที่ `data/uploads/`

**Acceptance criteria:**
- [ ] แนบ PNG/JPG/WebP ได้ ไฟล์ชนิดอื่นหรือใหญ่เกิน 10 MB ถูกปฏิเสธพร้อมข้อความ
- [ ] ชื่อไฟล์บน disk สร้างโดย server (ไม่ใช้ชื่อจากผู้ใช้)
- [ ] ลบเทรดแล้วไฟล์รูปของเทรดนั้นถูกลบด้วย

**Verification:**
- [ ] `npm test` ผ่าน (test: upload, ปฏิเสธชนิดไฟล์, ลบตามเทรด)
- [ ] Manual: วางรูปจาก clipboard แล้วดูขนาดเต็ม

**Dependencies:** Task 3

**Files likely touched:** `server/screenshots.js`, `server/index.js`, `public/pages/trades.js`, `test/screenshots.test.js`

**Estimated scope:** M

---

### - [x] Task 6: บัญชีหลายบัญชี + ทุน + timezone

**Description:** หน้า "ตั้งค่า" จัดการบัญชี (ชื่อ, สกุลเงิน, ทุนเริ่มต้น) และเลือก timezone ที่ใช้แสดงผล ส่วนหัวเว็บมีตัวเลือกบัญชีที่ใช้งาน ทุกหน้ากรองตามบัญชีที่เลือก

**Acceptance criteria:**
- [ ] สร้างบัญชีที่ 2 แล้วสลับบัญชี รายการเทรดเปลี่ยนตาม
- [ ] เปลี่ยน timezone แล้วเวลาที่แสดงเปลี่ยน แต่ข้อมูลใน DB ไม่เปลี่ยน
- [ ] ลบบัญชีที่ยังมีเทรดไม่ได้ (แจ้งเหตุผล)

**Verification:**
- [ ] `npm test` ผ่าน (test API accounts/settings, ห้ามลบบัญชีที่มีเทรด)
- [ ] Manual: สลับบัญชีและ timezone

**Dependencies:** Task 3

**Files likely touched:** `server/accounts.js`, `server/index.js`, `public/pages/settings.js`, `public/app.js`, `test/accounts.test.js`

**Estimated scope:** M

---

### Checkpoint: Journal
- [ ] `npm test` ผ่านทั้งหมด
- [ ] บันทึกเทรดครบทุกช่อง (ออเดอร์, ผล, กลยุทธ์+checklist, tag, อารมณ์, โน้ต, รูป) ได้
- [ ] รีวิวกับผู้ใช้ก่อนทำกราฟ

---

## Phase 3: Dashboard & Analytics — กราฟ

### - [x] Task 7: Module สถิติ + การ์ดตัวเลขหน้าภาพรวม

**Description:** เพิ่มใน `calc.js`: จำนวนไม้, winrate, net P/L, ทุนปัจจุบัน (ทุนเริ่มต้น + net), % เติบโต, profit factor, avg win / avg loss, avg R, expectancy, max drawdown (เงินและ %), ชนะ/แพ้ติดกันสูงสุด หน้า "ภาพรวม" แสดงเป็นการ์ดเรียงตามความสำคัญ + ตัวกรองช่วงเวลา (สัปดาห์นี้/เดือนนี้/ทั้งหมด/กำหนดเอง)

**Acceptance criteria:**
- [ ] ตัวเลขทุกตัวตรงกับชุดข้อมูลทดสอบที่คำนวณมือไว้
- [ ] กรณีพิเศษ: ไม่มีเทรด, ไม่มีไม้แพ้ (PF = ∞ แสดง "—"), ไม้เสมอ ไม่ทำให้ error
- [ ] เปลี่ยนช่วงเวลาแล้วการ์ดอัปเดต

**Verification:**
- [ ] `npm test` ผ่าน (test สถิติทุกตัว + กรณีพิเศษ)
- [ ] Manual: เทียบตัวเลขกับข้อมูลจริงที่กรอก

**Dependencies:** Task 6

**Files likely touched:** `public/lib/calc.js`, `public/pages/dashboard.js`, `public/app.css`, `test/calc.test.js`

**Estimated scope:** M

---

### - [x] Task 8: Equity curve + Calendar กำไรรายวัน

**Description:** หน้าภาพรวมเพิ่มกราฟเส้น equity (Chart.js) พร้อมแรเงาช่วง drawdown และปฏิทินรายเดือน แต่ละวันแสดงกำไร/ขาดทุนและจำนวนไม้ สีเขียว/แดงตามผล กดวันเพื่อดูเทรดของวันนั้น วันแบ่งตาม timezone ที่ตั้งไว้

**Acceptance criteria:**
- [ ] Equity curve เริ่มจากทุนเริ่มต้นและจบที่ทุนปัจจุบัน (ตรงกับการ์ด)
- [ ] ผลรวมรายวันในปฏิทินรวมกันแล้วเท่ากับ net P/L ของเดือน
- [ ] เลื่อนเดือนก่อน/ถัดไปได้; กดวันแล้วไปหน้ารายการเทรดที่กรองวันนั้น

**Verification:**
- [ ] `npm test` ผ่าน (test ฟังก์ชัน equity series และ daily grouping รวมเทรดข้ามเที่ยงคืนตาม timezone)
- [ ] Manual: ดูกราฟและปฏิทินด้วยข้อมูลหลายเดือน

**Dependencies:** Task 7

**Files likely touched:** `public/lib/calc.js`, `public/pages/dashboard.js`, `public/index.html`, `test/calc.test.js`

**Estimated scope:** M

---

### - [x] Task 9: หน้าวิเคราะห์

**Description:** หน้า "วิเคราะห์" มีกราฟแท่ง + ตารางสรุป (จำนวนไม้, winrate, net, avg R) แยกตาม: คู่เงิน, Session, วันในสัปดาห์, ชั่วโมง, กลยุทธ์, tag, อารมณ์, Buy vs Sell และ "ติ๊ก checklist ครบ vs ไม่ครบ" ใช้ตัวกรองช่วงเวลาเดียวกับหน้าภาพรวม

**Acceptance criteria:**
- [ ] ทุกมุมมองแสดงตัวเลขถูก (ผลรวม net ทุกกลุ่ม = net รวม ยกเว้น tag ที่ 1 ไม้มีได้หลาย tag)
- [ ] กลุ่มที่ไม่มีข้อมูลไม่แสดง หรือแสดงว่า 0 ไม้ ชัดเจน
- [ ] เลือกมุมมองด้วยแท็บ ไม่ต้องเลื่อนยาว

**Verification:**
- [ ] `npm test` ผ่าน (test ฟังก์ชัน groupBy สำหรับแต่ละมิติ)
- [ ] Manual: ตรวจกราฟทุกแท็บ

**Dependencies:** Task 7

**Files likely touched:** `public/lib/calc.js`, `public/pages/analytics.js`, `test/calc.test.js`

**Estimated scope:** M

---

### Checkpoint: Dashboard
- [ ] `npm test` ผ่านทั้งหมด
- [ ] ตัวเลข dashboard ตรงกับที่ตรวจมือ, กราฟอ่านง่ายบนจอ notebook
- [ ] รีวิวกับผู้ใช้ — ปรับหน้าตาก่อนทำ import

---

## Phase 4: Import & ความปลอดภัยข้อมูล

### - [ ] Task 10: Import report HTML จาก MT5

**Description:** หน้า "Import" เลือกบัญชี, ใส่ UTC offset ของ server โบรกเกอร์, เลือกไฟล์ report HTML ของ MT5 → browser parse ตาราง Positions ด้วย `DOMParser` (รองรับไฟล์ UTF-16) → แสดง preview พร้อมสถานะ "ใหม่ / ซ้ำ" → กดยืนยันเพื่อบันทึก (`POST /api/trades/import`)

**Acceptance criteria:**
- [ ] Import ไฟล์ report จริงของผู้ใช้ได้ ค่า symbol, direction, lot, entry, SL, TP, exit, เวลา, commission, swap, profit ตรงกับใน MT5
- [ ] Import ไฟล์เดิมซ้ำไม่เกิดเทรดซ้ำ (ตรวจจาก ticket)
- [ ] ไฟล์ที่ไม่ใช่ report MT5 แจ้งข้อผิดพลาดชัดเจน ไม่บันทึกอะไร

**Verification:**
- [ ] `npm test` ผ่าน (test parser กับไฟล์ fixture ที่ลบข้อมูลส่วนตัวแล้ว + import ซ้ำ)
- [ ] Manual: import ไฟล์จริงแล้วเทียบ 3 ไม้กับ MT5

**Dependencies:** Task 6; **ต้องมีไฟล์ report MT5 ตัวอย่างจากผู้ใช้**

**Files likely touched:** `public/lib/import-mt.js`, `public/pages/import.js`, `server/trades.js`, `test/import.test.js`, `test/fixtures/mt5-report.html`

**Estimated scope:** M

---

### - [ ] Task 11: Import statement HTML จาก MT4

**Description:** เพิ่ม parser สำหรับ Detailed Statement ของ MT4 (ตาราง Closed Transactions) ใน module เดียวกัน ตรวจจับอัตโนมัติว่าไฟล์เป็น MT4 หรือ MT5 ข้ามแถวที่ไม่ใช่เทรด (balance/deposit, ออเดอร์ที่ยกเลิก)

**Acceptance criteria:**
- [ ] Import statement MT4 จริงของผู้ใช้ได้ ค่าตรงกับใน MT4
- [ ] แถว balance/credit และ pending order ที่ยกเลิกไม่ถูกนำเข้า
- [ ] Import ซ้ำไม่เกิดเทรดซ้ำ

**Verification:**
- [ ] `npm test` ผ่าน (test parser กับ fixture MT4)
- [ ] Manual: import แล้วเทียบกับ MT4

**Dependencies:** Task 10; **ต้องมีไฟล์ statement MT4 ตัวอย่างจากผู้ใช้**

**Files likely touched:** `public/lib/import-mt.js`, `test/import.test.js`, `test/fixtures/mt4-statement.html`

**Estimated scope:** S

---

### - [ ] Task 12: Export CSV + Backup + README + start.bat

**Description:** หน้าตั้งค่ามีปุ่ม "ดาวน์โหลดเทรดเป็น CSV" (เปิดใน Excel ได้ ภาษาไทยไม่เพี้ยน) และ "Backup ฐานข้อมูล" (สร้างสำเนา `data/backups/journal-YYYYMMDD-HHmm.db` ด้วย `VACUUM INTO`) เขียน README ภาษาไทย: ติดตั้ง Node, วิธีรัน, วิธี export report จาก MT4/MT5, วิธี backup/ย้ายเครื่อง และ `start.bat` สำหรับดับเบิลคลิกเปิดเว็บ

**Acceptance criteria:**
- [ ] CSV เปิดใน Excel แล้วภาษาไทยอ่านได้ (UTF-8 BOM) ครบทุกคอลัมน์
- [ ] ไฟล์ backup เปิดได้และมีข้อมูลครบ
- [ ] ดับเบิลคลิก `start.bat` แล้ว server รันและ browser เปิดหน้าเว็บ

**Verification:**
- [ ] `npm test` ผ่าน (test CSV escaping: comma, quote, ขึ้นบรรทัดใหม่ในโน้ต)
- [ ] Manual: ทำตาม README บนเครื่องจริงตั้งแต่ต้น

**Dependencies:** Task 6

**Files likely touched:** `server/export.js`, `server/index.js`, `public/pages/settings.js`, `README.md`, `start.bat`

**Estimated scope:** M

---

### Checkpoint: Complete
- [ ] `npm test` ผ่านทั้งหมด
- [ ] Acceptance criteria ทุก task ผ่าน
- [ ] ผู้ใช้ใช้งานจริงด้วยข้อมูลตัวเองได้ 1 สัปดาห์โดยไม่มีปัญหาข้อมูลหาย
