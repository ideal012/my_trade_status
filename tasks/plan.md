# Implementation Plan: My Trade Status (Forex Trading Journal)

## Overview

เว็บแอปรันบนเครื่องตัวเอง (local) สำหรับบันทึกและวิเคราะห์การเทรด Forex
- บันทึกแต่ละไม้: คู่เงิน, Buy/Sell, lot, จุดเข้า, SL, TP, จุดออก, เวลาเปิด/ปิด + timezone, กำไร, commission, swap
- กลยุทธ์ (Setup) พร้อม checklist เงื่อนไขก่อนเข้าเทรด แล้วติ๊กในแต่ละไม้ว่าทำครบไหม
- Tag, โน้ต, อารมณ์ตอนเทรด, รูป screenshot กราฟ
- บัญชีพร้อมทุนเริ่มต้น
- Dashboard: Equity curve, Max drawdown, Winrate, Profit factor, RR, Calendar กำไรรายวัน
- Analytics: แยกตามคู่เงิน / Session (Asia, London, New York) / วันในสัปดาห์ / กลยุทธ์ / tag / อารมณ์
- กรอกเองผ่านฟอร์ม + Import จาก report HTML ของ MT4/MT5
- ธีมสีขาว (light) อย่างเดียว ภาษาไทย

## Architecture Decisions

- **Runtime: Node.js 24 (มีในเครื่องแล้ว)** ใช้ของ built-in ให้มากที่สุด:
  - `node:http` เป็น server (ไม่ใช้ Express — มีแค่ ~15 route, router เขียนสั้นๆ พอ)
  - `node:sqlite` (`DatabaseSync`) เป็นฐานข้อมูล — ไฟล์เดียว `data/journal.db` สำรองง่ายแค่ copy ไฟล์
  - `node:test` เป็น test runner
- **Dependency ภายนอกตัวเดียว: Chart.js** (ติดตั้งผ่าน npm แล้ว serve จาก `node_modules` → ใช้งานได้แม้ไม่มีเน็ต)
- **Frontend: HTML + CSS + JavaScript ล้วน (ES modules), ไม่มี build step** — แก้ไฟล์แล้ว refresh ได้เลย
  - SPA แบบ hash route (`#/dashboard`, `#/trades`, ...) ไฟล์เดียว `index.html`
- **คำนวณสถิติใน module เดียว `public/lib/calc.js`** (pure function, ไม่แตะ DOM/DB) → ใช้ได้ทั้งใน browser และ test ด้วย `node --test`
- **เวลา: เก็บเป็น UTC (ISO string) ใน DB** แสดงผลตาม timezone ที่ตั้งไว้ (default `Asia/Bangkok`) ใช้ `Intl.DateTimeFormat` ของ browser ไม่ต้องลง library
  - Session คำนวณจากเวลา UTC ของจุดเข้า
  - Import จาก MT4/MT5: ให้ระบุ UTC offset ของ server โบรกเกอร์ (ส่วนใหญ่ GMT+2/+3) แล้วแปลงเป็น UTC
- **ค่าที่คำนวณได้ไม่เก็บใน DB** (net P/L, pips, RR, R-multiple, session) → คำนวณตอนแสดงผล ไม่มีข้อมูลซ้ำซ้อนที่อาจไม่ตรงกัน
  - Net = profit + commission + swap
  - Planned RR = |TP − entry| / |entry − SL|
  - Realized R = (exit − entry) × ทิศทาง / |entry − SL|
  - Pip size: JPY คู่ = 0.01, XAU = 0.1, อื่นๆ = 0.0001 (ปรับได้ภายหลัง)
- **Tag เก็บเป็น text คั่นด้วย comma** ในตาราง trades (ไม่ทำตาราง many-to-many จนกว่าจะจำเป็น)
- **Screenshot:** browser อ่านไฟล์ → ส่งเป็น base64 ใน JSON → server เขียนไฟล์ลง `data/uploads/` (ไม่ต้องใช้ library multipart)
- **Import MT4/MT5: parse HTML report ใน browser ด้วย `DOMParser`** (native) → แสดง preview → ยืนยันแล้วค่อยส่งเข้า API กันข้อมูลซ้ำด้วยเลข ticket (`UNIQUE(account_id, ticket)`)
- **ความปลอดภัย:** server ฟังเฉพาะ `127.0.0.1` (เครื่องอื่นในวง LAN เข้าไม่ได้), ใช้ prepared statement ทุก query, ตรวจ path ของไฟล์ static/upload กัน path traversal, escape ข้อความก่อนใส่ HTML
- **รัน:** `npm start` หรือดับเบิลคลิก `start.bat` → เปิด http://localhost:3000

