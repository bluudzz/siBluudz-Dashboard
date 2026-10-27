@echo off
title OpenCode Worker - siBluudz Dashboard
cd /d "%~dp0"

echo ========================================================
echo   OpenCode Worker - siBluudz Dashboard
echo ========================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js tidak ditemukan!
    pause
    exit /b 1
)

echo [*] Menjalankan worker...
echo [*] Jangan tutup jendela ini selama worker memproses tugas.
echo [*] Tekan Ctrl+C untuk menghentikan.
echo.

call npm run worker:run

if errorlevel 1 (
    echo.
    echo [!] Worker berhenti atau terjadi kesalahan.
    pause
)
