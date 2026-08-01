@echo off
setlocal
title CANVA STORY full local stack
cd /d "%~dp0"

set "CANVA_URL=http://localhost:5173/CANVA_STORY_/"
set "LMS=%USERPROFILE%\.lmstudio\bin\lms.exe"
set "LM_STUDIO_EXE=D:\SD\LM Studio\LM Studio.exe"
set "COMFY_ROOT=D:\ComfyUI-Omnivorous-T2.6-P312-Cu126"
set "COMFY_PY=%COMFY_ROOT%\python_embeded\python.exe"

echo Starting CANVA STORY local stack...
echo.
echo CANVA STORY:
echo   %CANVA_URL%
echo LM Studio:
echo   http://localhost:1234
echo ComfyUI:
echo   http://localhost:8188
echo.

echo [1/3] Preparing LM Studio server with CORS...
if not exist "%LMS%" (
  echo LM Studio CLI was not found:
  echo   %LMS%
  echo.
  echo Open LM Studio once, then run this file again.
  pause
  exit /b 1
)

if exist "%LM_STUDIO_EXE%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = 'D:\SD\LM Studio\LM Studio.exe'; $running = Get-Process -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -eq $path } catch { $false } }; if (-not $running) { exit 1 }"
  if errorlevel 1 (
    echo Opening LM Studio desktop app...
    start "" "%LM_STUDIO_EXE%"
    timeout /t 12 /nobreak >nul
  )
)

"%LMS%" server stop >nul 2>nul
timeout /t 2 /nobreak >nul
"%LMS%" server start --port 1234 --cors
if errorlevel 1 (
  echo.
  echo Could not start LM Studio server.
  echo Open LM Studio, wait until it finishes launching, then run this file again.
  pause
  exit /b 1
)
echo.
"%LMS%" server status
echo.

echo [2/3] Preparing ComfyUI with CORS...
if not exist "%COMFY_PY%" (
  echo ComfyUI Python was not found:
  echo   %COMFY_PY%
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue; if (-not $listener) { exit 0 }; try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8188/system_stats' -Headers @{ Origin = 'https://olyyarm.github.io' } -UseBasicParsing -TimeoutSec 5; if ($response.Headers['Access-Control-Allow-Origin']) { exit 2 } } catch {}; exit 1"
if errorlevel 2 (
  echo ComfyUI is already running with CORS.
  goto canva_story_start
)
if errorlevel 1 (
  echo Port 8188 is busy, but the running ComfyUI does not expose CORS.
  echo Close the current ComfyUI window/process, then run this file again.
  pause
  exit /b 1
)

echo Opening ComfyUI in a separate window...
start "ComfyUI for CANVA STORY" /D "%COMFY_ROOT%" cmd /k ".\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --front-end-version Comfy-Org/ComfyUI_frontend@latest --enable-cors-header *"

echo Waiting for ComfyUI readiness...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddSeconds(90); while ((Get-Date) -lt $deadline) { try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8188/system_stats' -Headers @{ Origin = 'https://olyyarm.github.io' } -UseBasicParsing -TimeoutSec 5; if ($response.Headers['Access-Control-Allow-Origin']) { exit 0 } } catch {}; Start-Sleep -Seconds 2 }; exit 1"
if errorlevel 1 (
  echo ComfyUI window was opened, but it is still loading.
  echo You can continue after the ComfyUI window says it is ready.
)
echo.

:canva_story_start
echo.
echo [3/3] Starting CANVA STORY...
if not exist "node_modules\" (
  echo node_modules was not found. Installing dependencies first...
  npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue; if ($listener) { exit 2 }"
if errorlevel 2 (
  echo CANVA STORY dev server is already running.
  goto open_canva_story
)

echo Opening CANVA STORY dev server in a separate window...
start "CANVA STORY dev server" cmd /k "cd /d ""%~dp0"" && npm run dev -- --host 127.0.0.1 --port 5173"

echo Waiting for CANVA STORY readiness...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddSeconds(60); while ((Get-Date) -lt $deadline) { try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/CANVA_STORY_/' -UseBasicParsing -TimeoutSec 5; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 2 }; exit 1"
if errorlevel 1 (
  echo CANVA STORY is still starting. Open it manually in a moment:
  echo   %CANVA_URL%
  echo.
  pause
  exit /b 1
)

:open_canva_story
echo.
echo Opening CANVA STORY in your browser...
start "" "%CANVA_URL%"
echo.
echo Local stack is ready.
echo Keep the ComfyUI and CANVA STORY windows open while working.
echo.
pause
