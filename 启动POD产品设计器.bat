@echo off
setlocal
cd /d "%~dp0"
title POD Product Designer

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js 18 or later.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo First launch: installing dependencies. Please wait...
  call npm install --ignore-scripts --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency installation failed. Check the network and try again.
    pause
    exit /b 1
  )
)

echo Starting POD Product Designer...
start "" http://localhost:5173
call npm run dev -- --host 0.0.0.0 --port 5173



