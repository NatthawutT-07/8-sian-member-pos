@echo off
cd /d "%~dp0"
"%~dp0pos\node_modules\electron\dist\electron.exe" "%~dp0chef-windows\main.cjs"
