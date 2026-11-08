# Снимок окна питомца (без того, что под ним) в preview\pet-snap.png: несколько кадров подряд в ряд.
# Запуск: powershell -File tools\pet-snap.ps1 [-Count 3] [-GapMs 400]
param([int]$Count = 3, [int]$GapMs = 400)

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Snap {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public static IntPtr Find(uint pid) { IntPtr f = IntPtr.Zero; EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) { f = h; return false; } return true; }, IntPtr.Zero); return f; }
}
'@
$proc = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match '-File\s+\S*assets\\pet\\pet\.ps1' } | Select-Object -First 1
if (-not $proc) { 'pet is not running'; exit 1 }
$h = [Snap]::Find([uint32]$proc.ProcessId)
if ($h -eq [IntPtr]::Zero) { "pet $($proc.ProcessId) has no visible window"; exit 1 }
$r = New-Object Snap+RECT; [void][Snap]::GetWindowRect($h, [ref]$r)
$w = $r.R - $r.L; $hh = $r.B - $r.T
"pet $($proc.ProcessId) at $($r.L),$($r.T) size ${w}x$hh"
$sheet = New-Object System.Drawing.Bitmap ($w * $Count), $hh
$g = [System.Drawing.Graphics]::FromImage($sheet); $g.Clear([System.Drawing.Color]::FromArgb(28, 28, 32))
for ($i = 0; $i -lt $Count; $i++) {
    $bmp = New-Object System.Drawing.Bitmap $w, $hh
    $bg = [System.Drawing.Graphics]::FromImage($bmp); $hdc = $bg.GetHdc(); [void][Snap]::PrintWindow($h, $hdc, 2); $bg.ReleaseHdc($hdc); $bg.Dispose()
    $bmp.MakeTransparent([System.Drawing.Color]::FromArgb(255, 0, 254))
    $g.DrawImage($bmp, $i * $w, 0); $bmp.Dispose()
    Start-Sleep -Milliseconds $GapMs
}
$out = Join-Path (Split-Path $PSScriptRoot) 'preview\pet-snap.png'
$sheet.Save($out); $g.Dispose(); $sheet.Dispose()
