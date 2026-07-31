@echo off
setlocal
title LM Studio server for CANVA STORY

set "LMS=%USERPROFILE%\.lmstudio\bin\lms.exe"

if not exist "%LMS%" (
  echo LM Studio CLI was not found:
  echo   %LMS%
  echo.
  echo Open LM Studio once, then try this file again.
  pause
  exit /b 1
)

echo Starting LM Studio local server for CANVA STORY...
echo.
echo Endpoint for CANVA STORY:
echo   http://localhost:1234
echo.
echo CORS will be enabled for browser access from GitHub Pages.
echo.

"%LMS%" server stop >nul 2>nul
timeout /t 2 /nobreak >nul
"%LMS%" server start --port 1234 --cors

echo.
"%LMS%" server status
echo.
echo Keep LM Studio open while CANVA STORY uses local models.
pause