### Data Model

```
accounts    id, name, currency, initial_capital, created_at
strategies  id, name, description, checklist (JSON array ของข้อความ), archived
trades      id, account_id, ticket (nullable), symbol, direction (buy|sell), lot,
            entry_price, sl, tp, exit_price, open_time_utc, close_time_utc,
            profit, commission, swap, strategy_id (nullable),
            checklist_done (JSON array ของ index ที่ติ๊ก), tags, emotion, notes,
            source (manual|mt4|mt5), created_at
            UNIQUE(account_id, ticket)
screenshots id, trade_id, filename, caption, created_at
settings    key, value   (timezone, default account)
```

### หลักการออกแบบหน้าเว็บให้เข้าใจง่าย

สรุปจากแนวทางออกแบบ dashboard สำหรับเทรดเดอร์:
1. **ลำดับความสำคัญชัดเจน** — ตัวเลขสำคัญที่สุด (กำไรสุทธิ, ทุนปัจจุบัน, Winrate) อยู่บนสุดเป็นการ์ดตัวใหญ่ รายละเอียดอยู่ล่าง
2. **สีมีความหมายเดียว** — เขียว = กำไร, แดง = ขาดทุน ทั้งเว็บ ใส่เครื่องหมาย +/− ด้วยเสมอ (ไม่พึ่งสีอย่างเดียว)
3. **เมนูน้อย ชื่อตรงตัว** — ภาพรวม / รายการเทรด / วิเคราะห์ / กลยุทธ์ / Import / ตั้งค่า
4. **ฟอร์มแบ่งกลุ่ม** — ① ข้อมูลออเดอร์ ② ผลลัพธ์ ③ กลยุทธ์ + checklist ④ โน้ต/อารมณ์/รูป; คำนวณ RR ให้ดูทันทีขณะกรอก
5. **ตัวเลขอ่านง่าย** — ชิดขวา, ฟอนต์ตัวเลขความกว้างเท่ากัน (`tabular-nums`), ทศนิยมคงที่
6. **หน้าว่างมีคำแนะนำ** — ยังไม่มีข้อมูลก็บอกว่า "กดปุ่มเพิ่มเทรดแรก" แทนตารางว่าง
7. **ธีมขาวพื้นสะอาด** — พื้นขาว/เทาอ่อน, การ์ดมีเส้นขอบบาง, สีเน้นสีเดียว, ใช้งานบนจอเล็กได้

## Task List

รายละเอียดแต่ละ task (acceptance criteria, verification, ไฟล์) อยู่ใน `tasks/todo.md`

### Phase 1: Foundation — บันทึกเทรดได้
- [x] Task 1: Server + DB + หน้าเว็บโครงหลัก (ธีมขาว, เมนู)
- [x] Task 2: เพิ่มเทรดและดูรายการเทรด
- [ ] Task 3: แก้ไข/ลบเทรด + ค่าคำนวณ (net, pips, RR, R, session)

### Checkpoint: Foundation
- [ ] `npm test` ผ่าน, เปิดเว็บแล้วเพิ่ม/แก้/ลบเทรดได้ครบ

### Phase 2: Journal — กลยุทธ์, checklist, รูป, บัญชี
- [ ] Task 4: กลยุทธ์ + checklist และผูกกับเทรด (พร้อม tag, อารมณ์, โน้ต)
- [ ] Task 5: แนบ screenshot กราฟ
- [ ] Task 6: บัญชีหลายบัญชี + ทุนเริ่มต้น + timezone

### Checkpoint: Journal
- [ ] บันทึกเทรดครบทุกช่องตั้งแต่ต้นจนจบได้ในฟอร์มเดียว

