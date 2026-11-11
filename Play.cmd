@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\package.json" (
    call npm.cmd ci --no-audit --no-fund
    if errorlevel 1 goto error
)
if not exist "node_modules\electron\dist\electron.exe" (
    set "electron_config_cache=%~dp0.electron-cache"
    node node_modules\electron\install.js
    if errorlevel 1 goto error
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b
:error
pause
exit /b 1
