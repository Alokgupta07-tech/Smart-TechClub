# Setup Database Script for Lockdown HQ
# Run this AFTER installing MySQL

Write-Host "=== Lockdown HQ Database Setup ===" -ForegroundColor Green
Write-Host ""

# Get MySQL path
$mysqlPath = Read-Host "Enter path to mysql.exe (or press Enter if it's in PATH)"
if ([string]::IsNullOrWhiteSpace($mysqlPath)) {
    $mysqlPath = "mysql"
}

# Get MySQL password
$password = Read-Host "Enter MySQL root password" -AsSecureString
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))

Write-Host ""
Write-Host "Creating database..." -ForegroundColor Yellow

# Create database
$createDb = "CREATE DATABASE IF NOT EXISTS lockdown_hq;"
echo $createDb | & $mysqlPath -u root -p"$plainPassword"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Database created successfully" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "Running schema..." -ForegroundColor Yellow
    
    # Run schema
    Get-Content "server\migrations\schema.sql" | & $mysqlPath -u root -p"$plainPassword" lockdown_hq
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Schema created successfully" -ForegroundColor Green
        
        Write-Host ""
        Write-Host "Updating .env file..." -ForegroundColor Yellow
        
        # Update .env
        $envPath = "server\.env"
        $envContent = Get-Content $envPath -Raw
        $envContent = $envContent -replace "DB_PASSWORD=.*", "DB_PASSWORD=$plainPassword"
        Set-Content $envPath $envContent
        
        Write-Host "✓ .env updated" -ForegroundColor Green
        Write-Host ""
        Write-Host "=== Setup Complete! ===" -ForegroundColor Green
        Write-Host "You can now start the backend server with: cd server; npm run dev" -ForegroundColor Cyan
    } else {
        Write-Host "✗ Schema creation failed" -ForegroundColor Red
    }
} else {
    Write-Host "✗ Database creation failed" -ForegroundColor Red
    Write-Host "Make sure MySQL is running and credentials are correct" -ForegroundColor Yellow
}
