@echo off
setlocal
title CANVA STORY full local stack
cd /d "%~dp0"

set "CANVA_LOCAL_CONFIG=%~dp0start_canva_story_local_config.bat"
if exist "%CANVA_LOCAL_CONFIG%" call "%CANVA_LOCAL_CONFIG%"

rem === Machine-specific settings ==========================================
rem Override these defaults in start_canva_story_local_config.bat on each PC.
if not defined CANVA_PORT set "CANVA_PORT=5173"
if not defined CANVA_HOST set "CANVA_HOST=127.0.0.1"
if not defined LM_STUDIO_PORT set "LM_STUDIO_PORT=1234"
if not defined LMS set "LMS=%USERPROFILE%\.lmstudio\bin\lms.exe"
if not defined LM_STUDIO_EXE set "LM_STUDIO_EXE=D:\SD\LM Studio\LM Studio.exe"
if not defined COMFY_PORT set "COMFY_PORT=8188"
if not defined COMFY_ROOT set "COMFY_ROOT=D:\ComfyUI-Omnivorous-T2.6-P312-Cu126"
if not defined JS_PACKAGE_MANAGER set "JS_PACKAGE_MANAGER=npm"
if not defined JS_DEV_COMMAND set "JS_DEV_COMMAND=npm run dev --"
rem =========================================================================

set "CANVA_URL=http://localhost:%CANVA_PORT%/CANVA_STORY_/"
set "LM_STUDIO_URL=http://localhost:%LM_STUDIO_PORT%"
set "COMFY_URL=http://localhost:%COMFY_PORT%"
set "COMFY_PY=%COMFY_ROOT%\python_embeded\python.exe"

echo Starting CANVA STORY local stack...
echo.
echo CANVA STORY:
echo   %CANVA_URL%
echo LM Studio:
echo   %LM_STUDIO_URL%
echo ComfyUI:
echo   %COMFY_URL%
echo.
echo Config:
if exist "%CANVA_LOCAL_CONFIG%" echo   LOCAL_CONFIG=%CANVA_LOCAL_CONFIG%
echo   LM_STUDIO_EXE=%LM_STUDIO_EXE%
echo   COMFY_ROOT=%COMFY_ROOT%
echo   JS_PACKAGE_MANAGER=%JS_PACKAGE_MANAGER%
echo   JS_DEV_COMMAND=%JS_DEV_COMMAND%
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
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = $env:LM_STUDIO_EXE; $running = Get-Process -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -eq $path } catch { $false } }; if (-not $running) { exit 1 }"
  if errorlevel 1 (
    echo Opening LM Studio desktop app...
    start "" "%LM_STUDIO_EXE%"
    timeout /t 12 /nobreak >nul
  )
)

"%LMS%" server stop >nul 2>nul
timeout /t 2 /nobreak >nul
"%LMS%" server start --port %LM_STUDIO_PORT% --cors
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

powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -LocalPort %COMFY_PORT% -State Listen -ErrorAction SilentlyContinue; if (-not $listener) { exit 0 }; try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:%COMFY_PORT%/system_stats' -Headers @{ Origin = 'https://olyyarm.github.io' } -UseBasicParsing -TimeoutSec 5; if ($response.Headers['Access-Control-Allow-Origin']) { exit 2 } } catch {}; exit 1"
if errorlevel 2 (
  echo ComfyUI is already running with CORS.
  goto canva_story_start
)
if errorlevel 1 (
  echo Port %COMFY_PORT% is busy, but the running ComfyUI does not expose CORS.
  echo Close the current ComfyUI window/process, then run this file again.
  pause
  exit /b 1
)

if exist "%COMFY_ROOT%\ComfyUI\custom_nodes\was-node-suite-comfyui\ffmpeg\ffmpeg.exe" (
  set "PATH=%COMFY_ROOT%\ComfyUI\custom_nodes\was-node-suite-comfyui\ffmpeg;%PATH%"
)

echo Opening ComfyUI in a separate window...
start "ComfyUI for CANVA STORY" /D "%COMFY_ROOT%" cmd /k ".\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --front-end-version Comfy-Org/ComfyUI_frontend@latest --listen 127.0.0.1 --port %COMFY_PORT% --enable-cors-header *"

echo Waiting for ComfyUI readiness...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddSeconds(90); while ((Get-Date) -lt $deadline) { try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:%COMFY_PORT%/system_stats' -Headers @{ Origin = 'https://olyyarm.github.io' } -UseBasicParsing -TimeoutSec 5; if ($response.Headers['Access-Control-Allow-Origin']) { exit 0 } } catch {}; Start-Sleep -Seconds 2 }; exit 1"
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
  call "%JS_PACKAGE_MANAGER%" install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -LocalPort %CANVA_PORT% -State Listen -ErrorAction SilentlyContinue; if ($listener) { exit 2 }"
if errorlevel 2 (
  echo CANVA STORY dev server is already running.
  goto open_canva_story
)

echo Opening CANVA STORY dev server in a separate window...
start "CANVA STORY dev server" /D "%~dp0" cmd.exe /d /k %JS_DEV_COMMAND% --host %CANVA_HOST% --port %CANVA_PORT%

echo Waiting for CANVA STORY readiness...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddSeconds(60); while ((Get-Date) -lt $deadline) { try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:%CANVA_PORT%/CANVA_STORY_/' -UseBasicParsing -TimeoutSec 5; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 2 }; exit 1"
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
