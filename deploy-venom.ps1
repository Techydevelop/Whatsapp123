# Venom-bot Deployment Script for Render
# Run this in PowerShell

Write-Host "🐍 Venom-bot Deployment to Render" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green
Write-Host ""

# Check if we're in the right directory
if (-Not (Test-Path "backend/server.js")) {
    Write-Host "❌ Error: Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Project directory confirmed" -ForegroundColor Green
Write-Host ""

# Git status check
Write-Host "📊 Checking git status..." -ForegroundColor Cyan
git status --short

Write-Host ""
Write-Host "🔍 Files to be deployed:" -ForegroundColor Yellow
Write-Host "  - backend/lib/venom-wa.js (NEW)" -ForegroundColor White
Write-Host "  - backend/lib/wa-manager.js (UPDATED)" -ForegroundColor White
Write-Host "  - backend/package.json (UPDATED)" -ForegroundColor White
Write-Host "  - render.yaml (UPDATED)" -ForegroundColor White
Write-Host "  - WPPConnect files (REMOVED)" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Ready to deploy to Render? (yes/no)"

if ($confirm -ne "yes") {
    Write-Host "❌ Deployment cancelled" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "📦 Adding files to git..." -ForegroundColor Cyan
git add .

Write-Host ""
Write-Host "💾 Committing changes..." -ForegroundColor Cyan
git commit -m "Migrated to Venom-bot - Stable WhatsApp API for Render"

Write-Host ""
Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📱 Render will now automatically deploy your app" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🔗 Next Steps:" -ForegroundColor Cyan
    Write-Host "  1. Go to Render dashboard: https://dashboard.render.com/" -ForegroundColor White
    Write-Host "  2. Wait for build to complete (5-10 minutes)" -ForegroundColor White
    Write-Host "  3. Check logs for: '📱 WhatsApp Provider: VENOM-BOT'" -ForegroundColor White
    Write-Host "  4. Test QR generation from your frontend" -ForegroundColor White
    Write-Host "  5. Scan QR with WhatsApp" -ForegroundColor White
    Write-Host ""
    Write-Host "📖 See VENOM_SETUP.md for complete guide" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Push failed! Check your git configuration" -ForegroundColor Red
    Write-Host ""
}

Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