### Phase 3: Dashboard & Analytics — กราฟ
- [ ] Task 7: Module สถิติ + การ์ดตัวเลขหน้าภาพรวม
- [ ] Task 8: Equity curve + Calendar กำไรรายวัน
- [ ] Task 9: หน้าวิเคราะห์ แยกตามคู่เงิน/Session/วัน/กลยุทธ์/tag/อารมณ์

### Checkpoint: Dashboard
- [ ] ตัวเลขบน dashboard ตรงกับที่คำนวณมือจากข้อมูลตัวอย่าง

### Phase 4: Import & ความปลอดภัยข้อมูล
- [ ] Task 10: Import report HTML จาก MT5
- [ ] Task 11: Import statement HTML จาก MT4
- [ ] Task 12: Export CSV + Backup DB + README วิธีใช้ + start.bat

### Checkpoint: Complete
- [ ] ทุก acceptance criteria ผ่าน, ใช้งานจริงด้วยข้อมูลของผู้ใช้ได้

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `node:sqlite` ยังมีสถานะ experimental ใน Node 24 (มี warning ตอนรัน) | Med | ห่อการเรียก DB ไว้ใน `server/db.js` ไฟล์เดียว ถ้ามีปัญหาเปลี่ยนเป็น `better-sqlite3` (API เกือบเหมือนกัน) ได้ในไฟล์เดียว |
| รูปแบบ report MT4/MT5 ต่างกันตามโบรกเกอร์/เวอร์ชัน/ภาษา และ MT5 HTML มักเป็น UTF-16 | High | ทำ Task 10–11 จากไฟล์ report จริงของผู้ใช้, หาตารางจากหัวคอลัมน์แทนตำแหน่งตายตัว, มีหน้า preview ก่อนบันทึก |
| เวลาเพี้ยนเพราะ timezone โบรกเกอร์/DST | Med | เก็บ UTC เสมอ, ให้ระบุ offset ตอน import, แสดง timezone กำกับทุกครั้ง |
| ไฟล์ DB เสีย/ลบผิด ข้อมูลหายหมด | High | Task 12 ปุ่ม backup + แนะนำ copy โฟลเดอร์ `data/` สม่ำเสมอ; `data/` อยู่ใน `.gitignore` กันข้อมูลการเงินหลุดขึ้น GitHub |
| Pip size ไม่ตรงกับบางสัญลักษณ์ (index, crypto, ชื่อมี suffix เช่น `EURUSDm`) | Low | RR/R คำนวณจากราคา ไม่ขึ้นกับ pip; pip ใช้แค่แสดงผล ปรับตารางได้ภายหลัง |

## Open Questions

1. **ขอไฟล์ report ตัวอย่างจาก MT4 และ MT5** (History → คลิกขวา → Report → HTML) ใช้ตอนทำ Task 10–11 — ลบเลขบัญชี/ชื่อออกได้
2. บัญชีเป็นสกุลเงินอะไร — USD หรือ USC (บัญชี cent)?
3. ต้องการบันทึก **ฝาก/ถอนเงิน** ไหม? (มีผลกับ equity curve; แผนนี้ยังไม่รวม)
4. ใช้ **ปิดบางส่วน (partial close)** บ่อยไหม? (แผนนี้นับ 1 ไม้ = 1 รายการ; MT5 แยก partial เป็นหลาย deal)

## ไอเดียเพิ่มเติม (ยังไม่อยู่ในแผน — เพิ่มทีหลังได้)

- **Risk % ต่อไม้** — กรอกเงินที่เสี่ยง ($) แล้วคำนวณ % ของทุน เตือนเมื่อเกินกฎ (เช่น > 2%)
- **คะแนนวินัย** — % ไม้ที่ติ๊ก checklist ครบ เทียบ winrate ของไม้ "ทำตามกฎ" vs "ไม่ทำตามกฎ"
- **Daily loss limit** — เตือนเมื่อขาดทุนวันนี้เกินที่ตั้งไว้
- **Weekly review** — หน้าสรุปรายสัปดาห์ + ช่องเขียนบทเรียนประจำสัปดาห์
- **MAE/MFE** — ราคาวิ่งสวน/วิ่งไปทางกำไรสุดเท่าไหร่ ดูว่า SL แคบไป/TP ไกลไปไหม
- **Trading plan ล่วงหน้า** — บันทึกแผนก่อนตลาดเปิด แล้วเทียบกับสิ่งที่เทรดจริง
