param(
  [string]$WindowTitle = "Liberação de Catraca - [catra-site]",
  [int]$Seconds = 10,
  [string]$ReleaseMode = "both"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class HenryUser32 {
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

$shell = New-Object -ComObject WScript.Shell
$activated = $false
$targetRect = $null

$titles = @(
  $WindowTitle,
  "Liberação de Catraca",
  "Liberacao de Catraca",
  "catra-site",
  "Henry 7x",
  "Henry7x"
)

for ($attempt = 1; $attempt -le 3 -and -not $activated; $attempt++) {
  foreach ($title in $titles) {
    if ($shell.AppActivate($title)) {
      $activated = $true
      break
    }
  }
  Start-Sleep -Milliseconds 500
}

if (-not $activated) {
  $henryProcesses = @(Get-Process | Where-Object { $_.ProcessName -like "Henry7x*" })
  $henryIds = @($henryProcesses | ForEach-Object { [uint32]$_.Id })
  $candidateWindows = New-Object System.Collections.ArrayList

  [HenryUser32]::EnumWindows({
    param($hwnd, $lparam)
    $pid = [uint32]0
    [void][HenryUser32]::GetWindowThreadProcessId($hwnd, [ref]$pid)
    if ($henryIds -contains $pid) {
      $rect = New-Object HenryUser32+RECT
      [void][HenryUser32]::GetWindowRect($hwnd, [ref]$rect)
      $width = $rect.Right - $rect.Left
      $height = $rect.Bottom - $rect.Top
      $sb = New-Object System.Text.StringBuilder 512
      [void][HenryUser32]::GetWindowText($hwnd, $sb, $sb.Capacity)
      $title = $sb.ToString()
      if ([HenryUser32]::IsWindowVisible($hwnd) -and $width -gt 250 -and $height -gt 150) {
        [void]$candidateWindows.Add([PSCustomObject]@{
          Handle = $hwnd
          Rect = $rect
          Width = $width
          Height = $height
          Area = $width * $height
          Title = $title
        })
      }
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null

  $dialog = $candidateWindows |
    Where-Object { $_.Width -le 650 -and $_.Height -le 450 } |
    Sort-Object Area |
    Select-Object -First 1

  if ($null -eq $dialog) {
    $dialog = $candidateWindows | Sort-Object Area | Select-Object -First 1
  }

  if ($null -ne $dialog) {
    [void][HenryUser32]::ShowWindowAsync($dialog.Handle, 9)
    [void][HenryUser32]::BringWindowToTop($dialog.Handle)
    [void][HenryUser32]::SetForegroundWindow($dialog.Handle)
    $targetRect = $dialog.Rect
    $activated = $true
  }

  foreach ($henry in $henryProcesses) {
    if ($activated) { break }
    try {
      if ($henry.MainWindowHandle -and $henry.MainWindowHandle -ne 0) {
        [void][HenryUser32]::ShowWindowAsync($henry.MainWindowHandle, 9)
        [void][HenryUser32]::BringWindowToTop($henry.MainWindowHandle)
        [void][HenryUser32]::SetForegroundWindow($henry.MainWindowHandle)
        Start-Sleep -Milliseconds 500
        $activated = $true
        break
      }
      if ($shell.AppActivate([int]$henry.Id)) {
        $activated = $true
        break
      }
    } catch {}
  }
}

if (-not $activated) {
  throw "Nao consegui ativar a janela Henry7x. Abra o conector como administrador e deixe a tela 'Liberacao de Catraca - [catra-site]' aberta."
}

if ($null -eq $targetRect) {
  $henryProcesses = @(Get-Process | Where-Object { $_.ProcessName -like "Henry7x*" })
  $henryIds = @($henryProcesses | ForEach-Object { [uint32]$_.Id })
  $candidateWindows = New-Object System.Collections.ArrayList

  [HenryUser32]::EnumWindows({
    param($hwnd, $lparam)
    $pid = [uint32]0
    [void][HenryUser32]::GetWindowThreadProcessId($hwnd, [ref]$pid)
    if ($henryIds -contains $pid) {
      $rect = New-Object HenryUser32+RECT
      [void][HenryUser32]::GetWindowRect($hwnd, [ref]$rect)
      $width = $rect.Right - $rect.Left
      $height = $rect.Bottom - $rect.Top
      $sb = New-Object System.Text.StringBuilder 512
      [void][HenryUser32]::GetWindowText($hwnd, $sb, $sb.Capacity)
      $title = $sb.ToString()
      if ([HenryUser32]::IsWindowVisible($hwnd) -and $width -gt 250 -and $height -gt 150) {
        [void]$candidateWindows.Add([PSCustomObject]@{
          Handle = $hwnd
          Rect = $rect
          Width = $width
          Height = $height
          Area = $width * $height
          Title = $title
        })
      }
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null

  $dialog = $candidateWindows |
    Where-Object { $_.Width -le 650 -and $_.Height -le 450 } |
    Sort-Object Area |
    Select-Object -First 1

  if ($null -ne $dialog) {
    [void][HenryUser32]::ShowWindowAsync($dialog.Handle, 9)
    [void][HenryUser32]::BringWindowToTop($dialog.Handle)
    [void][HenryUser32]::SetForegroundWindow($dialog.Handle)
    $targetRect = $dialog.Rect
  }
}

Start-Sleep -Milliseconds 500
if ($null -ne $targetRect) {
  $width = $targetRect.Right - $targetRect.Left
  $height = $targetRect.Bottom - $targetRect.Top
  $x = [int]($targetRect.Left + ($width * 0.88))
  $y = [int]($targetRect.Top + ($height * 0.86))
  [void][HenryUser32]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 150
  [HenryUser32]::mouse_event(0x0002, 0, 0, 0, 0)
  Start-Sleep -Milliseconds 100
  [HenryUser32]::mouse_event(0x0004, 0, 0, 0, 0)
} else {
  [System.Windows.Forms.SendKeys]::SendWait("{TAB}")
  Start-Sleep -Milliseconds 100
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
}
Start-Sleep -Milliseconds 500

Write-Output "Clique/Enter enviado para a tela Henry7x. Comando solicitado com $Seconds segundos."
