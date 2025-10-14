# Quick Fix Script for QR Code Generation Issue
# Run this: .\quick-fix.ps1

Write-Host "🔧 WhatsApp QR Code Quick Fix" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Clear old session data
Write-Host "Step 1: Clearing old session data..." -ForegroundColor Yellow
if (Test-Path "backend\data\baileys_*") {
    Remove-Item -Path "backend\data\baileys_*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Cleared old baileys session data" -ForegroundColor Green
} else {
    Write-Host "✅ No old session data to clear" -ForegroundColor Green
}

# Step 2: Ensure data directory exists
Write-Host ""
Write-Host "Step 2: Checking data directory..." -ForegroundColor Yellow
if (!(Test-Path "backend\data")) {
    New-Item -ItemType Directory -Path "backend\data" -Force | Out-Null
    Write-Host "✅ Created backend\data directory" -ForegroundColor Green
} else {
    Write-Host "✅ Data directory exists" -ForegroundColor Green
}

# Step 3: Check if .env exists
Write-Host ""
Write-Host "Step 3: Checking environment variables..." -ForegroundColor Yellow
if (Test-Path "backend\.env") {
    Write-Host "✅ Backend .env file exists" -ForegroundColor Green
} else {
    Write-Host "⚠️  Backend .env file missing!" -ForegroundColor Red
    Write-Host "   Creating from template..." -ForegroundColor Yellow
    if (Test-Path "backend\env.example") {
        Copy-Item "backend\env.example" "backend\.env"
        Write-Host "   ⚠️  Please edit backend\.env with your credentials" -ForegroundColor Yellow
    }
}

# Step 4: Check Node.js
Write-Host ""
Write-Host "Step 4: Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js $nodeVersion detected" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found! Please install Node.js" -ForegroundColor Red
    exit 1
}

# Step 5: Install dependencies
Write-Host ""
Write-Host "Step 5: Checking dependencies..." -ForegroundColor Yellow
Set-Location backend
if (!(Test-Path "node_modules")) {
    Write-Host "📥 Installing backend dependencies..." -ForegroundColor Cyan
    npm install --silent
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
} else {
    Write-Host "✅ Dependencies already installed" -ForegroundColor Green
}
Set-Location ..

Write-Host ""
Write-Host "=============================" -ForegroundColor Cyan
Write-Host "✅ Fix Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Make sure backend\.env has correct credentials" -ForegroundColor White
Write-Host "2. Start backend: cd backend; npm start" -ForegroundColor White
Write-Host "3. Test QR generation" -ForegroundColor White
Write-Host ""
Write-Host "🧪 To test immediately:" -ForegroundColor Cyan
Write-Host "   cd backend" -ForegroundColor Yellow
Write-Host "   npm start" -ForegroundColor Yellow
Write-Host ""
Write-Host "📚 For detailed testing guide, see: TEST_QR_FIX.md" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

