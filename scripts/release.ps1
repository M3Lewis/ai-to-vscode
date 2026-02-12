# release.ps1
# 自动化打包与发布脚本

$ErrorActionPreference = "Stop"

# 1. 检查必要环境
Write-Host "Checking environment... " -NoNewline
if (!(Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found. Please install Node.js. "
}
Write-Host "OK" -ForegroundColor Green

# 2. 获取当前版本号
$manifestPath = Join-Path $PSScriptRoot "..\chrome-ext\public\manifest.json"
if (!(Test-Path $manifestPath)) {
    Write-Error "manifest.json not found at $manifestPath"
}
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$version = $manifest.version
Write-Host "Detected version: v$version " -ForegroundColor Green

# 3. 创建发布输出目录
$releaseDir = Join-Path $PSScriptRoot "..\releases\v$version"
if (Test-Path $releaseDir) {
    Write-Host "Cleaning existing directory: $releaseDir " -ForegroundColor Yellow
    Remove-Item -Path $releaseDir -Recurse -Force
}
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

# 4. 打包 Chrome 扩展
Write-Host "Building Chrome extension... " -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "..\chrome-ext")
try {
    if (!(Test-Path "node_modules")) {
        Write-Host "node_modules missing, running npm install..." -ForegroundColor Yellow
        npm install
    }
    npm run build
    $zipPath = Join-Path $releaseDir "ai-to-vscode-chrome-ext-v$version.zip"
    Write-Host "Compressing dist folder... " -ForegroundColor Gray
    Compress-Archive -Path "dist\*" -DestinationPath $zipPath -Force
} finally {
    Pop-Location
}

# 5. 打包 VS Code 扩展
Write-Host "Building VS Code extension... " -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "..\vscode-ext")
try {
    if (!(Test-Path "node_modules")) {
        Write-Host "node_modules missing, running npm install..." -ForegroundColor Yellow
        npm install
    }
    Write-Host "Running npx vsce package... " -ForegroundColor Gray
    npx vsce package --out $releaseDir
    $vsixFiles = Get-ChildItem -Path $releaseDir -Filter "*.vsix"
    if ($vsixFiles.Count -gt 0) {
        $vsixPath = $vsixFiles[0].FullName
        $newVsixPath = Join-Path $releaseDir "ai-to-vscode-vscode-ext-v$version.vsix"
        Move-Item -Path $vsixPath -Destination $newVsixPath -Force
    }
} finally {
    Pop-Location
}

Write-Host "Packaging complete! Artifacts in: $releaseDir " -ForegroundColor Green
Get-ChildItem $releaseDir | Select-Object Name, Length

# 6. GitHub Release
Write-Host "Preparing GitHub Release... " -ForegroundColor Cyan
$releasePath = (Get-Item $releaseDir).FullName
$assets = Join-Path $releasePath "*"
$ghCmd = "gh release create v$version ""$assets"" --title ""v$version"" --notes ""Release v$version"""

if (Get-Command gh -ErrorAction SilentlyContinue) {
    $hasGh = $true
} else {
    Write-Host "GitHub CLI (gh) not found." -ForegroundColor Yellow
    $method = Read-Host "How would you like to install gh? [1] winget (Recommended) [2] scoop [3] Show download link [N] Skip"
    
    if ($method -eq '1') {
        Write-Host "Installing via winget..." -ForegroundColor Gray
        winget install --id GitHub.cli --silent --accept-source-agreements --accept-package-agreements
    } elseif ($method -eq '2') {
        if (Get-Command scoop -ErrorAction SilentlyContinue) {
            Write-Host "Installing via scoop..." -ForegroundColor Gray
            scoop install gh
        } else {
            Write-Host "Scoop not found. Please install scoop first at https://scoop.sh/." -ForegroundColor Red
        }
    } elseif ($method -eq '3') {
        Write-Host "Please download and install from: https://github.com/cli/cli/releases/latest" -ForegroundColor Cyan
        Read-Host "Press Enter after you have installed and added 'gh' to your PATH"
    }

    # Refresh path and check again
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    if (Get-Command gh -ErrorAction SilentlyContinue) {
        Write-Host "gh CLI discovered!" -ForegroundColor Green
        $hasGh = $true
    } else {
        Write-Host "gh CLI still not found in current session." -ForegroundColor Red
        $hasGh = $false
    }
}

if ($hasGh) {
    $choice = Read-Host "Create release now? (y/N)"
    if ($choice -eq 'y') {
        Write-Host "Running: $ghCmd "
        Invoke-Expression $ghCmd
    } else {
        Write-Host "Release skipped. "
    }
} else {
    Write-Host "To release manually, use the following command: " -ForegroundColor Yellow
    Write-Host $ghCmd -ForegroundColor Gray
}
