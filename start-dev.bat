@echo off
echo ============================================
echo    Lockdown HQ - Development Startup
echo ============================================

REM Stop any existing Apache processes
echo Stopping Apache processes...
taskkill /f /im httpd.exe /t >nul 2>&1

REM Start backend server in new window
echo Starting backend server...
start "Lockdown HQ Backend" cmd /k "cd server && node server.js"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend server in new window
echo Starting frontend server...
start "Lockdown HQ Frontend" cmd /k "npm run dev"

echo ============================================
echo    Servers Started Successfully!
echo ============================================
echo Frontend: http://localhost:5173 (or next available port)
echo Backend:  http://localhost:5000
echo ============================================
echo.
echo Close the server windows to stop them.
echo.
pause