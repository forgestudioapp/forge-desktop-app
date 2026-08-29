# ============================================================
#  Forge - Installation complete des pre-requis (Windows)
#  Lance tout ce qu'il faut : Node.js, Python, Roblox Studio,
#  les dependances npm, le rebuild node-pty, le serveur MCP,
#  rembg, puis les agents IA.
#  Usage : powershell -ExecutionPolicy Bypass -File setup.ps1
#  -SkipAgents : n'installe pas les CLI Claude/Codex
# ============================================================
[CmdletBinding()]
param(
  [switch]$SkipAgents
)

$ErrorActionPreference = 'Continue'
$AppDir = Split-Path -Parent $PSScriptRoot
$Ember  = @{ F = 'DarkYellow' }

function Step($title) {
  Write-Host ""
  Write-Host "  === $title ===" -ForegroundColor DarkYellow
}

function Ok($text)   { Write-Host "  [OK]  $text" -ForegroundColor Green }
function Warn($text) { Write-Host "  [..]  $text" -ForegroundColor DarkYellow }
function Err($text)  { Write-Host "  [ERREUR] $text" -ForegroundColor Red }

Write-Host ""
Write-Host "  ===============================================" -ForegroundColor DarkYellow
Write-Host "   FORGE - Installation complete de l'environnement" -ForegroundColor White
Write-Host "  ===============================================" -ForegroundColor DarkYellow

# ---- 1. winget -------------------------------------------------
Step "1/7 - Gestionnaire d'installation (winget)"
$winget = Get-Command winget -ErrorAction SilentlyContinue
if ($winget) {
  Ok "winget detecte."
} else {
  Warn "winget introuvable. Installe le 'Windows App Installer' depuis le Microsoft Store, puis relance ce script."
  Start-Process "https://www.microsoft.com/store/productId/9NBLGGH4NNS1"
}

# ---- 2. Node.js LTS --------------------------------------------
Step "2/7 - Node.js LTS (>= 18)"
$nodeBin = Get-Command node -ErrorAction SilentlyContinue
if ($nodeBin) {
  try { $nodeVersion = (& node --version 2>$null) } catch { $nodeVersion = "" }
  if ($nodeVersion -match 'v?(\d+)') {
    if ([int]$Matches[1] -ge 18) { Ok "Node.js detecte : $nodeVersion" }
    else { Warn "Node.js $nodeVersion present mais trop ancien. Mise a jour vers la LTS..." }
  }
} else {
  Warn "Node.js absent. Installation via winget..."
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -eq 0) {
    Ok "Node.js LTS installe. (Redemarre ton terminal pour que npm soit disponible.)"
  } else {
    Err "L'installation de Node.js a echoue (code $LASTEXITCODE). Telecharge-le sur nodejs.org"
    Start-Process "https://nodejs.org/"
    Start-Sleep -Seconds 2
  }
}

# ---- 3. Python 3 ------------------------------------------------
Step "3/7 - Python 3 (>= 3.9)"
$pyBin = Get-Command python -ErrorAction SilentlyContinue
if ($pyBin) {
  try { $pyVersion = (& python --version 2>$null) } catch { $pyVersion = "" }
  if ($pyVersion -match '(\d+)\.(\d+)') {
    if ([int]$Matches[1] -ge 3 -and [int]$Matches[2] -ge 9) { Ok "Python detecte : $pyVersion" }
    else { Warn "Python $pyVersion trop ancien. Mise a jour..." }
  } else { Warn "python present mais version illisible." }
} else {
  Warn "Python absent. Installation via winget..."
  winget install --id Python.Python.3.12 -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -eq 0) {
    Ok "Python 3.12 installe (optionnel mais recommande pour GenIA Gemini)."
  } else {
    Warn "Echec de l'installation de Python (code $LASTEXITCODE). Il reste optionnel."
  }
}

# ---- 4. Roblox Studio -------------------------------------------
Step "4/7 - Roblox Studio"
$robloxPath = Join-Path $env:LOCALAPPDATA 'Roblox'
if (Test-Path $robloxPath) {
  Ok "Roblox Studio detecte : $robloxPath"
} else {
  Warn "Roblox Studio absent. Installation via winget... (ferme Studio s'il est ouvert)"
  winget install --id Roblox.RobloxStudio -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -eq 0) {
    Ok "Roblox Studio installe."
  } else {
    Warn "Attends la fin de l'installation automatique, ou installe depuis le site officiel."
    Start-Process "https://www.roblox.com/create"
    Start-Sleep -Seconds 2
  }
}

# ---- 5. Dependances du projet -----------------------------------
Step "5/7 - Dependances de Forge (npm install)"
Push-Location $AppDir
try {
  Write-Host "  npm install dans $AppDir ..."
  & npm install
  if ($LASTEXITCODE -eq 0) { Ok "Dependances installees." }
  else { Err "npm install a echoue (code $LASTEXITCODE)." }
} catch {
  Err "npm introuvable : installe Node.js puis relance le script."
}
Pop-Location

