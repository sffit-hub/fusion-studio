$ErrorActionPreference = "Stop"

$baseDir = $PSScriptRoot
$configPath = Join-Path $baseDir "config.json"
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$logPath = Join-Path $baseDir "fusion-catraca-autonoma.log"

function Write-AutoLog {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date).ToString("s"), $Message
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
  Write-Output $line
}

function Get-NodePath {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($null -eq $node) {
    throw "Node.js nao encontrado. Instale o Node.js antes de iniciar a portaria automatica."
  }
  return $node.Source
}

function Test-ConnectorRunning {
  $processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  foreach ($process in $processes) {
    $cmd = [string]$process.CommandLine
    if ($cmd -and $cmd.Contains("connector.mjs") -and $cmd.Contains($baseDir)) {
      return $true
    }
  }
  return $false
}

function Start-Henry {
  $henryPath = [string]$config.driver.henryUiPrep.henryProgramPath
  $henryRunning = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "Henry7x*" })
  if ($henryRunning.Count -gt 0) {
    Write-AutoLog "Henry7x ja estava aberto."
    return
  }

  if (-not (Test-Path -LiteralPath $henryPath)) {
    throw "Programa Henry nao encontrado em: $henryPath"
  }

  Write-AutoLog "Abrindo Henry7x..."
  Start-Process -FilePath $henryPath | Out-Null
  Start-Sleep -Seconds 12
}

function Prepare-Henry {
  $script = Join-Path $baseDir "preparar-tela-henry.ps1"
  if (-not (Test-Path -LiteralPath $script)) {
    throw "Script preparar-tela-henry.ps1 nao encontrado."
  }

  Write-AutoLog "Preparando tela Henry..."
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script | ForEach-Object { Write-AutoLog $_ }
}

function Start-Connector {
  $node = Get-NodePath
  if (Test-ConnectorRunning) {
    Write-AutoLog "Conector ja estava rodando."
    return
  }

  $connector = Join-Path $baseDir "connector.mjs"
  if (-not (Test-Path -LiteralPath $connector)) {
    throw "connector.mjs nao encontrado."
  }

  Write-AutoLog "Iniciando conector..."
  Start-Process -FilePath $node -ArgumentList "`"$connector`"" -WorkingDirectory $baseDir -WindowStyle Minimized | Out-Null
}

Write-AutoLog "Iniciando portaria automatica Fusion."
Start-Henry
Prepare-Henry
Start-Connector
Write-AutoLog "Portaria automatica pronta."
