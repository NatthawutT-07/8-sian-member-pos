@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0pos\node_modules\electron\dist\electron.exe" (
  echo Chef print runtime is missing. Contact the installer administrator.
  pause
  exit /b 1
)
"%~dp0pos\node_modules\electron\dist\electron.exe" "%~dp0chef-windows\main.cjs"
if errorlevel 1 (
  echo.
  echo Direct printing did not start.
  echo If Windows reports Application Control, the runtime must be signed
  echo and approved under this computer's application policy.
  echo Browser printing is available with open-chef-windows-print.cmd.
  pause
  exit /b 1
)
endlocal
