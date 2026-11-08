# Готовит кадры героя для мода: убирает пурпурный фон, ставит на линию земли, выравнивает по голове
# и сшивает позы с переходами, которые в них ведут.
# Запуск: powershell -File process-frames.ps1 <папка исходников> <папка> [-W -H -Ground -TH] [-Raw] [-Sheets <sheets.json>]
# Одиночные кадры (1024x1536) размещаются по $Rules ниже, кадры из листов — по манифесту -Sheets (см. art/README.md).
param([string]$Src, [string]$Out, [int]$W = 160, [int]$H = 208, [int]$Ground = 202, [int]$TH = 168, [switch]$Raw,
    [string]$Sheets)

Add-Type -Path (Join-Path $PSScriptRoot 'sprite.cs') -ReferencedAssemblies System.Drawing
New-Item -ItemType Directory -Force $Out | Out-Null

# Ключ — анимация (часть имени до «_»). Правило одно из трёх:
#   ref + part — рост кадра ref равен доле part роста стоящего героя (TH), голова — по центру;
#   same — масштаб и привязка как у кадра same: кадр стоит так, как его нарисовали рядом с ним (переходы);
#   match + by — кадр ref подгоняется по высоте (h) или длине (w) и по положению к кадру match:
#                 так поза продолжает переход, который в неё ведёт, без скачка.
$Rules = @{
    hello = @{ ref = 'hello_01'; part = 1.0 }
    idle = @{ ref = 'idle_01'; part = 1.0 }
    think = @{ ref = 'think_01'; part = 1.0 }
    film = @{ ref = 'film_01'; part = 1.0 }
    sad = @{ ref = 'sad_01'; part = 0.97 }
    walk = @{ ref = 'walk_02'; part = 0.97 }
    happy = @{ ref = 'happy_02'; part = 0.98 }
    look = @{ ref = 'look_01'; part = 1.0 }
    surprised = @{ ref = 'look_01'; part = 1.0 }
    curious = @{ ref = 'look_01'; part = 1.0 }
    filmyou = @{ ref = 'look_01'; part = 1.0 }
    sitdown = @{ same = 'idle_01' }
    raisecam = @{ same = 'idle_01' }
    tochin = @{ same = 'idle_01' }
    sit = @{ ref = 'sit_01'; match = 'sd_08'; by = 'h'; else = 'sitdown_03' }
    yawn = @{ ref = 'sit_01'; match = 'sd_08'; by = 'h'; else = 'sitdown_03' }
    doze = @{ ref = 'sit_01'; match = 'sd_08'; by = 'h'; else = 'sitdown_03' }
    liedown = @{ same = 'sit_01' }
    lie = @{ ref = 'lie_01'; match = 'ld_04'; by = 'w'; else = 'liedown_02' }
    sleep = @{ ref = 'lie_01'; match = 'ld_04'; by = 'w'; else = 'liedown_02' }
    fallasleep = @{ same = 'lie_01' }
}
# Насколько поднять над землёй кадры прыжка (доля роста).
$JumpLift = @{ happy_03 = 0.10; happy_04 = 0.16; happy_05 = 0.06 }
# Лёжа голова уходит вниз, когда засыпает: такие позы привязываются к середине фигуры, а не к голове.
$Pinned = @('lie', 'sleep', 'fallasleep')

# Листы: кадр → его лист из манифеста (правило листа важнее $Rules), копии кадров (alias).
$Sheet = @{}; $Alias = [ordered]@{}; $Manifest = @()
if ($Sheets -and (Test-Path -LiteralPath $Sheets)) {
    foreach ($e in (Get-Content -Raw -Encoding UTF8 -LiteralPath $Sheets | ConvertFrom-Json)) {
        $Manifest += $e
        foreach ($n in $e.frames) { if ($n -and $n -ne '-') { $Sheet[$n] = $e } }
        if ($e.alias) { foreach ($p in $e.alias.PSObject.Properties) { $Alias[$p.Name] = $p.Value } }
        if ($e.frames -notcontains $e.scale.ref) { throw "$($e.file): кадр scale.ref '$($e.scale.ref)' не из этого листа" }
    }
}

$measure = @{}
foreach ($f in Get-ChildItem $Src -Filter *.png) { $measure[$f.BaseName] = [Sprite]::Measure($f.FullName) }

