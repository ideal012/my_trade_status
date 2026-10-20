# Spec: Backtest & วัด Edge (Phase 6–9)

ต่อยอดสมุดเทรด (`tasks/plan.md`, Phase 1–5) ให้ใช้กับวงจร **backtest → replay → demo → live** ได้ และตอบได้ 3 ข้อสำหรับทุกกลยุทธ์: edge เท่าไร (R ต่อไม้หลังหักต้นทุน), เชื่อได้แค่ไหน (จำนวนไม้ + SQN), และยังอยู่หรือเสื่อมแล้ว (rolling expectancy เทียบ backtest)
รายการ task อยู่ที่ `tasks/todolist.md` (Task 16–25)

## Objective

ผู้ใช้: เจ้าของสมุดเทรดคนเดียว เทรด XAUUSD swing เป็นหลัก ใช้ MT5 + Python research ใช้งานบนเครื่องตัวเองเท่านั้น

User stories:
1. เลื่อน SL ตาม trailing แล้วค่า R ยังคิดจาก SL เริ่มต้น และหัก swap/commission แล้ว
2. แยกบัญชีเป็น backtest / replay / demo / live แล้วเทียบกลยุทธ์เดียวกันข้ามประเภทในตารางเดียว
3. Export ไม้จาก `research/baseline.py` แล้ว import เข้าบัญชี backtest ได้ตรงกับที่ Python คำนวณ
4. เห็นว่ากลุ่มไหนมีไม้น้อยเกินจะเชื่อ เห็น SQN, PF, การกระจายของ R และ expectancy 20 ไม้ล่าสุดเทียบ backtest
5. รู้ว่าไม้ชนะ/แพ้ถือนานแค่ไหน และราคาวิ่งสวน/วิ่งไปทางกำไรเท่าไร (MAE/MFE ในหน่วย R)
6. ฝาก/ถอนเงินแล้ว drawdown และ growth ไม่เพี้ยน
7. baseline.py รายงานผลแยก in-sample/out-of-sample, SQN และระยะถือ

## Tech Stack

- Node.js ≥ 22.13: `node:http`, `node:sqlite` (`DatabaseSync`), `node:test` — ไม่มี framework, ไม่มี build step
- Frontend: HTML/CSS/JS ES modules, Chart.js 4 (dependency ภายนอกตัวเดียว)
- Research: Python 3 + pandas + numpy (มีอยู่แล้ว) ใช้เฉพาะใน `research/`

## Commands

```
npm start                         # http://localhost:3000
npm test                          # node --test ทั้งหมด
node --test test/calc.test.js     # เฉพาะไฟล์
python3 research/baseline.py                      # รัน baseline + พิมพ์ผล
python3 research/baseline.py --export out.csv     # export ไม้เป็น CSV สำหรับ import (Task 20)
```

## Project Structure

```
server/            → HTTP API + SQLite (db.js = schema + migration)
public/lib/calc.js → สถิติทั้งหมด (pure function ไม่แตะ DOM/DB) ← งานส่วนใหญ่อยู่ที่นี่
public/lib/        → import-mt.js, import-csv.js (ใหม่), trade-form.js
public/pages/      → หน้า dashboard / analytics / import / settings
test/              → node:test, fixtures ใน test/fixtures/
research/          → Python backtest (ไม่ถูก import จากเว็บ)
data/              → DB + CSV ราคา (ไม่อยู่ใน Git)
tasks/             → plan.md, todo.md, todolist.md
```

## Data Model (ผ่าน `PRAGMA user_version` แบบเดิม: v3 initial_sl · v4 kind · v5 mae/mfe · v6 cashflows — 1 task = 1 version เพื่อให้ revert ได้ทีละ task; เพิ่มคอลัมน์อย่างเดียวจึงไม่ต้อง backup ตามที่ test เดิมกำหนด)

