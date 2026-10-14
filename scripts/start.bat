@echo off
rem XeroBurst: starts the laptop server and the app dev server in two windows. Double-click to run.
cd /d "%~dp0\.."
if not exist node_modules (
  echo First run: installing. This takes a few minutes...
  call npm install || goto :fail
)
if not exist apps\server\data\nboard.db (
  echo No database yet. Creating the Super Admin account...
  call npm run setup || goto :fail
)
start "XeroBurst server" cmd /k "npm run server"
timeout /t 4 >nul
start "XeroBurst app" cmd /k "npm run app"
exit /b 0
:fail
echo Something went wrong. Read the messages above.
pause
