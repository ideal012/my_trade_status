@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ไม่พบ Node.js - ติดตั้งเวอร์ชัน LTS จาก https://nodejs.org แล้วดับเบิลคลิกไฟล์นี้อีกครั้ง
  pause
  exit /b 1
)
if not exist node_modules (
  echo กำลังติดตั้งส่วนประกอบครั้งแรก...
  call npm install --omit=dev
)
echo เปิดสมุดเทรดที่ http://localhost:3000  (ปิดหน้าต่างนี้เพื่อหยุดโปรแกรม)
node --disable-warning=ExperimentalWarning server\index.js
pause