| ตาราง | เพิ่ม | หมายเหตุ |
|---|---|---|
| trades | `initial_sl REAL`, `mae REAL`, `mfe REAL` | ราคา ไม่บังคับ ใช้ `ALTER TABLE ADD COLUMN` ไม่ rebuild |
| accounts | `kind TEXT NOT NULL DEFAULT 'live'` | ค่าได้: `backtest` `replay` `demo` `live` ตรวจใน `cleanAccount` |
| cashflows (ใหม่) | `id, account_id, time_utc, amount, note` | amount บวก = ฝาก, ลบ = ถอน |

ค่าที่คำนวณได้ไม่เก็บใน DB (หลักเดิมของโปรเจกต์)

## นิยามการคำนวณ (สัญญาของ calc.js)

- `riskPrice(t) = |entry − (initial_sl ?? sl)|` — ใช้ใน `plannedRR`, `realizedR`, `riskMoney`; ไม้ที่ไม่มี initial_sl ได้ค่าเท่าเดิมทุกตัว
- `netR(t) = netPnl(t) / riskMoney(t)` ถ้า riskMoney คำนวณได้ ไม่งั้น `null`; R เฉลี่ยในหน้าภาพรวม/วิเคราะห์ใช้ netR ก่อน ถ้าเป็น null ใช้ realizedR และแสดงว่า "ก่อนหักต้นทุน"
- `sqn(rs) = √n × mean(rs) ÷ sd(rs)` ใช้ sample sd (หาร n−1); n < 2 หรือ sd = 0 → `null` (ค่านี้เท่ากับ t-stat ของ mean R)
- `MIN_SAMPLE = 30` — กลุ่มที่มีน้อยกว่านี้ติดป้าย "ข้อมูลยังน้อย"
- `rollingMean(rs, 20)` — expectancy 20 ไม้ล่าสุด เรียงตามเวลาปิด; ไม่ถึง 20 ไม้ → ไม่แสดง
- histogram ของ R ช่องละ 0.5R
- ระยะถือ = (close − open) เป็นวัน; รายงานมัธยฐานและ p90 แยกไม้กำไร/ขาดทุน
- `maeR = |mae − entry| ÷ riskPrice`, `mfeR = |mfe − entry| ÷ riskPrice`
- Cashflow: drawdown คิดจากเส้นกำไรสะสม (ไม่นับฝาก/ถอน) % เทียบกับทุนที่จุดสูงสุดรวมเงินฝากแล้ว; `growthPct = net ÷ (initial + ฝากสุทธิ)` — ponytail: ไม่ใช่ time-weighted return

## CSV import (Task 20)

Header ตายตัว:
`ticket,symbol,direction,lot,entry_price,initial_sl,exit_price,open_time_utc,close_time_utc,profit,swap,commission,strategy`

- `ticket` สร้างแบบ deterministic จาก baseline.py (เช่น `trend-d1-2019-03-05`) ใช้กันซ้ำผ่าน `UNIQUE(account_id, ticket)` เดิม
- เวลาเป็น ISO UTC; import ได้เฉพาะบัญชี `kind = backtest` (อื่นตอบ 400)
- `strategy` จับคู่ชื่อกลยุทธ์ที่มีอยู่แบบตรงตัว ไม่เจอ → เก็บ strategy_id เป็น null และแจ้งในรายงานแถวนั้น
- แถวผิดรูปแบบแจ้งเป็นรายแถว ไม่นำเข้า ไม่เดาค่า (หลักเดียวกับ import MT4/MT5)
- `source = 'csv-backtest'`

## Research (Task 25)

- In-sample 2017-01-01 – 2022-12-31, out-of-sample 2023-01-01 – สิ้นสุดข้อมูล พารามิเตอร์คงที่ ห้ามปรับดู OOS
- พิมพ์ SQN, ระยะถือ (มัธยฐาน/p90), ผลแยก long-only
- signal ที่ close → fill ที่ open แท่งถัดไป (ห้าม look-ahead) และ assert เรื่อง swap 3 เท่าวันพุธยังอยู่

