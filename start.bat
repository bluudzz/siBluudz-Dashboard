@echo off
title siBluudz Dashboard
cd /d "%~dp0"

echo ============================================
echo    siBluudz Dashboard - Starting...
echo ============================================
echo.

:: Check Node.js installation
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js tidak ditemukan di sistem!
    echo Silakan download dan install Node.js dari https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist "node_modules" (
    echo [!] Folder node_modules belum ada. Menginstall dependencies...
    echo.
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install gagal!
        echo.
        pause
        exit /b 1
    )
    echo.
)

:: Clean up lingering node processes on port 3001 & 5173 from previous runs
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [*] Menjalankan backend (port 3001) dan frontend (http://localhost:5173)...
echo [*] Browser akan terbuka otomatis.
echo [*] Tekan Ctrl+C untuk menghentikan server.
echo.

call npx concurrently -k -n "api,web" -c "cyan,green" "npm run dev:server" "npx vite --host localhost --open"

if errorlevel 1 (
    echo.
    echo [!] Server berhenti atau terjadi error.
    pause
)
