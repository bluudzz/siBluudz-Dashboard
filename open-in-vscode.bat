@echo off
title siBluudz Dashboard - VS Code
cd /d "%~dp0"

echo ============================================
echo    siBluudz Dashboard - VS Code Launcher
echo ============================================
echo.

:: Check if node_modules exists
if not exist "node_modules" (
    echo [!] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo.
)

:: Open the project folder in VS Code
echo [*] Opening project in VS Code...
code "%~dp0"

:: Start dev server in background
echo [*] Starting backend ^& dev server...
start "siBluudz Server" /min cmd /c "npm run dev"

:: Wait for server to be ready
echo [*] Waiting for server to start...
set /a ATTEMPTS=0
:wait_loop
timeout /t 1 /nobreak >nul
curl -s -o nul http://localhost:5173 2>nul
if %errorlevel% neq 0 (
    set /a ATTEMPTS+=1
    if %ATTEMPTS% lss 30 goto wait_loop
)

:: Open Simple Browser inside VS Code
echo [*] Opening dashboard in VS Code Simple Browser...
code --goto "%~dp0src\App.tsx"
timeout /t 1 /nobreak >nul
code --open-url "vscode://vscode.simple-browser/show?url=http%%3A%%2F%%2Flocalhost%%3A5173"

echo.
echo [OK] Dashboard is running at http://localhost:5173
echo [*] Close this window to stop the server.
echo.
pause
