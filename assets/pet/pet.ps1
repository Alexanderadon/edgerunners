# Десктоп-питомец: запускает движок pet.cs (окно с настоящей прозрачностью, 60 кадров в секунду) и держит его,
# пока открыт Claude. Всё остальное делает движок: в фоне читает состояние мода (assets/pet/state.json) и ищет
# окно Claude, заранее грузит кадры героя; ходит у нижнего края окна; ЛКМ — реакция героя и Claude вперёд,
# ПКМ — меню выбора напарника (выбор уходит моду в assets/pet/choice.json).
# Несколько сессий Claude пишут в один state.json — питомец держится за одну (поля session и busy).
# Один на компьютер (мьютекс). Уходит, если мод молчит дольше минуты или Claude закрыт.
# Проверка без экрана: assets/pet/snap.request — снимок холста в preview/pet-live.png и строка о скорости
# отрисовки в stderr; assets/pet/menu.request — открыть меню (номер в файле — какую карточку подсветить);
# assets/pet/pick.request — выбрать героя по номеру в списке (как клик по карточке).
# Запуск: powershell -File pet.ps1 -Root <папка мода>
param([string]$Root)

$mutex = New-Object System.Threading.Mutex($false, 'Local\edgerunners-pet')
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    Add-Type -Path (Join-Path $PSScriptRoot 'pet.cs') -ReferencedAssemblies System.Windows.Forms, System.Drawing
    $pet = New-Object PetForm
    $pet.Start($Root)
    [System.Windows.Forms.Application]::Run($pet)
} finally {
    $mutex.ReleaseMutex()
}
