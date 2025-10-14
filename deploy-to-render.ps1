# Quick Deploy to Render Script
# Usage: .\deploy-to-render.ps1

Write-Host "🚀 Deploy to Render - Quick Fix" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan
Write-Host ""

# Check if git is installed
try {
    git --version | Out-Null
} catch {
    Write-Host "❌ Git is not installed!" -ForegroundColor Red
    Write-Host "   Please install Git first: https://git-scm.com" -ForegroundColor Yellow
    exit 1
}

# Check if we're in a git repo
if (!(Test-Path ".git")) {
    Write-Host "❌ Not a git repository!" -ForegroundColor Red
    Write-Host "   Please run this from your project root" -ForegroundColor Yellow
    exit 1
}

Write-Host "📊 Current Git Status:" -ForegroundColor Cyan
git status --short

Write-Host ""
Write-Host "📝 Changes to deploy:" -ForegroundColor Yellow
Write-Host "   ✅ Fixed QR code generation" -ForegroundColor Green
Write-Host "   ✅ Stale sessions auto-clear" -ForegroundColor Green
Write-Host "   ✅ Fresh QR codes generate properly" -ForegroundColor Green
Write-Host ""

# Ask for confirmation
$confirm = Read-Host "Do you want to commit and push these changes? (y/n)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "❌ Deployment cancelled" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "Step 1: Adding files..." -ForegroundColor Cyan
git add .

Write-Host "Step 2: Committing changes..." -ForegroundColor Cyan
$commitMessage = "fix: QR code generation - clear stale sessions and force fresh QR"
git commit -m "$commitMessage"

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Nothing to commit or commit failed" -ForegroundColor Yellow
    Write-Host "   Checking if changes already committed..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 3: Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Push failed. Trying 'master' branch..." -ForegroundColor Yellow
    git push origin master
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to push to GitHub" -ForegroundColor Red
        Write-Host "   Please check your git remote configuration" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""
Write-Host "===============================" -ForegroundColor Cyan
Write-Host "✅ Deployment Triggered!" -ForegroundColor Green
Write-Host ""
Write-Host "🔄 Render will now:" -ForegroundColor Cyan
Write-Host "   1. Detect the push (within 1-2 minutes)" -ForegroundColor White
Write-Host "   2. Start building (2-3 minutes)" -ForegroundColor White
Write-Host "   3. Deploy new version (1-2 minutes)" -ForegroundColor White
Write-Host ""
Write-Host "⏱️  Total time: ~5-7 minutes" -ForegroundColor Yellow
Write-Host ""
Write-Host "📊 Monitor deployment:" -ForegroundColor Cyan
Write-Host "   https://dashboard.render.com" -ForegroundColor Blue
Write-Host ""
Write-Host "🧪 After deployment completes:" -ForegroundColor Cyan
Write-Host "   1. Check logs in Render Dashboard" -ForegroundColor White
Write-Host "   2. Test QR generation" -ForegroundColor White
Write-Host "   3. Look for these logs:" -ForegroundColor White
Write-Host "      ✅ Baileys client created" -ForegroundColor Green
Write-Host "      📱 QR already available" -ForegroundColor Green
Write-Host "      ✅ QR updated in database" -ForegroundColor Green
Write-Host ""
Write-Host "📚 Detailed guide: RENDER_DEPLOYMENT_GUIDE.md" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan

