@echo off
echo ==========================================
echo      PAYMENT APP AUTO-BACKUP SCRIPT
echo ==========================================
echo.

:: Set the path to git executable
set "GIT_PATH=C:\Users\MattewAninga\AppData\Local\Programs\Git\cmd\git.exe"

:: Navigate to the script's directory (project root)
cd /d "%~dp0"

:: Check if .git directory exists
if not exist ".git" (
    echo Git repository not initialized. Initializing...
    "%GIT_PATH%" init
    "%GIT_PATH%" remote add origin https://github.com/aningamatthew21-gif/payment-app.git
)

echo Adding all files to staging...
"%GIT_PATH%" add .

echo.
echo Committing changes...
:: Get current date and time for the commit message
set "timestamp=%date% %time%"
"%GIT_PATH%" commit -m "Auto backup: %timestamp%"

echo.
echo Pushing to GitHub...
"%GIT_PATH%" push origin main

echo.
echo ==========================================
if %errorlevel% equ 0 (
    echo      BACKUP SUCCESSFUL!
) else (
    echo      BACKUP FAILED! Please check errors above.
)
echo ==========================================
echo.
pause
