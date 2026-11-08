# Перезапускает десктоп-питомца (после правок pet.ps1, pet.cs или кадров): гасит запущенный и стартует новый.
# -Demo — сцена или клип для tools/pet-demo.mjs (-Line — реплика, -Hero — герой: kadr, talia…);
# -Menu — сразу открыть меню выбора героя (-Hover — какую карточку подсветить); -Pick N — выбрать героя N из списка;
# -Snap — снять холст в preview\pet-live.png (и показать строку о скорости отрисовки).
# Ошибки компиляции и запуска — в %TEMP%\pet-err.txt (первые строки выводятся).
# Запуск: powershell -File tools\pet-restart.ps1 [-Demo think] [-Line "реплика"] [-Hero talia] [-Menu [-Hover 1]] [-Pick 1] [-Snap]
param([string]$Demo = '', [string]$Line = '', [string]$Hero = '', [switch]$Menu, [int]$Hover = -1, [int]$Pick = -1, [switch]$Snap)

$root = Split-Path $PSScriptRoot
$pet = Join-Path $root 'assets\pet\pet.ps1'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match '-File\s+\S*assets\\pet\\pet\.ps1' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force; "stopped $($_.ProcessId)" }
# Запросы, оставшиеся от прошлого запуска, не должны сработать в новом.
'snap.request', 'menu.request', 'pick.request' | ForEach-Object { Remove-Item (Join-Path $root "assets\pet\$_") -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 600
if ($Demo) {
    $demoArgs = @((Join-Path $PSScriptRoot 'pet-demo.mjs'), $Demo)
    if ($Line) { $demoArgs += $Line }
    if ($Hero) { $demoArgs += '--hero', $Hero }
    & node --experimental-strip-types --no-warnings @demoArgs
}
$err = Join-Path $env:TEMP 'pet-err.txt'
# Отдельным процессом через WMI, без унаследованных дескрипторов: иначе вызвавшая консоль (или конвейер) ждала бы,
# пока питомец не закроется. stderr — в файл через cmd (файл пишется заново).
$cmd = "cmd.exe /c powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$pet`" -Root `"$root`" 2> `"$err`""
$hidden = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
[void](Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd; ProcessStartupInformation = $hidden })
Start-Sleep -Seconds 4
Get-Content $err -ErrorAction SilentlyContinue | Select-Object -First 6

# Питомец берёт запросы, только когда он на экране; после запуска на это уходит до десятка секунд (компиляция).
function Request([string]$name, [string]$text) {
    $request = Join-Path $root "assets\pet\$name"
    [IO.File]::WriteAllText($request, $text)
    for ($i = 0; $i -lt 100 -and (Test-Path $request); $i++) { Start-Sleep -Milliseconds 150 }
}
if ($Pick -ge 0) {
    Request 'pick.request' "$Pick"
    # Выход героя (поклон) — около секунды.
    Start-Sleep -Milliseconds 1200
}
if ($Menu) {
    Request 'menu.request' $(if ($Hover -ge 0) { "$Hover" } else { '' })
    # Раскрытие панели, шапка и карточки по очереди — около секунды.
    Start-Sleep -Milliseconds 1600
}
if ($Snap) {
    $png = Join-Path $root 'preview\pet-live.png'
    $before = if (Test-Path $png) { (Get-Item $png).LastWriteTime } else { [DateTime]::MinValue }
    [IO.File]::WriteAllText((Join-Path $root 'assets\pet\snap.request'), '')
    for ($i = 0; $i -lt 100 -and -not ((Test-Path $png) -and (Get-Item $png).LastWriteTime -gt $before); $i++) { Start-Sleep -Milliseconds 150 }
    if ((Test-Path $png) -and (Get-Item $png).LastWriteTime -gt $before) { "snapshot: $png" } else { 'snapshot: no answer (pet hidden or not running?)' }
    # Скорость отрисовки с прошлого снимка: питомец пишет её строкой «snap: …» в stderr.
    Start-Sleep -Milliseconds 300
    Get-Content $err -ErrorAction SilentlyContinue | Where-Object { $_ -like 'snap:*' } | Select-Object -Last 1
}