# Пол каждого ряда листа (самая низкая точка фигур ряда): ChatGPT рисует ряды со своей линией пола,
# поэтому в режиме cell кадр встаёт на пол своего ряда, а не ряда, где лежит ref — иначе сидящий «парит».
$RowFloor = @{}
foreach ($e in $Manifest) {
    $cols = [int]$e.grid[1]; $floor = @{}
    for ($i = 0; $i -lt $e.frames.Count; $i++) {
        $n = $e.frames[$i]; if (-not $n -or $n -eq '-' -or -not $measure.ContainsKey($n)) { continue }
        $row = [math]::Floor($i / $cols)
        if (-not $floor.ContainsKey($row) -or $measure[$n][3] -gt $floor[$row]) { $floor[$row] = $measure[$n][3] }
    }
    for ($i = 0; $i -lt $e.frames.Count; $i++) {
        $n = $e.frames[$i]; if ($n -and $n -ne '-' -and $measure.ContainsKey($n)) { $RowFloor[$n] = $floor[[math]::Floor($i / $cols)] }
    }
}

# Точка привязки кадра в исходнике: голова или середина фигуры.
function Pin($name) {
    $m = $measure[$name]
    if ($Pinned -contains $name.Split('_')[0]) { ($m[0] + $m[2]) / 2 } else { $m[5] }
}

# Привязка кадра листа: feet — центр ступней, body — ось корпуса (тело стоит на месте, даже если ступни
# в кадрах нарисованы чуть по-разному), head — голова, center — середина рамки,
# cell — как нарисовано в ячейке относительно ref (прыжки, выпады, сдвиги). Лёжа — всегда середина.
function Mode($name) {
    $e = $Sheet[$name]
    if ($e.anchors -and $e.anchors.$name) { return $e.anchors.$name }
    if ($e.anchor) { return $e.anchor }
    'feet'
}
function Point($name, $mode) {
    $m = $measure[$name]
    if ($mode -eq 'center' -or $Pinned -contains $name.Split('_')[0]) { return ($m[0] + $m[2]) / 2 }
    if ($mode -eq 'head') { return $m[5] }
    if ($mode -eq 'body') { return $m[7] }
    $m[6]
}

# Где кадр встанет: масштаб s, точка исходника anchor и куда она попадёт на холсте (x);
# bottom — строка исходника, которая ляжет на землю (по умолчанию низ самой фигуры).
$placed = @{}
function Place($name) {
    if ($placed.ContainsKey($name)) { return $placed[$name] }
    if (-not $measure.ContainsKey($name)) { throw "нет исходника кадра $name" }
    $m = $measure[$name]
    if ($Sheet.ContainsKey($name)) {
        $sc = $Sheet[$name].scale; $mode = Mode $name
        if ($name -ne $sc.ref) {
            # Остальные кадры листа — в масштабе ref; их точка привязки встаёт туда же, где у ref.
            $p = Place $sc.ref
            if ($mode -eq 'cell') {
                $r = @{ s = $p.s; anchor = $p.anchor; x = $p.x; bottom = $RowFloor[$name] }
            } else {
                $r = @{ s = $p.s; anchor = (Point $name $mode); x = $p.x + ((Point $sc.ref $mode) - $p.anchor) * $p.s }
            }
        } else {
            if ($mode -eq 'cell') { $mode = 'feet' }
            if ($sc.match) {
                $t = Place $sc.match; $mm = $measure[$sc.match]
                $size = if ($sc.by -eq 'w') { 2 } else { 3 }
                $s = $t.s * ($mm[$size] - $mm[$size - 2]) / ($m[$size] - $m[$size - 2])
                $r = @{ s = $s; anchor = (Point $name $mode); x = $t.x + ((Point $sc.match $mode) - $t.anchor) * $t.s }
            } else {
                $r = @{ s = $TH * $sc.part / ($m[3] - $m[1]); anchor = (Point $name $mode); x = $W / 2 }
            }
        }
        $placed[$name] = $r
        return $r
    }
    $rule = $Rules[$name.Split('_')[0]]
    if ($rule.same) {
        $p = Place $rule.same
        $r = @{ s = $p.s; anchor = $p.anchor; x = $p.x }
    } elseif ($rule.match) {
        # Подгоняем к кадру перехода из листа (sd_08, ld_04); если листа нет — к старому одиночному кадру.
        $mt = if ($measure.ContainsKey($rule.match) -or -not $rule.else) { $rule.match } else { $rule.else }
        $t = Place $mt; $mm = $measure[$mt]; $ref = $measure[$rule.ref]
        $size = if ($rule.by -eq 'w') { 2 } else { 3 }
        $s = $t.s * ($mm[$size] - $mm[$size - 2]) / ($ref[$size] - $ref[$size - 2])
        # Точка привязки этой позы встаёт туда, где на холсте та же точка у кадра match.
        $x = $t.x + ((Pin $mt) - $t.anchor) * $t.s
        $r = @{ s = $s; anchor = (Pin $name); x = $x }
    } else {
        $ref = $measure[$rule.ref]
        $r = @{ s = $TH * $rule.part / ($ref[3] - $ref[1]); anchor = (Pin $name); x = $W / 2 }
    }
    $placed[$name] = $r
    return $r
}

