@echo off
setlocal
set "CHEF_CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHEF_CHROME%" set "CHEF_CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHEF_CHROME%" set "CHEF_CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHEF_CHROME%" (
  echo Google Chrome was not found.
  pause
  exit /b 1
)
start "" "%CHEF_CHROME%" --user-data-dir="%LocalAppData%\8SianChefChrome" --disable-print-preview --app="https://8sianracha.com/chef"
endlocal