# node-pty doit etre recompile pour l'ABI d'Electron (terminal integre).
Step "5b/7 - Rebuild node-pty (terminal integre)"
Push-Location $AppDir
try {
  & npx electron-rebuild -f -w node-pty
  if ($LASTEXITCODE -eq 0) { Ok "node-pty recompile pour Electron." }
  else { Warn "electron-rebuild a echoue (code $LASTEXITCODE) - le terminal ouvrira une fenetre externe en secours." }
} catch {
  Warn "electron-rebuild indisponible - le terminal ouvrira une fenetre externe en secours."
}
Pop-Location

# ---- 5c/7 - rembg (suppression auto de fond) ----------------------
Step "5c/7 - rembg (suppression d'arriere-plan)"
$pyBin = Get-Command python -ErrorAction SilentlyContinue
if ($pyBin) {
  Write-Host "  pip install rembg[cpu,cli] ..."
  & pip install "rembg[cpu,cli]" --quiet
  if ($LASTEXITCODE -eq 0) {
    Ok "rembg installe - suppression de fond auto activee."
  } else {
    Write-Host "  retente avec python -m pip ..."
    & python -m pip install "rembg[cpu,cli]" --quiet
    if ($LASTEXITCODE -eq 0) { Ok "rembg installe via python -m pip." }
    else { Warn "Echec de l'installation de rembg (code $LASTEXITCODE) - la suppression de fond sera indisponible." }
  }
} else {
  Warn "Python absent - rembg ne peut pas etre installe."
}

# ---- 6. Agents IA CLI -------------------------------------------
if ($SkipAgents) {
  Step "6/7 - Agents IA CLI (ignore via -SkipAgents)"
  Warn "Les agents Claude Code / Codex ne sont pas installes."
} else {
  Step "6/7 - Agents IA CLI (Codex + Claude Code)"
  foreach ($pkg in @('@openai/codex', '@anthropic-ai/claude-code')) {
    Write-Host "  npm install -g $pkg ..."
    & npm install -g $pkg
    if ($LASTEXITCODE -eq 0) { Ok "$pkg installe." }
    else { Warn "Echec de $pkg (code $LASTEXITCODE)." }
  }
}

# ---- 7. Serveur MCP (integration Roblox Studio) -----------------
Step "7/7 - Serveur MCP (integration Roblox Studio)"
# Le pont Forge <-> Studio : les agents IA pilotent Studio (execution Lua,
# synchronisation des scripts). Attention : il est build ici (dev) et
# embarqué dans l'app installee par extraResources (package.json).
$McpDir = Join-Path (Split-Path -Parent $AppDir) 'robloxstudio-mcp'
if (Test-Path "$McpDir\package.json") {
  Push-Location $McpDir
  try {
    if (-not (Test-Path "$McpDir\node_modules")) {
      Write-Host "  npm install dans $McpDir ..."
      & npm install --silent
      if ($LASTEXITCODE -ne 0) { Err "npm install du MCP a echoue (code $LASTEXITCODE)." }
    } else {
      Ok "Dependances MCP deja presentes."
    }
    if (-not (Test-Path "$McpDir\dist\index.js")) {
      Write-Host "  Compilation du serveur MCP (tsc) ..."
      & npm run build
      if ($LASTEXITCODE -eq 0) { Ok "Serveur MCP compile." }
      else { Err "npm run build du MCP a echoue (code $LASTEXITCODE)." }
    } else {
      Ok "Serveur MCP deja compile."
    }
  } finally {
    Pop-Location
  }
} else {
  Warn "robloxstudio-mcp introuvable (attendu au cote de forge-desktop-app). L'integration Studio sera indisponible."
}

# ---- Fin -------------------------------------------------------
Write-Host ""
Write-Host "  ===============================================" -ForegroundColor DarkYellow
Write-Host "   TERMINE - reste :" -ForegroundColor White
Write-Host "   1. Cles API : Gemini (aistudio.google.com/app/apikey)" -ForegroundColor Green
Write-Host "   2. Cle Tripo3D : platform.tripo3d.ai (convertit images 2D -> 3D)" -ForegroundColor Green
Write-Host "   3. Ouvre Roblox Studio une fois, puis :" -ForegroundColor Green
Write-Host "      . Game Settings > Security > Allow HTTP Requests = ON" -ForegroundColor Green
Write-Host "      . laisse Studio ouvert avant de lancer Forge" -ForegroundColor Green
Write-Host "   4. Relance Forge (l'onboarding verifie tout)" -ForegroundColor Green
Write-Host "  ===============================================" -ForegroundColor DarkYellow
Write-Host ""