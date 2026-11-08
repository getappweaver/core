# AppWeaver Automated Windows Installer (PowerShell)
# Usage:
#   irm https://getappweaver.com/install.ps1 | iex
#   powershell -ExecutionPolicy Bypass -File install.ps1

function Install-AppWeaver {
    $ErrorActionPreference = 'Stop'

    $TargetDir = if ($env:APPWEAVER_DIR) { $env:APPWEAVER_DIR } else { "appweaver" }
    $SkipDeps = if ($env:APPWEAVER_SKIP_DEPS) { $env:APPWEAVER_SKIP_DEPS } else { "0" }
    $NoStart = if ($env:APPWEAVER_NO_START) { $env:APPWEAVER_NO_START } else { "0" }

    # Refresh session PATH from Machine and User environment variables
    function Refresh-SessionPath {
        $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        $env:Path = "$userPath;$machinePath"

        if (Test-Path "$HOME\.bun\bin") {
            $env:Path = "$HOME\.bun\bin;$env:Path"
        }
        if (Test-Path "$HOME\.local\bin") {
            $env:Path = "$HOME\.local\bin;$env:Path"
        }
        if ($env:LOCALAPPDATA -and (Test-Path "$env:LOCALAPPDATA\Programs\ngit")) {
            $env:Path = "$env:LOCALAPPDATA\Programs\ngit;$env:Path"
        }
    }

    Refresh-SessionPath

    Write-Host ""
    Write-Host "Installing AppWeaver (Windows)" -ForegroundColor Cyan
    Write-Host ""

    # Step 1: Pre-requisite checks (Git)
    Write-Host "==> Checking essential tools..." -ForegroundColor Cyan

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Host "Error: 'git' is required to install AppWeaver." -ForegroundColor Red
        Write-Host "Please install Git and rerun this script." -ForegroundColor Yellow
        Write-Host "  Using winget: winget install --id Git.Git -e --source winget" -ForegroundColor Yellow
        Write-Host "  Or download from: https://git-scm.com/download/win" -ForegroundColor Yellow
        throw "'git' is required to install AppWeaver."
    }
    Write-Host "  ✓ Git detected." -ForegroundColor Green

    # Step 2: Auto-install Dependencies (Bun, OpenCode, ngit)
    if ($SkipDeps -eq "1") {
        Write-Host "==> Skipping automatic dependency installation (APPWEAVER_SKIP_DEPS=1)." -ForegroundColor Cyan
    } else {
        # Bun
        if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
            Write-Host "==> Installing Bun runtime..." -ForegroundColor Cyan
            irm https://bun.sh/install.ps1 | iex
            Refresh-SessionPath

            if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
                throw "Bun was installed but cannot be executed in this session."
            }
            $installedBunVer = try { (bun --version) } catch { "installed" }
            Write-Host "  ✓ Bun installed successfully ($installedBunVer)." -ForegroundColor Green
        } else {
            $existingBunVer = try { (bun --version) } catch { "detected" }
            Write-Host "  ✓ Bun is already installed ($existingBunVer)." -ForegroundColor Green
        }

        # OpenCode (AI backend)
        if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) {
            Write-Host "==> Installing OpenCode AI runtime..." -ForegroundColor Cyan
            try {
                bun install -g opencode-ai
            } catch {
                Write-Host "  ! Global bun install of opencode-ai encountered an issue: $_" -ForegroundColor Yellow
            }
            Refresh-SessionPath

            if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) {
                Write-Host "  ! OpenCode was installed, but 'opencode' was not immediately found in session PATH." -ForegroundColor Yellow
            } else {
                Write-Host "  ✓ OpenCode installed successfully." -ForegroundColor Green
            }
        } else {
            Write-Host "  ✓ OpenCode is already installed." -ForegroundColor Green
        }

        # ngit (Nostr Git remotes & app updates)
        if (-not (Get-Command ngit -ErrorAction SilentlyContinue)) {
            Write-Host "==> Installing ngit (Nostr Git remote helper)..." -ForegroundColor Cyan
            try {
                iwr -useb https://ngit.dev/install.ps1 | iex
            } catch {
                Write-Host "  ! ngit installer script encountered an issue: $_" -ForegroundColor Yellow
            }
            Refresh-SessionPath

            if (-not (Get-Command ngit -ErrorAction SilentlyContinue)) {
                Write-Host "  ! ngit installer completed, but 'ngit' was not immediately found in session PATH." -ForegroundColor Yellow
            } else {
                Write-Host "  ✓ ngit installed successfully." -ForegroundColor Green
            }
        } else {
            Write-Host "  ✓ ngit is already installed." -ForegroundColor Green
        }
    }

    # Step 3: Clone & Install AppWeaver
    Write-Host "==> Setting up AppWeaver repository in '$TargetDir'..." -ForegroundColor Cyan

    if (Test-Path $TargetDir) {
        if ((Test-Path "$TargetDir\package.json") -and (Test-Path "$TargetDir\.git")) {
            Write-Host "  ! Target directory '$TargetDir' already contains an existing AppWeaver installation." -ForegroundColor Yellow
            Write-Host "==> Updating dependencies in existing directory..." -ForegroundColor Cyan
            Push-Location $TargetDir
            try {
                bun install
                if ($LASTEXITCODE -ne 0) {
                    throw "bun install failed with exit code $LASTEXITCODE"
                }
            } finally {
                Pop-Location
            }
        } elseif (@(Get-ChildItem -Path $TargetDir -Force).Count -gt 0) {
            throw "Target directory '$TargetDir' already exists and is not empty. Please specify a different directory with APPWEAVER_DIR."
        } else {
            git clone --depth=1 https://github.com/getappweaver/core.git $TargetDir
            if ($LASTEXITCODE -ne 0) {
                throw "git clone failed with exit code $LASTEXITCODE"
            }
            Push-Location $TargetDir
            try {
                bun install
                if ($LASTEXITCODE -ne 0) {
                    throw "bun install failed with exit code $LASTEXITCODE"
                }
            } finally {
                Pop-Location
            }
        }
    } else {
        git clone --depth=1 https://github.com/getappweaver/core.git $TargetDir
        if ($LASTEXITCODE -ne 0) {
            throw "git clone failed with exit code $LASTEXITCODE"
        }
        Push-Location $TargetDir
        try {
            bun install
            if ($LASTEXITCODE -ne 0) {
                throw "bun install failed with exit code $LASTEXITCODE"
            }
        } finally {
            Pop-Location
        }
    }

    Write-Host "  ✓ AppWeaver core installed and dependencies prepared." -ForegroundColor Green

    # Step 4: Summary Banner
    $bunVer = try { (bun --version) } catch { "not found" }
    $opencodeVer = try { (opencode --version) } catch { "installed" }
    $gitVer = try { (git --version) } catch { "not found" }
    $ngitVer = try { (ngit --version) } catch { "installed" }

    Write-Host ""
    Write-Host "✓ AppWeaver installation complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Directory : $TargetDir"
    Write-Host "  Bun       : $bunVer"
    Write-Host "  OpenCode  : $opencodeVer"
    Write-Host "  Git       : $gitVer"
    Write-Host "  ngit      : $ngitVer"
    Write-Host ""
    Write-Host "To start AppWeaver again later: cd $TargetDir; bun run start" -ForegroundColor DarkGray
    Write-Host ""

    if ($NoStart -eq "1") {
        Write-Host "Next steps:" -ForegroundColor White
        Write-Host "  cd $TargetDir"
        Write-Host "  bun run start"
        Write-Host ""
        return
    }

    Write-Host "==> Starting AppWeaver..." -ForegroundColor Cyan
    Set-Location $TargetDir
    bun run start
}

Install-AppWeaver