foreach ($f in Get-ChildItem $Src -Filter *.png | Sort-Object Name) {
    $name = $f.BaseName
    if ($Alias.Contains($name)) { continue }
    $inSheet = $Sheet.ContainsKey($name)
    if (-not $inSheet -and -not $Rules[$name.Split('_')[0]]) { Write-Host "skip $name (no rule)"; continue }
    $p = Place $name; $m = $measure[$name]
    $lift = 0; if (-not $inSheet -and $JumpLift.ContainsKey($name)) { $lift = $JumpLift[$name] * $TH }
    $bottom = if ($p.ContainsKey('bottom')) { $p.bottom } else { $m[3] }
    $dst = Join-Path $Out "$name.png"
    [Sprite]::Render($f.FullName, $dst, $p.s, $p.anchor, $bottom, $W, $H, $Ground - $lift, $p.x)
    if (-not $Raw) { [Sprite]::Posterize($dst, 24) }
}

# Стабилизация готовых кадров. ChatGPT рисует каждый кадр чуть по-своему, и герой на месте подрагивает вбок.
# Жесты: первый кадр клипа выравнивается по стойке, остальные — по первому (перекрытие фигур, в основном ног).
# Блоки — движение внутри клипа задумано (прыжок, взлом): целиком сдвигается весь клип, рисунок движения тот же.
$range = [int]($TH * 0.12)
function PathOf($n) { Join-Path $Out "$n.png" }
function Rendered($clip) { @(Get-ChildItem $Out -Filter "$($clip)_*.png" | Sort-Object Name | ForEach-Object BaseName) }
function Nudge($ref, $name) { [Sprite]::ShiftX((PathOf $name), -[Sprite]::AlignX((PathOf $ref), (PathOf $name), $range)) }
if (Test-Path (PathOf 'idle_01')) {
    foreach ($c in 'idle', 'look', 'filmyou', 'curious', 'surprised', 'iv', 'think', 'hello', 'sad', 'wave', 'nod', 'laugh', 'type', 'read', 'scan',
        'point', 'facepalm', 'angry', 'shrug', 'stretch', 'bored', 'drink', 'sneeze', 'phone', 'music', 'clap', 'bow', 'fix', 'rc', 'tc') {
        # @(): один кадр PowerShell вернёт строкой, и $list[0] дал бы первую букву имени.
        $list = @(Rendered $c)
        if ($list.Count -eq 0) { continue }
        if ($c -ne 'idle') { Nudge 'idle_01' $list[0] }
        foreach ($n in $list | Select-Object -Skip 1) { Nudge $list[0] $n }
    }
    # Блок: клип, его кадр-представитель и кадр, с которым он должен стыковаться.
    $joints = @(@('film', 'film_01', 'rc_04'), @('dance', 'dance_02', 'idle_01'), @('celebrate', 'celebrate_04', 'idle_01'), @('scared', 'scared_01', 'idle_01'),
        @('happy', 'happy_02', 'idle_01'), @('selfie', 'selfie_01', 'idle_01'), @('sd', 'sd_01', 'idle_01'), @('ld', 'ld_01', 'sd_08'))
    foreach ($j in $joints) {
        if (-not (Test-Path (PathOf $j[1])) -or -not (Test-Path (PathOf $j[2]))) { continue }
        $dx = [Sprite]::AlignX((PathOf $j[2]), (PathOf $j[1]), $range)
        foreach ($n in Rendered $j[0]) { [Sprite]::ShiftX((PathOf $n), -$dx) }
    }
    # Сидя и лёжа: позы отдыха стыкуются с концом перехода, кадры сна — между собой.
    $rest = if (Test-Path (PathOf 'sd_08')) { 'sd_08' } else { 'sit_01' }
    foreach ($n in 'sit_01', 'sit_02', 'yawn_01', 'doze_01') { if ($n -ne $rest -and (Test-Path (PathOf $n)) -and (Test-Path (PathOf $rest))) { Nudge $rest $n } }
    if (Test-Path (PathOf 'ld_04')) { foreach ($n in Rendered 'fa') { Nudge 'ld_04' $n } }
}

# Копии кадров: кадр-копия получает готовую картинку своего оригинала.
foreach ($k in $Alias.Keys) {
    $from = Join-Path $Out "$($Alias[$k]).png"
    if ([IO.File]::Exists($from)) { [IO.File]::Copy($from, (Join-Path $Out "$k.png"), $true) }
    else { Write-Host "alias $k`: нет кадра $($Alias[$k])" }
}
