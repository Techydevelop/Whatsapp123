# WhatsApp-GHL Integration Setup Script (PowerShell)
# Usage: .\setup.ps1

Write-Host "🚀 WhatsApp-GHL Integration Setup Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js $nodeVersion detected" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js 18+ first." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Backend Setup
Write-Host "📦 Setting up Backend..." -ForegroundColor Cyan
Write-Host "------------------------" -ForegroundColor Cyan

if (!(Test-Path "backend\.env")) {
    Write-Host "⚠️  Backend .env file not found. Creating from template..." -ForegroundColor Yellow
    Copy-Item "backend\env.example" "backend\.env"
    Write-Host "✅ Created backend\.env" -ForegroundColor Green
    Write-Host "⚠️  Please edit backend\.env with your actual values" -ForegroundColor Yellow
} else {
    Write-Host "✅ Backend .env file exists" -ForegroundColor Green
}

# Create data directory
if (!(Test-Path "backend\data")) {
    New-Item -ItemType Directory -Path "backend\data" | Out-Null
    Write-Host "✅ Created backend\data directory" -ForegroundColor Green
} else {
    Write-Host "✅ Backend data directory exists" -ForegroundColor Green
}

# Install backend dependencies
Set-Location backend
if (!(Test-Path "node_modules")) {
    Write-Host "📥 Installing backend dependencies..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Backend dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to install backend dependencies" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
} else {
    Write-Host "✅ Backend dependencies already installed" -ForegroundColor Green
}
Set-Location ..

Write-Host ""

# Frontend Setup
Write-Host "🎨 Setting up Frontend..." -ForegroundColor Cyan
Write-Host "-------------------------" -ForegroundColor Cyan

if (!(Test-Path "frontend\.env.local")) {
    Write-Host "⚠️  Frontend .env.local file not found. Creating template..." -ForegroundColor Yellow
    @"
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Backend API URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001

# App Configuration
NEXT_PUBLIC_APP_NAME=WhatsApp GHL Integration
"@ | Out-File -FilePath "frontend\.env.local" -Encoding UTF8
    Write-Host "✅ Created frontend\.env.local" -ForegroundColor Green
    Write-Host "⚠️  Please edit frontend\.env.local with your actual values" -ForegroundColor Yellow
} else {
    Write-Host "✅ Frontend .env.local file exists" -ForegroundColor Green
}

# Install frontend dependencies
Set-Location frontend
if (!(Test-Path "node_modules")) {
    Write-Host "📥 Installing frontend dependencies..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Frontend dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to install frontend dependencies" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
} else {
    Write-Host "✅ Frontend dependencies already installed" -ForegroundColor Green
}
Set-Location ..

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Edit backend\.env with your Supabase and GHL credentials"
Write-Host "2. Edit frontend\.env.local with your Supabase credentials"
Write-Host "3. Create Supabase tables (see SETUP_GUIDE.md)"
Write-Host "4. Start backend: cd backend; npm start"
Write-Host "5. Start frontend: cd frontend; npm run dev"
Write-Host ""
Write-Host "📚 For detailed instructions, see SETUP_GUIDE.md" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

