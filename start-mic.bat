@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title PhoneMic - game microphone

echo.
echo   ==================================================
echo      PhoneMic  -  game microphone mode
echo   ==================================================
echo.
echo   Needs VB-Audio Virtual Cable (free, install once):
echo      https://vb-audio.com/Cable/
echo   In your game, pick this as the microphone:
echo      CABLE Output (VB-Audio Virtual Cable)
echo.

if not exist "server.js" (
  echo   [X] server.js not found in: %CD%
  echo       Put start-mic.bat next to server.js and run it again.
  goto done
)

where node >nul 2>&1
if errorlevel 1 goto no_node

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo   Node.js !NODEVER!
echo.

if not exist "node_modules\ws" (
  echo   First run: installing dependencies, please wait...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 goto npm_fail
  echo.
)

echo   Starting in game microphone mode...
echo.
node server.js --mic %*
set CODE=%ERRORLEVEL%

echo.
if not "%CODE%"=="0" (
  echo   [X] Server exited with code %CODE%
  echo       If it says no virtual cable was found, install it first.
) else (
  echo   Server stopped.
)
goto done

:no_node
echo   [X] Node.js was not found.
echo.
echo       Install the LTS version from https://nodejs.org
echo       then run this file again.
echo.
goto done

:npm_fail
echo.
echo   [X] npm install failed. Check your network, or try:
echo       npm config set registry https://registry.npmmirror.com
echo.

:done
echo.
echo   Press any key to close this window...
pause >nul
endlocal
