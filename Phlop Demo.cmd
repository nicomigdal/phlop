@echo off
rem Launches Phlop with the synthetic demo data (separate storage from the real local data).
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm ci || goto :error
)
call npm run demo
goto :eof
:error
echo Failed to install dependencies.
pause
