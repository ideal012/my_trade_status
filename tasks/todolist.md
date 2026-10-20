# Todo List: Backtest & วัด Edge

ต่อจาก `tasks/todo.md` (Phase 1–5 เสร็จแล้ว) เป้าหมาย: ใช้วงจร backtest → replay → demo → live เทียบระบบเดียวกันได้ และบอกได้ว่า edge เชื่อได้แค่ไหน

คำสั่งที่ใช้ทุก task:
- Test: `npm test` (= `node --test`)
- Run: `npm start` แล้วเปิด http://localhost:3000
- Research: `python research/baseline.py`

---

## Phase 6: ความถูกต้องของข้อมูล (ทำก่อน)

### - [ ] Task 16: หยุด track ข้อมูลส่วนตัวใน Git

**Description:** repo เป็น public และ `data/journal.db`, `journal.backup-before-strategies.db`, `journal.db-journal` ถูก commit ไปแล้ว ทั้งที่ README บอกว่า `data/` ไม่ขึ้น Git ให้เพิ่ม `data/` ลง `.gitignore` แล้ว `git rm -r --cached data`

**Acceptance criteria:**
- [x] `git status` ไม่แสดงไฟล์ใน `data/` แม้จะมีการแก้ไข
- [x] ไฟล์ใน `data/` บนเครื่องยังอยู่ครบ แอปยังเปิดได้
- [ ] ตัดสินใจเรื่อง history เก่า: เปลี่ยน repo เป็น private หรือเขียน history ใหม่ **(รอผู้ใช้ตัดสินใจ — ไฟล์ยังอยู่ใน commit `6b87deb`)**

**Verification:**
- [x] `git ls-files data` ไม่มีผลลัพธ์

**Dependencies:** None · **Files:** `.gitignore` · **Scope:** XS

---

### - [x] Task 17: SL เริ่มต้น แยกจาก SL สุดท้าย

**Description:** `realizedR` คิดจาก `sl` ที่เก็บไว้ ถ้าไม้นั้นเลื่อน SL ตามแบบ trailing (Trend D1) ค่า R จะผิด ให้เพิ่มคอลัมน์ `initial_sl` (ใช้แบบเดียวกับที่เพิ่ม `risk_amount` ใน `db.js`) แล้วให้ R และ plannedRR ใช้ `initial_sl` ถ้ามี ถ้าไม่มีให้ใช้ `sl`

**Acceptance criteria:**
- [x] ฟอร์มเทรดมีช่อง "SL เริ่มต้น" (ไม่บังคับ)
- [x] ไม้ที่ entry 4000, initial_sl 3900, sl สุดท้าย 4050, exit 4100 ได้ R = +1.0 (ไม่ใช่ +2.0)
- [x] ไม้เก่าที่ไม่มี initial_sl ได้ค่า R เท่าเดิม

**Verification:**
- [x] `npm test` ผ่าน (เพิ่มกรณีข้างบนใน `test/calc.test.js`)

**Dependencies:** None · **Files:** `server/db.js`, `server/trades.js`, `public/lib/calc.js`, `public/lib/trade-form.js`, `test/calc.test.js` · **Scope:** S

---

### - [x] Task 18: R สุทธิหลังหัก swap และ commission

**Description:** `realizedR` ตอนนี้คิดจากราคาอย่างเดียว ไม่รวม swap และ commission แต่สำหรับ XAUUSD ที่ถือหลายวัน swap กินกำไรเกือบครึ่ง ให้เพิ่ม `netR(t) = netPnl(t) / riskMoney(t)` แล้วให้ R เฉลี่ยในหน้าภาพรวมและหน้าวิเคราะห์ใช้ netR เมื่อคำนวณได้

**Acceptance criteria:**
- [x] ไม้ risk $100, profit +$150, swap −$40 ได้ netR = +1.1
- [x] ถ้า riskMoney คำนวณไม่ได้ ให้ใช้ realizedR แบบเดิม และแสดงว่าเป็นค่าก่อนหักต้นทุน

**Verification:**
- [x] `npm test` ผ่าน

**Dependencies:** Task 17 · **Files:** `public/lib/calc.js`, `public/pages/dashboard.js`, `public/pages/analytics.js`, `test/calc.test.js` · **Scope:** S

---

### Checkpoint: Phase 6
- [ ] `npm test` ผ่านทั้งหมด
- [ ] R ของไม้ที่เลื่อน SL และไม้ที่ถือข้ามคืนถูกต้องเมื่อเทียบกับการคิดด้วยมือ

