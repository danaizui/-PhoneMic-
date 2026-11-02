@echo off
setlocal
cd /d "%~dp0"
title PhoneMic - audio routing check

if not exist "server.js" (
  echo   [X] server.js not found in: %CD%
  goto done
)

where node >nul 2>&1
if errorlevel 1 goto no_node

node server.js --doctor
echo.
echo   Tip: fix Windows settings, then run this file again to re-check.
echo.

:done
echo   Press any key to close this window...
pause >nul
endlocal
goto :eof

:no_node
echo   [X] Node.js was not found. Install it from https://nodejs.org
goto done
