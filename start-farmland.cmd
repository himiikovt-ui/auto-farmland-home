@echo off
title Auto Farmland Launcher
cd /d "%~dp0"

echo ============================================
echo   Auto Farmland
echo   App     : http://localhost:5173
echo   Backend : http://localhost:4000
echo ============================================
echo.
echo Opening two helper windows (API + Web).
echo Keep them open while you use Farmland; close them to stop.
echo.

rem Start the backend API (data + Etsy/OpenAI) in its own window.
start "Farmland API" cmd /k "cd /d %~dp0 && node server\index.cjs"

rem Start the web app (Vite dev server) in its own window.
start "Farmland Web" cmd /k "cd /d %~dp0 && npm run dev"

rem Give the servers a few seconds, then open the app in your browser.
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"

echo Launched. This window can be closed.
timeout /t 4 /nobreak >nul