---

## Phase 7: วงจร backtest → replay → demo → live

### - [ ] Task 19: ประเภทบัญชี

**Description:** เพิ่มคอลัมน์ `kind` ใน `accounts` มีค่าเป็น `backtest` / `replay` / `demo` / `live` (ค่าเริ่มต้น `live`) แล้วเพิ่มแท็บ "ประเภทบัญชี" ในหน้าวิเคราะห์ ที่รวมทุกบัญชีและแยกผลตาม kind ของกลยุทธ์ที่เลือก

**Acceptance criteria:**
- [ ] ตั้ง kind ได้ในหน้าตั้งค่า
- [ ] เลือกกลยุทธ์ "Trend Following D1" แล้วเห็นจำนวนไม้, winrate และ R เฉลี่ย ของ backtest เทียบกับ replay, demo และ live ในตารางเดียว

**Verification:**
- [ ] `npm test` ผ่าน (accounts + analytics grouping)

**Dependencies:** Task 18 · **Files:** `server/db.js`, `server/accounts.js`, `public/pages/settings.js`, `public/pages/analytics.js`, `test/accounts.test.js` · **Scope:** M

---

### - [ ] Task 20: Import ไม้จาก backtest (CSV)

**Description:** ให้ `research/baseline.py` export รายการไม้เป็น CSV มีคอลัมน์ `symbol,direction,lot,entry_price,initial_sl,exit_price,open_time_utc,close_time_utc,profit,swap,commission,strategy` แล้วเพิ่มตัวอ่าน CSV ในหน้า Import ที่นำเข้าไปยังบัญชีประเภท backtest

**Acceptance criteria:**
- [ ] `python research/baseline.py --export trades_trend.csv` สร้างไฟล์ได้
- [ ] Import ไฟล์นั้นแล้วได้จำนวนไม้และ R รวมตรงกับที่ Python พิมพ์ออกมา (คลาดเคลื่อนไม่เกิน 0.1R)
- [ ] Import ไฟล์เดิมซ้ำแล้วไม่เกิดไม้ซ้ำ
- [ ] แถวที่อ่านไม่ได้ต้องแจ้งเป็นรายแถว ห้ามเดาค่า (หลักเดียวกับ import MT4/MT5)

**Verification:**
- [ ] `npm test` ผ่าน (fixture CSV 5 แถว รวมแถวเสีย 1 แถว)

**Dependencies:** Task 19 · **Files:** `research/baseline.py`, `public/lib/import-csv.js`, `public/pages/import.js`, `test/import.test.js`, `test/fixtures/backtest.csv` · **Scope:** M

---

### Checkpoint: Phase 7
- [ ] เทียบ Trend D1 ระหว่าง backtest กับ replay ได้ในหน้าวิเคราะห์

---

## Phase 8: บอกได้ว่า edge เชื่อได้แค่ไหน

### - [x] Task 21: ตัวชี้วัดความน่าเชื่อถือในหน้าวิเคราะห์

**Description:** เพิ่มคอลัมน์ในตารางของหน้าวิเคราะห์ (ทุกแท็บ): Profit Factor, SQN = √N × mean(R) ÷ sd(R) และป้าย "ข้อมูลยังน้อย" เมื่อกลุ่มนั้นมีน้อยกว่า 30 ไม้

**Acceptance criteria:**
- [x] R = [1, −1, 2, −1, 1] ได้ SQN ≈ 0.67 (ใช้ sample sd หาร n−1)
- [x] กลุ่มที่มีน้อยกว่า 30 ไม้ แสดงตัวเลขเป็นสีจางพร้อมป้าย
- [x] กลุ่มที่มีไม่ถึง 2 ไม้ หรือ sd = 0 แสดง SQN เป็น "—"

**Verification:**
- [x] `npm test` ผ่าน

**Dependencies:** Task 18 · **Files:** `public/lib/calc.js`, `public/pages/analytics.js`, `test/calc.test.js` · **Scope:** S

---

### - [ ] Task 22: การกระจายของ R + expectancy แบบ rolling

**Description:** เพิ่มกราฟ 2 ตัวในหน้าภาพรวม (Chart.js ตัวเดิม):
1. histogram ของ R ช่องละ 0.5R
2. เส้น expectancy เฉลี่ยของ 20 ไม้ล่าสุดเทียบกับค่าจาก backtest ของกลยุทธ์เดียวกัน ใช้ดูว่า edge กำลังเสื่อมหรือเปล่า

