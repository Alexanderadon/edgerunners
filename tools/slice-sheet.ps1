# Режет лист кадров (сетка rows x cols на пурпурном фоне) на отдельные PNG с заданными именами —
# дальше они идут в process-frames / make-sprites как обычные исходники.
# Фон ключуется по самому листу (ChatGPT даёт не ровный #FF00FF и мягкие края), с краёв фигуры снимается
# пурпурная кайма; розовое и красное внутри фигуры не трогается. Фигуры ищутся по фону: каждая вырезается
# целиком, даже если вылезла за свою ячейку, а соседи в кадр не попадают. Кадр — своя ячейка с общим для
# листа запасом по краям: у всех кадров листа одна система координат (для привязки «cell»).
# Не нашлись все фигуры ряда (слиплись, пустая ячейка) — этот ряд режется просто по сетке.
# Запуск: powershell -File slice-sheet.ps1 <лист.png> <папка> <rows> <cols> "walk_01 walk_02 ..."
# (имена через пробел или запятую; -File может передать список и строкой, и массивом; «-» — пустая ячейка)
param([string]$Sheet, [string]$Out, [int]$Rows, [int]$Cols, [string[]]$Names)

if (-not ('Sheet' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'sprite.cs') -ReferencedAssemblies System.Drawing }
$names = @(($Names -join ' ') -split '[,\s]+' | Where-Object { $_ })
if ($names.Count -gt $Rows * $Cols) { throw "$Sheet`: имён $($names.Count), а ячеек $($Rows * $Cols)" }
# Полные пути без Resolve-Path: он спотыкается о короткие 8.3-пути с кириллицей (%TEMP%).
function Full($p) { if ([IO.Path]::IsPathRooted($p)) { $p } else { [IO.Path]::Combine((Get-Location).ProviderPath, $p) } }
[IO.Directory]::CreateDirectory((Full $Out)) | Out-Null
[Sheet]::Slice((Full $Sheet), (Full $Out), $Rows, $Cols, [string[]]$names)
