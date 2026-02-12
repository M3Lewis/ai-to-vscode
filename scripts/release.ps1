# release.ps1
# 自动化打包与发布脚本

$ErrorActionPreference = "Stop"

# 1. 检查必要环境
Write-Host "🔍 检查环境..." -ForegroundColor Cyan
if (!(Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "未找到 npm，请先安装 Node.js"
}

# 2. 获取当前版本号 (从 chrome-ext/public/manifest.json 获取)
$manifestPath = Join-Path $PSScriptRoot "..\chrome-ext\public\manifest.json"
if (!(Test-Path $manifestPath)) {
    Write-Error "未找到 manifest.json: $manifestPath"
}
$manifest = Get-Content $manifestPath | ConvertFrom-Json
$version = $manifest.version
Write-Host "🚀 检测到版本号: v$version" -ForegroundColor Green

# 3. 创建发布输出目录
$releaseDir = Join-Path $PSScriptRoot "..\releases\v$version"
if (Test-Path $releaseDir) {
    Write-Host "⚠️ 目录已存在，正在清理: $releaseDir" -ForegroundColor Yellow
    Remove-Item -Path $releaseDir -Recurse -Force
}
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

# 4. 打包 Chrome 扩展
Write-Host "📦 开始打包 Chrome 扩展..." -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "..\chrome-ext")
try {
    npm run build
    $zipPath = Join-Path $releaseDir "ai-to-vscode-chrome-ext-v$version.zip"
    Write-Host "🤐 正在压缩 dist 文件夹..." -ForegroundColor Gray
    Compress-Archive -Path "dist\*" -DestinationPath $zipPath -Force
} finally {
    Pop-Location
}

# 5. 打包 VS Code 扩展
Write-Host "📦 开始打包 VS Code 扩展..." -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "..\vscode-ext")
try {
    # 确保没有 vsce 的警告阻断
    Write-Host "⚙️ 运行 npx vsce package..." -ForegroundColor Gray
    npx vsce package --out $releaseDir
    $vsixPath = Get-ChildItem -Path $releaseDir -Filter "*.vsix" | Select-Object -First 1
    if ($vsixPath) {
        $newVsixPath = Join-Path $releaseDir "ai-to-vscode-vscode-ext-v$version.vsix"
        Rename-Item -Path $vsixPath.FullName -NewName (Split-Path $newVsixPath -Leaf) -Force
    }
} finally {
    Pop-Location
}

Write-Host "`n✅ 打包完成！产物位于: $releaseDir" -ForegroundColor Green
Get-ChildItem $releaseDir | Select-Object Name, Length

# 6. GitHub Release 提示
Write-Host "`n📣 GitHub Release" -ForegroundColor Cyan
$ghCommand = "gh release create v$version $(Join-Path $releaseDir '*') --title `"v$version`" --notes `"Release v$version`""

if (Get-Command gh -ErrorAction SilentlyContinue) {
    $response = Read-Host "检测到 gh CLI，是否直接发布到 GitHub? (y/N)"
    if ($response -eq 'y') {
        Write-Host "🚀 正在运行: $ghCommand" -ForegroundColor Gray
        Invoke-Expression $ghCommand
    } else {
        Write-Host "跳过自动发布。"
    }
} else {
    Write-Host "未检测到 gh CLI，请手动上传产物或使用以下命令：" -ForegroundColor Yellow
    Write-Host "$ghCommand" -ForegroundColor Gray
}