## Code Style

ตามของเดิม: ฟังก์ชันสั้น pure, ชื่อ camelCase, ข้อความ error ภาษาไทยผ่าน `HttpError`, คอมเมนต์ `ponytail:` เมื่อจงใจลดความซับซ้อน

```js
const riskPrice = (t) => {
  const sl = t.initial_sl ?? t.sl;
  return sl == null ? 0 : Math.abs(t.entry_price - sl);
};

export function realizedR(t) {
  return isOpen(t) || !riskPrice(t) ? null : ((t.exit_price - t.entry_price) * dir(t)) / riskPrice(t);
}
```

## Testing Strategy

- `node:test` + `node:assert/strict`, ใช้ helper `T()` และ `close()` ใน `test/calc.test.js`
- ทุกฟังก์ชันใหม่ใน calc.js มีเทสต์ตัวเลขที่คิดด้วยมือได้ (ตัวอย่างใน todolist.md)
- Migration: เทสต์ว่า DB v2 เดิมเปิดแล้วได้คอลัมน์ใหม่ ข้อมูลเดิมไม่หาย (ตามแบบ `test/db.test.js`)
- Route ใหม่: เทสต์ผ่าน `test/helpers.js` (validation ผิดได้ 400)
- CSV: fixture `test/fixtures/backtest.csv` 5 แถว มีแถวเสีย 1 แถว
- Python: assert ใน `__main__` ของ baseline.py
- UI: ตรวจด้วยตาในธีมขาวและดำ ไม่มี error ใน console

## Boundaries

- **Always:** `npm test` ผ่านก่อนทุก commit · 1 task = 1 commit · stage เฉพาะไฟล์ของ task นั้น · migration ผ่าน `PRAGMA user_version` · ไม้เก่าต้องได้ค่าเดิมเมื่อไม่มีข้อมูลใหม่
- **Ask first:** เพิ่ม dependency (npm/pip) · migration ที่ต้อง rebuild ตาราง · แก้ตัวอ่าน MT4/MT5 · push ขึ้น GitHub · เปลี่ยน visibility หรือเขียน history ของ repo ใหม่
- **Never:** commit `data/` หรือไฟล์ราคา/ฐานข้อมูล · ลบหรือเขียนทับ `data/journal.db` · เปลี่ยนค่า R ของไม้ที่ไม่มี initial_sl · ใช้ข้อมูลอนาคตใน research

## Success Criteria

1. ตัวอย่างตัวเลขทุกข้อใน `tasks/todolist.md` (Task 17, 18, 21) ผ่านเป็นเทสต์
2. `npm test` ผ่านทั้งหมด และเทสต์เดิม 86 ตัวไม่ถูกแก้ความหมาย
3. Import CSV จาก baseline.py แล้ว จำนวนไม้และ R รวมตรงกับ Python (±0.1R)
4. หน้าวิเคราะห์ของกลยุทธ์ใดก็ได้แสดง R สุทธิ, PF, SQN, ป้ายข้อมูลน้อย, และเทียบตามประเภทบัญชีได้
5. baseline.py พิมพ์ผล IS/OOS แยกกันได้โดยไม่ error

## Assumptions

1. ประเภท (backtest/replay/demo/live) ผูกกับบัญชี ไม่ใช่รายไม้
2. MAE/MFE กรอกเองเป็นราคา ไม่คำนวณจากข้อมูลราคา
3. ใช้ swap ปัจจุบันใน research ต่อไป (ไม่มี series ย้อนหลัง)
4. ทำงานบน branch ปัจจุบัน (`main`) commit ในเครื่อง ไม่ push จนกว่าผู้ใช้สั่ง

## Open Questions

- Task 16: history ที่มี `data/` ใน commit `6b87deb` — เปลี่ยน repo เป็น private หรือเขียน history ใหม่? (ผู้ใช้ตัดสินใจ; ไม่ block task อื่น)
