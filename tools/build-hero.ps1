# Собирает все кадры героя из art/<герой> и делает спрайты: питомца (assets/pet/<герой>, 420x372)
# и панели /persona (assets/<герой> → hooks/sprites, 160x208).
# Исходники героя:
#   art/<герой>/frames/*.png — одиночные кадры (1024x1536 на пурпурном фоне), размещаются по $Rules в process-frames;
#   art/<герой>/sheets.json  — листы из ChatGPT (сетка, по фигуре в ячейке), режутся slice-sheet и размещаются
#                              по манифесту. Кадр из листа заменяет одиночный кадр с тем же именем.
# Как добавить лист: положить картинку в art/<герой>/sheets/<имя>.png и дописать в art/<герой>/sheets.json:
#   { "file": "sheets/g1.png", "grid": [2, 4], "frames": ["wave_01", "wave_02", …, "nod_04"],
#     "scale": { "ref": "wave_01", "part": 1.0 },          (или { "ref": "sit_02", "match": "sit_01", "by": "h" })
#     "anchor": "feet",                                     (feet | head | center | cell)
#     "anchors": { "sitdown_01": "cell" },                  (необязательно: привязка отдельных кадров)
#     "alias": { "fallasleep_01": "lie_02" } }              (необязательно: кадр-копия)
#   «-» в frames — пустая ячейка. Подробно — art/README.md.
# Запуск: powershell -File tools/build-hero.ps1 <герой> [-Style pet|sharp|both] [-Colors N] [-SharpColors N]
# -Colors / -SharpColors — число цветов палитры питомца / панели (по умолчанию 56 / 40).
param([Parameter(Mandatory = $true)][string]$Hero, [ValidateSet('pet', 'sharp', 'both')][string]$Style = 'both',
    [int]$Colors = 0, [int]$SharpColors = 0)

$ErrorActionPreference = 'Stop'
$Mod = Split-Path $PSScriptRoot
$art = Join-Path $Mod "art\$Hero"
if (-not (Test-Path $art)) { throw "нет папки $art" }
$manifest = Join-Path $art 'sheets.json'
$clock = [Diagnostics.Stopwatch]::StartNew()

# Рост героя относительно обычного и палитра — art/<герой>/hero.json: { "height": 0.78, "colors": 72 }.
# У каждого свои пропорции: Роман — ребёнок и ниже всех, Уик — самый высокий.
$height = 1.0
$heroJson = Join-Path $art 'hero.json'
if (Test-Path $heroJson) {
    $cfg = Get-Content -Raw -Encoding UTF8 $heroJson | ConvertFrom-Json
    if ($cfg.height) { $height = [double]$cfg.height }
    if ($cfg.colors -and $Colors -le 0) { $Colors = [int]$cfg.colors }
}

# Временная папка со всеми исходниками героя. Удаляем через .NET: Remove-Item спотыкается
# о короткие 8.3-пути с кириллицей в %TEMP%.
$src = Join-Path $env:TEMP "hero-$Hero"
if ([IO.Directory]::Exists($src)) { [IO.Directory]::Delete($src, $true) }
[IO.Directory]::CreateDirectory($src) | Out-Null
try {

$single = 0
$frames = Join-Path $art 'frames'
if ([IO.Directory]::Exists($frames)) {
    foreach ($f in [IO.Directory]::GetFiles($frames, '*.png')) { [IO.File]::Copy($f, (Join-Path $src ([IO.Path]::GetFileName($f)))); $single++ }
}

$sheets = @()
if (Test-Path $manifest) { foreach ($e in (Get-Content -Raw -Encoding UTF8 $manifest | ConvertFrom-Json)) { $sheets += $e } }
$cut = @{}
foreach ($e in $sheets) {
    $names = @($e.frames | ForEach-Object { if ($_) { $_ } else { '-' } })
    foreach ($n in $names) {
        if ($n -eq '-') { continue }
        if ($cut.ContainsKey($n)) { throw "$n есть в двух листах: $($cut[$n]) и $($e.file)" }
        if ([IO.File]::Exists((Join-Path $src "$n.png"))) { Write-Host "$n`: лист заменяет одиночный кадр" }
        $cut[$n] = $e.file
    }
    & (Join-Path $PSScriptRoot 'slice-sheet.ps1') (Join-Path $art $e.file) $src $e.grid[0] $e.grid[1] $names | Write-Host
}
$cut = $cut.Count
Write-Host "$Hero`: одиночных кадров $single, из листов $cut ($($sheets.Count) лист.)"
if ($single + $cut -eq 0) { throw "у героя $Hero нет кадров" }

$make = Join-Path $PSScriptRoot 'make-sprites.ps1'
$extra = @()
if ($sheets.Count -gt 0) { $extra = @('-Sheets', $manifest) }
if ($Style -ne 'sharp') {
    $c = @(); if ($Colors -gt 0) { $c = @('-Colors', $Colors) }
    & powershell -NoProfile -ExecutionPolicy Bypass -File $make $src $Hero -Style pet -Height $height @extra @c
    if ($LASTEXITCODE) { throw "make-sprites pet: код $LASTEXITCODE" }
}
if ($Style -ne 'pet') {
    $c = @(); if ($SharpColors -gt 0) { $c = @('-Colors', $SharpColors) }
    & powershell -NoProfile -ExecutionPolicy Bypass -File $make $src $Hero -Style sharp -Height $height @extra @c
    if ($LASTEXITCODE) { throw "make-sprites sharp: код $LASTEXITCODE" }
}

} finally { if ([IO.Directory]::Exists($src)) { [IO.Directory]::Delete($src, $true) } }
Write-Host ("{0}: готово за {1:0} с" -f $Hero, $clock.Elapsed.TotalSeconds)
