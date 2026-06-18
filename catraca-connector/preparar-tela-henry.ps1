$ErrorActionPreference = "Stop"

$configPath = Join-Path $PSScriptRoot "config.json"
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$prep = $config.driver.henryUiPrep
$program = $prep.henryProgramPath
$defaultHoldSeconds = 5
if ($config.driver.defaultHoldSeconds) { $defaultHoldSeconds = [int]$config.driver.defaultHoldSeconds }
if ($prep.defaultHoldSeconds) { $defaultHoldSeconds = [int]$prep.defaultHoldSeconds }

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class FusionHenryPrep {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
"@

function Click-At {
  param([int]$X, [int]$Y, [string]$Button = "left")
  [void][FusionHenryPrep]::SetCursorPos($X, $Y)
  Start-Sleep -Milliseconds 150
  if ($Button -eq "right") {
    [FusionHenryPrep]::mouse_event(0x0008, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 80
    [FusionHenryPrep]::mouse_event(0x0010, 0, 0, 0, 0)
  } else {
    [FusionHenryPrep]::mouse_event(0x0002, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 80
    [FusionHenryPrep]::mouse_event(0x0004, 0, 0, 0, 0)
  }
}

function Get-HenryWindows {
  $henryProcesses = @(Get-Process | Where-Object { $_.ProcessName -like "Henry7x*" })
  if (-not $henryProcesses.Count) { return @() }
  $henryIds = @($henryProcesses | ForEach-Object { [uint32]$_.Id })
  $windows = New-Object System.Collections.ArrayList
  [FusionHenryPrep]::EnumWindows({
    param($hwnd, $lparam)
    $windowProcessId = [uint32]0
    [void][FusionHenryPrep]::GetWindowThreadProcessId($hwnd, [ref]$windowProcessId)
    if ($henryIds -contains $windowProcessId) {
      $rect = New-Object FusionHenryPrep+RECT
      [void][FusionHenryPrep]::GetWindowRect($hwnd, [ref]$rect)
      $width = $rect.Right - $rect.Left
      $height = $rect.Bottom - $rect.Top
      $sb = New-Object System.Text.StringBuilder 512
      [void][FusionHenryPrep]::GetWindowText($hwnd, $sb, $sb.Capacity)
      if ([FusionHenryPrep]::IsWindowVisible($hwnd) -and $width -gt 200 -and $height -gt 120) {
        [void]$windows.Add([PSCustomObject]@{
          Handle = $hwnd
          Rect = $rect
          Width = $width
          Height = $height
          Area = $width * $height
          Title = $sb.ToString()
        })
      }
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
  return @($windows)
}

function Activate-Window {
  param($Window)
  [void][FusionHenryPrep]::ShowWindowAsync($Window.Handle, 9)
  [void][FusionHenryPrep]::BringWindowToTop($Window.Handle)
  [void][FusionHenryPrep]::SetForegroundWindow($Window.Handle)
  Start-Sleep -Milliseconds 600
}

function Find-MainWindow {
  $windows = Get-HenryWindows
  return $windows | Sort-Object Area -Descending | Select-Object -First 1
}

function Find-DialogWindow {
  $windows = Get-HenryWindows
  return $windows |
    Where-Object { $_.Width -le 700 -and $_.Height -le 500 } |
    Sort-Object Area |
    Select-Object -First 1
}

function Close-RestorePrompt {
  $windows = Get-HenryWindows
  $prompt = $windows |
    Where-Object { $_.Width -ge 250 -and $_.Width -le 520 -and $_.Height -ge 100 -and $_.Height -le 230 } |
    Sort-Object Area |
    Select-Object -First 1

  if ($null -eq $prompt) { return $false }

  Activate-Window $prompt
  $noX = [int]($prompt.Rect.Left + ($prompt.Width * 0.82))
  $noY = [int]($prompt.Rect.Top + ($prompt.Height * 0.78))
  Click-At -X $noX -Y $noY
  Start-Sleep -Seconds 2
  return $true
}

function Click-RestoreNoOnMain {
  param($MainWindow)
  if ($null -eq $MainWindow) { return }

  # O aviso de restaurar batidas pode travar a tela mesmo quando nao aparece como janela separada.
  # Este ponto cai em cima do botao "Nao" no aviso padrao do Henry7x.
  $restoreNoX = [int]($MainWindow.Rect.Left + ($MainWindow.Width * 0.62))
  $restoreNoY = [int]($MainWindow.Rect.Top + ($MainWindow.Height * 0.61))
  Click-At -X $restoreNoX -Y $restoreNoY
  Start-Sleep -Seconds 1
}

if (-not (Get-Process | Where-Object { $_.ProcessName -like "Henry7x*" })) {
  Start-Process -FilePath $program
  Start-Sleep -Seconds 10
}

$null = Close-RestorePrompt

$main = $null
for ($attempt = 1; $attempt -le 12 -and $null -eq $main; $attempt++) {
  $null = Close-RestorePrompt
  $main = Find-MainWindow
  if ($null -eq $main) { Start-Sleep -Seconds 1 }
}
if ($null -eq $main) { throw "Nao encontrei a janela principal do Henry7x." }
Activate-Window $main

for ($attempt = 1; $attempt -le 3; $attempt++) {
  $closedPrompt = Close-RestorePrompt
  if (-not $closedPrompt) { Click-RestoreNoOnMain $main }
}

$clickX = [int]($main.Rect.Left + [int]$prep.equipmentClickX)
$clickY = [int]($main.Rect.Top + [int]$prep.equipmentClickY)
Click-At -X $clickX -Y $clickY
Start-Sleep -Milliseconds 300
Click-At -X $clickX -Y $clickY -Button right
Start-Sleep -Milliseconds 500

$menuX = [int]($main.Rect.Left + [int]$prep.liberarMenuOffsetX)
$menuY = [int]($main.Rect.Top + [int]$prep.liberarMenuOffsetY)
Click-At -X $menuX -Y $menuY
Start-Sleep -Seconds 2

$dialog = Find-DialogWindow
if ($null -eq $dialog) { throw "Nao consegui abrir a janela Liberacao de Catraca." }
Activate-Window $dialog

$d = $prep.dialog
$timedX = [int]($dialog.Rect.Left + ($dialog.Width * [double]$d.timedRadioX))
$timedY = [int]($dialog.Rect.Top + ($dialog.Height * [double]$d.timedRadioY))
$secondsX = [int]($dialog.Rect.Left + ($dialog.Width * [double]$d.secondsInputX))
$secondsY = [int]($dialog.Rect.Top + ($dialog.Height * [double]$d.secondsInputY))
$bothX = [int]($dialog.Rect.Left + ($dialog.Width * [double]$d.bothSidesRadioX))
$bothY = [int]($dialog.Rect.Top + ($dialog.Height * [double]$d.bothSidesRadioY))

Click-At -X $timedX -Y $timedY
Start-Sleep -Milliseconds 200
Click-At -X $secondsX -Y $secondsY
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait("^a")
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait([string]$defaultHoldSeconds)
Start-Sleep -Milliseconds 200
Click-At -X $bothX -Y $bothY

Write-Output "Tela Henry preparada: $defaultHoldSeconds segundos e Ambos os lados. Deixe essa janela aberta."