**Acceptance criteria:**
- [ ] ถ้ามีไม่ถึง 20 ไม้ ให้ซ่อนเส้น rolling แล้วบอกเหตุผล
- [ ] กราฟมี `aria-label` และตัวเลขเดียวกันดูได้ในตาราง (ตามแบบหน้าวิเคราะห์)

**Verification:**
- [ ] `npm test` ผ่าน (ฟังก์ชัน rolling ใน calc.js)
- [ ] Manual: ธีมขาวและดำอ่านออกทั้งคู่

**Dependencies:** Task 19, 21 · **Files:** `public/lib/calc.js`, `public/pages/dashboard-charts.js`, `public/pages/dashboard.js` · **Scope:** M

---

### - [ ] Task 23: ระยะเวลาถือ + MAE/MFE

**Description:** คำนวณระยะเวลาถือจาก open/close time (ไม่ต้องเพิ่มคอลัมน์) และแสดงค่ามัธยฐานกับ percentile ที่ 90 แยกไม้กำไรกับไม้ขาดทุน เพิ่มช่อง MAE/MFE (ราคาที่แย่ที่สุดและดีที่สุดระหว่างถือ, ไม่บังคับกรอก) แล้วแสดงในหน่วย R

**Acceptance criteria:**
- [ ] หน้าวิเคราะห์ตอบได้ว่า "ไม้ชนะถือนานแค่ไหน ไม้แพ้ถือนานแค่ไหน"
- [ ] ไม้ที่ไม่มี MAE/MFE ไม่ทำให้สถิติอื่นเพี้ยน

**Verification:**
- [ ] `npm test` ผ่าน

**Dependencies:** Task 17 · **Files:** `server/db.js`, `public/lib/calc.js`, `public/lib/trade-form.js`, `public/pages/analytics.js` · **Scope:** M

---

### - [ ] Task 24: บันทึกฝาก/ถอน

**Description:** ตาราง `cashflows (account_id, time_utc, amount, note)` ที่ equity curve, growth % และ drawdown ใช้แทนการแก้ทุนเริ่มต้น

**Acceptance criteria:**
- [ ] ฝาก $1,000 กลางทางแล้ว drawdown ไม่เปลี่ยนเพราะการฝาก
- [ ] ทุนปัจจุบัน = ทุนเริ่มต้น + กำไรสุทธิ + ฝาก − ถอน

**Verification:**
- [ ] `npm test` ผ่าน

**Dependencies:** None · **Files:** `server/db.js`, `server/accounts.js`, `public/lib/calc.js`, `public/pages/settings.js` · **Scope:** M

---

### Checkpoint: Phase 8
- [ ] ดูหน้าวิเคราะห์ของกลยุทธ์ใดก็ได้แล้วตอบได้ 3 ข้อ: edge เท่าไร (R ต่อไม้หลังหักต้นทุน), เชื่อได้แค่ไหน (จำนวนไม้ + SQN), และยังอยู่หรือเสื่อมแล้ว (rolling expectancy เทียบ backtest)

---

## Phase 9: Research (Python, ไม่แตะเว็บ)

### - [ ] Task 25: เติม baseline.py ให้ครบเกณฑ์ validation

**Description:** เพิ่มใน `research/baseline.py`: ระยะเวลาถือ (มัธยฐาน / p90), t-stat และ SQN ของ R, การแบ่ง in-sample 2017–2022 กับ out-of-sample 2023–2026 โดยไม่ปรับพารามิเตอร์ และการรันแบบ long-only

**Acceptance criteria:**
- [ ] พิมพ์ผล IS กับ OOS แยกกันสำหรับ Trend D1 และ Donchian
- [ ] assert เดิม (swap 3 เท่าวันพุธ) ยังผ่าน และเพิ่ม assert ของ SQN

**Verification:**
- [ ] `python research/baseline.py` รันจบโดยไม่มี error และผลตรงกับ `baseline_results.txt` ส่วนที่ไม่ได้แก้

**Dependencies:** None · **Files:** `research/baseline.py`, `research/baseline_results.txt` · **Scope:** S

---

## ลำดับที่แนะนำ

16 → 17 → 18 → 25 → 21 → 19 → 20 → 22 → 23 → 24

ทำ Task 16 ก่อนทันที เพราะ repo เป็น public อยู่ ส่วน Task 25 ทำคู่ขนานได้เพราะไม่แตะเว็บ
