@echo off
title GJP DRYFRUITS & SPICES ERP
echo ========================================================
echo   GJP DRYFRUITS & SPICES - Inventory & Billing ERP
echo   Starting Local Server...
echo ========================================================
echo.

cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies for the first time...
    call npm install
)

echo Starting ERP Software...
start "" http://localhost:5173
call npm run dev -- --host 0.0.0.0 --port 5173

pause
