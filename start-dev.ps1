# Lockdown HQ Development Startup Script
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   Lockdown HQ - Development Startup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Stop any existing Apache processes
Write-Host "Stopping Apache processes..." -ForegroundColor Yellow
Get-Process -Name httpd -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Check if MySQL is running (try to connect)
Write-Host "Checking MySQL connection..." -ForegroundColor Yellow
try {
    $connectionString = "server=localhost;uid=root;pwd=;database=lockdown_hq"
    $connection = New-Object MySql.Data.MySqlClient.MySqlConnection
    $connection.ConnectionString = $connectionString
    $connection.Open()
    $connection.Close()
    Write-Host "MySQL connection successful!" -ForegroundColor Green
} catch {
    Write-Host "Warning: Could not connect to MySQL. Please ensure MySQL is running." -ForegroundColor Yellow
    Write-Host "Continuing anyway - you can start MySQL later..." -ForegroundColor Yellow
}

# Start backend server
Write-Host "Starting backend server..." -ForegroundColor Green
$backendJob = Start-Job -ScriptBlock {
    Set-Location "$using:PWD\server"
    node server.js
} -Name "LockdownBackend"

# Wait a moment for backend to start
Start-Sleep -Seconds 3

# Start frontend server
Write-Host "Starting frontend server..." -ForegroundColor Green
$frontendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    npm run dev
} -Name "LockdownFrontend"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   Servers Started Successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "Backend:  http://localhost:5000" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan

# Keep the script running to show status
Write-Host "`nPress Ctrl+C to stop all servers" -ForegroundColor Yellow
Write-Host "Or close this window to stop servers" -ForegroundColor Yellow
try {
    while ($true) {
        Start-Sleep -Seconds 10
        $backendStatus = Get-Job -Name "LockdownBackend" 2>$null | Select-Object -ExpandProperty State
        $frontendStatus = Get-Job -Name "LockdownFrontend" 2>$null | Select-Object -ExpandProperty State

        if ($backendStatus -and $backendStatus -ne "Running") {
            Write-Host "Backend server stopped. Status: $backendStatus" -ForegroundColor Red
        }
        if ($frontendStatus -and $frontendStatus -ne "Running") {
            Write-Host "Frontend server stopped. Status: $frontendStatus" -ForegroundColor Red
        }
    }
} finally {
    Write-Host "`nStopping servers..." -ForegroundColor Yellow
    Get-Job | Stop-Job -ErrorAction SilentlyContinue
    Get-Job | Remove-Job -ErrorAction SilentlyContinue
}