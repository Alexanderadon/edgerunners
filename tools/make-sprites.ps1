# Из исходников на пурпурном фоне делает игровые спрайты героя в assets/<герой>:
# ставит на линию земли, выравнивает по голове, переводит в общую палитру с контуром
# и добавляет кадры вдоха («…b»: корпус на 1–2 пикселя ниже), затем собирает hooks/sprites.
# Стиль pet — крупные кадры для десктоп-питомца: кладутся в assets/pet/<герой> и в hooks не собираются.
# Запуск: powershell -File make-sprites.ps1 <исходники> <герой> [-Style sharp|medium|chunky|pet] [-Sheets <sheets.json>] [-Colors N]
# -Sheets — манифест листов героя (размещение кадров из листов), -Colors — число цветов палитры вместо обычного для стиля.
# Обычно всё это запускает tools/build-hero.ps1.
param([string]$Src, [string]$Hero, [ValidateSet('sharp', 'medium', 'chunky', 'pet')][string]$Style = 'sharp',
    [string]$Sheets, [int]$Colors = 0, [double]$Height = 1.0)

$Mod = Split-Path $PSScriptRoot
Add-Type -Path (Join-Path $PSScriptRoot 'sprite.cs') -ReferencedAssemblies System.Drawing

$v = @{
    # Ширина с запасом: лёжа, в беге и в ударе фигура шире, чем стоя, и не должна обрезаться.
    pet = @{ W = 420; H = 372; G = 362; TH = 300; colors = 56; scale = 1; shift = 3 }
    sharp = @{ W = 160; H = 208; G = 202; TH = 168; colors = 40; scale = 1; shift = 2 }
    medium = @{ W = 96; H = 124; G = 122; TH = 100; colors = 36; scale = 2; shift = 1 }
    chunky = @{ W = 64; H = 84; G = 82; TH = 68; colors = 28; scale = 3; shift = 1 }
}[$Style]
if ($Colors -gt 0) { $v.colors = $Colors }
# Рост героя относительно обычного (из art/<герой>/hero.json через build-hero).
$v.TH = [int][Math]::Round($v.TH * $Height)

$small = Join-Path $env:TEMP "sprites-$Hero"
if (Test-Path $small) { [IO.Directory]::Delete($small, $true) }
$args2 = @($Src, $small, '-W', $v.W, '-H', $v.H, '-Ground', $v.G, '-TH', $v.TH, '-Raw')
if ($Sheets) { $args2 += @('-Sheets', $Sheets) }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'process-frames.ps1') @args2

$out = if ($Style -eq 'pet') { Join-Path $Mod "assets\pet\$Hero" } else { Join-Path $Mod "assets\$Hero" }
Remove-Item -Recurse -Force $out -ErrorAction SilentlyContinue
New-Item -ItemType Directory $out | Out-Null
$files = Get-ChildItem $small -Filter *.png | Sort-Object Name
$clock = [Diagnostics.Stopwatch]::StartNew()
$pal = [Sprite]::Palette([string[]]($files | ForEach-Object FullName), $v.colors)
foreach ($f in $files) { [Sprite]::Pixelize($f.FullName, (Join-Path $out $f.Name), $pal, 0, 0, $v.scale) }

# Вдох: стоя двигается всё выше пояса, сидя и лёжа — всё, кроме того, что касается земли.
$stand = [int]($v.G - 0.5 * $v.TH); $low = [int]($v.G - 0.09 * $v.TH)
$breath = @{
    idle_01 = $stand; look_01 = $stand; look_02 = $stand; filmyou_01 = $stand; curious_01 = $stand
    think_01 = $stand; hello_01 = $stand; sad_01 = $stand
    sit_01 = $low; doze_01 = $low; lie_01 = $low; sleep_01 = $low
}
foreach ($k in $breath.Keys) {
    $src = Join-Path $small "$k.png"
    if (Test-Path $src) { [Sprite]::Pixelize($src, (Join-Path $out "$($k)b.png"), $pal, $breath[$k], $v.shift, $v.scale) }
}
Write-Host ("{0} {1}: кадров {2}, палитра {3} цв., {4:0.0} с" -f $Hero, $Style, $files.Count, $v.colors, $clock.Elapsed.TotalSeconds)

if ($Style -ne 'pet') { & node (Join-Path $PSScriptRoot 'build-sprites.mjs') $Mod }
[IO.Directory]::Delete($small, $true)
