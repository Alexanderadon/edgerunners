# Герой выезжает из правого нижнего угла экрана поверх всех окон, машет и говорит фразу,
# потом уезжает. Нажатие на него открывает Claude. Если Claude и так перед глазами — ничего не делает.
# Запуск: powershell -File popup.ps1 -Text "Готово!" -Frames <папка с hello_01..04.png> [-Seconds 7]
param([string]$Text = 'Готово!', [string]$Frames, [int]$Seconds = 7, [switch]$Force)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Win {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
'@

# Claude на переднем плане — человек и так всё видит.
$fgPid = 0; [void][Win]::GetWindowThreadProcessId([Win]::GetForegroundWindow(), [ref]$fgPid)
$fg = Get-Process -Id $fgPid -ErrorAction SilentlyContinue
if (-not $Force -and $fg -and $fg.ProcessName -like 'Claude*') { exit 0 }

$key = [System.Drawing.Color]::FromArgb(255, 1, 254)
$images = 'hello_01', 'hello_02', 'hello_01', 'hello_03', 'hello_04' |
    ForEach-Object { Join-Path $Frames "$_.png" } | Where-Object { Test-Path $_ } |
    ForEach-Object { [System.Drawing.Image]::FromFile($_) }
if (-not $images) { exit 1 }
$w = $images[0].Width; $h = $images[0].Height

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'; $form.ShowInTaskbar = $false; $form.TopMost = $true
$form.StartPosition = 'Manual'; $form.BackColor = $key; $form.TransparencyKey = $key
$form.Size = New-Object System.Drawing.Size ([math]::Max($w + 40, 230)), ($h + 64)
$form.Cursor = [System.Windows.Forms.Cursors]::Hand

$bubble = New-Object System.Windows.Forms.Label
$bubble.Text = $Text; $bubble.AutoSize = $false; $bubble.TextAlign = 'MiddleCenter'
$bubble.Font = New-Object System.Drawing.Font 'Segoe UI', 11, ([System.Drawing.FontStyle]::Bold)
$bubble.BackColor = [System.Drawing.Color]::White; $bubble.ForeColor = [System.Drawing.Color]::FromArgb(30, 30, 40)
$bubble.Size = New-Object System.Drawing.Size ($form.Width - 8), 52; $bubble.Location = New-Object System.Drawing.Point 4, 4
$form.Controls.Add($bubble)

$pic = New-Object System.Windows.Forms.PictureBox
$pic.Size = New-Object System.Drawing.Size $w, $h; $pic.BackColor = $key
$pic.Location = New-Object System.Drawing.Point ([int](($form.Width - $w) / 2)), 60
$pic.Image = $images[0]
$form.Controls.Add($pic)

$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Left = $area.Right - $form.Width - 16
$shown = $area.Bottom - $form.Height; $hidden = $area.Bottom + 4
$form.Top = $hidden

# Нажатие: вернуть окно Claude и уйти.
$open = {
    $claude = Get-Process -Name 'Claude' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($claude) {
        if ([Win]::IsIconic($claude.MainWindowHandle)) { [void][Win]::ShowWindow($claude.MainWindowHandle, 9) }
        [void][Win]::SetForegroundWindow($claude.MainWindowHandle)
    }
    $form.Close()
}
$form.Add_Click($open); $pic.Add_Click($open); $bubble.Add_Click($open)

# Кадры приветствия в игровом ритме; выезд, ожидание и отъезд.
$script:frame = 0; $script:tick = 0; $script:phase = 'in'
$ticks = [int]($Seconds * 1000 / 40)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 40
$timer.Add_Tick({
    $script:tick++
    if ($script:tick % 9 -eq 0) { $script:frame = ($script:frame + 1) % $images.Count; $pic.Image = $images[$script:frame] }
    switch ($script:phase) {
        'in' { $form.Top = [math]::Max($shown, $form.Top - 22); if ($form.Top -le $shown) { $script:phase = 'stay'; $script:tick = 0 } }
        'stay' { if ($script:tick -ge $ticks) { $script:phase = 'out' } }
        'out' { $form.Top += 22; if ($form.Top -ge $hidden) { $form.Close() } }
    }
})
# Без звука: системный сигнал Windows раздражает.
$form.Add_Shown({ $timer.Start() })
[System.Windows.Forms.Application]::Run($form)
