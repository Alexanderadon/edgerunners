// Что Claude делает прямо сейчас — словами героя: настоящий файл, настоящая команда, настоящая задача.
// Команда разбирается до программы и подкоманды: значения и флаги на экран не идут, в них бывают токены.
import { field, isDanger } from './helper'

import type { Lang } from './characters'

export type DeedKind =
  | 'read' | 'edit' | 'write' | 'search' | 'web' | 'agent' | 'test' | 'build' | 'look' | 'commit' | 'push' | 'install' | 'run'
  | 'plan' | 'other' | 'ask' | 'prompt' | 'go' | 'notice' | 'fail' | 'danger' | 'wait' | 'stopped' | 'crash'

export type Deed = { kind: DeedKind; target: string }

const MAX_TARGET = 40
const cut = (text: string, max = MAX_TARGET) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

// Обрезка по границе слова — для фраз человека и планов.
const cutWords = (text: string, max: number) => {
  if (text.length <= max) {
    return text
  }
  const head = text.slice(0, max)
  const space = head.lastIndexOf(' ')

  return `${(space > max / 2 ? head.slice(0, space) : head).trimEnd()}…`
}

const baseName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path

const hostOf = (url: string) => /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url)?.[1]?.split('@').pop() ?? ''

// ---- команды оболочки ----

const SKIP = /^(cd|set-location|pushd|popd|echo|write-host|write-output|sleep|start-sleep|export|set|source|true|false|exit|rem|for|foreach|foreach-object|if|elif|while|until|done|fi|esac|function|try|catch|finally|param|return)$/i
// Слова, после которых идёт сама команда: `do wc -l`, `then npm test`.
const LEADERS = new Set(['&', 'sudo', 'do', 'then', 'else', 'time', 'nohup', '='])
const SUBCOMMANDS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'cargo', 'go', 'dotnet', 'docker', 'kubectl', 'gh', 'claude', 'pip', 'pip3', 'poetry', 'uv', 'npx', 'make'])
const SCRIPTED = new Set(['node', 'python', 'python3', 'py', 'powershell', 'pwsh', 'bash', 'sh', 'deno', 'tsx', 'ts-node', 'ruby', 'php'])
const PLAIN_WORD = /^[a-z][a-z0-9:_-]*$/i
const FILE_LIKE = /\.[a-z0-9]{1,5}$/i
const SECRET_FILE = /(^|[\\/.])(env|secrets?|credentials?)(\.|$)|\.(pem|key)$/i
const READERS = /^(cat|head|tail|type|get-content|less|more|sed|awk)$/i
const SEARCHERS = /^(ls|dir|find|grep|rg|fd|tree|which|where|get-childitem|select-string)$/i
const TESTS = /\b(tests?|vitest|jest|pytest|mocha|playwright|spec)\b/i
const BUILDS = /\b(build|compile|tsc|webpack|rollup|esbuild|msbuild|csc|make|vite)\b/i
const INSTALLS = /^(npm|pnpm|yarn|bun|pip|pip3|cargo|uv|poetry)\s+(install|i|add|ci)\b/i
const GIT_LOOK = /^(status|diff|log|show|blame|branch|remote|rev-parse|ls-files)$/i
const GIT_COMMIT = /^(add|commit)$/i

const unquote = (word: string) => word.replace(/^["']|["']$/g, '')
const wordsOf = (part: string) => (part.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(unquote)

// Программа без префиксов (`FOO=bar`, `&`, `sudo`) и всё, что идёт за ней.
const programOf = (words: readonly string[]) => {
  // Пропускаем `FOO=bar`, `$env:X=1`, присваивание `$x =` и служебные слова перед командой.
  const at = words.findIndex(word => !/^\w+=/.test(word) && !/^\$env:/i.test(word) && !/^\$\w+$/.test(word) && !LEADERS.has(word.toLowerCase()))
  if (at < 0) {
    return { program: '', rest: [] as string[] }
  }

  const word = words[at]!
  // Вызов метода PowerShell или функции: `[IO.File]::WriteAllText(...)` — это WriteAllText, а не путь в скобках.
  const call = /::(\w+)\(/.exec(word) ?? /^([\w.-]+)\(/.exec(word)
  const program = call ? call[1]! : clean(baseName(word)).replace(/\.(exe|cmd|bat)$/i, '')

  return { program, rest: words.slice(at + 1) }
}

// Кавычки, запятые и скобки вокруг слова — не часть имени.
const clean = (word: string) => word.replace(/^[^\w.$-]+|[^\w.-]+$/g, '')

const scriptOf = (rest: readonly string[]) => {
  const module = rest.indexOf('-m')
  if (module >= 0 && rest[module + 1] && PLAIN_WORD.test(rest[module + 1]!)) {
    return rest[module + 1]!
  }
  const file = rest.find(word => !word.startsWith('-') && FILE_LIKE.test(word) && !SECRET_FILE.test(word))

  return file ? clean(baseName(file)) : ''
}

// Короткое имя команды: `npm run build`, `git push`, `node pet-demo.mjs`, `curl`.
const coreOf = (program: string, rest: readonly string[]) => {
  const name = program.toLowerCase()
  if (name === 'git') {
    const sub = rest.find(word => !word.startsWith('-') && PLAIN_WORD.test(word))

    return sub ? `git ${sub}` : 'git'
  }
  if (SUBCOMMANDS.has(name)) {
    const subs: string[] = []
    for (const word of rest) {
      if (subs.length === 2 || !PLAIN_WORD.test(word)) {
        break
      }
      subs.push(word)
    }

    return [program, ...subs].join(' ')
  }
  if (SCRIPTED.has(name)) {
    const script = scriptOf(rest)

    return script ? `${program} ${script}` : program
  }
  if (READERS.test(name)) {
    const file = [...rest].reverse().find(word => !word.startsWith('-') && FILE_LIKE.test(word) && !SECRET_FILE.test(word))

    return file ? clean(baseName(file)) : program
  }

  return program
}

const shellKind = (core: string, program: string): DeedKind => {
  if (program.toLowerCase() === 'git') {
    const sub = core.split(' ')[1] ?? ''
    if (sub === 'push') {
      return 'push'
    }
    if (GIT_COMMIT.test(sub)) {
      return 'commit'
    }

    return GIT_LOOK.test(sub) ? 'look' : 'run'
  }
  if (READERS.test(program)) {
    return 'read'
  }
  if (TESTS.test(core)) {
    return 'test'
  }
  if (INSTALLS.test(core)) {
    return 'install'
  }
  if (BUILDS.test(core)) {
    return 'build'
  }
  if (READERS.test(program)) {
    return 'read'
  }
  if (SEARCHERS.test(program)) {
    return 'search'
  }

  return 'run'
}

// Чем выше, тем больше говорит о сути цепочки: `cd x && npm test` — это тесты, `git add . && git push` — отправка.
const RANK: Partial<Record<DeedKind, number>> = { test: 6, push: 5, commit: 4, build: 3, install: 2, run: 1 }

const shellDeed = (command: string): Deed | undefined => {
  const parts = command.split(/&&|\|\||;|\r?\n/).map(part => part.split('|')[0]!.trim()).filter(Boolean)
  let best: Deed | undefined
  let danger = ''
  for (const part of parts) {
    const { program, rest } = programOf(wordsOf(part))
    if (!program || SKIP.test(program)) {
      continue
    }
    const core = cut(coreOf(program, rest))
    if (!danger && isDanger(part)) {
      danger = core
    }
    const kind = shellKind(core, program)
    if (!best || (RANK[kind] ?? 0) > (RANK[best.kind] ?? 0)) {
      best = { kind, target: core }
    }
  }
  if (danger || isDanger(command)) {
    return { kind: 'danger', target: danger || best?.target || '' }
  }

  return best
}

// ---- инструменты ----

const fileOf = (input: object) => baseName(field(input, 'file_path') || field(input, 'notebook_path') || field(input, 'path'))

const withTarget = (kind: DeedKind, target: string): Deed | undefined => (target ? { kind, target: cut(target) } : undefined)

// Шаг плана «в работе»: и TodoWrite, и список задач приложения.
const planStep = (input: object) => {
  const list = (input as { todos?: unknown; items?: unknown }).todos ?? (input as { items?: unknown }).items
  if (!Array.isArray(list)) {
    return ''
  }
  const step = (list as { status?: unknown; content?: unknown; activeForm?: unknown }[]).find(one => one?.status === 'in_progress')
  const text = typeof step?.activeForm === 'string' ? step.activeForm : typeof step?.content === 'string' ? step.content : ''

  return cutWords(text.replace(/\s+/g, ' ').trim(), 54)
}

const MCP = /^mcp__(.+)__([^_].*)$/
// Служебное приложения и движка: об этом герою сказать нечего.
const SERVICE = /^(ccd_|plugin|visualize)/i

/** Что за дело у инструмента. undefined — служебное: реплика остаётся прежней. */
export const deedOf = (tool: string, input: object): Deed | undefined => {
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      return shellDeed(field(input, 'command'))
    case 'Read':
    case 'NotebookRead':
    case 'LS':
      return withTarget('read', fileOf(input))
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return withTarget('edit', fileOf(input))
    case 'Write':
      return withTarget('write', fileOf(input))
    case 'Grep':
    case 'Glob':
      return withTarget('search', field(input, 'pattern').replace(/\s+/g, ' '))
    case 'WebSearch':
      return withTarget('web', field(input, 'query').replace(/\s+/g, ' '))
    case 'WebFetch':
      return withTarget('web', hostOf(field(input, 'url')))
    case 'Agent':
    case 'Task':
      return withTarget('agent', field(input, 'description') || field(input, 'subagent_type'))
    case 'AskUserQuestion':
      return { kind: 'ask', target: '' }
    case 'TodoWrite':
      return withTarget('plan', planStep(input))
    case 'Skill':
      return withTarget('other', field(input, 'skill'))
    default:
  }
  const mcp = MCP.exec(tool)
  if (!mcp) {
    return undefined
  }
  const [, server = '', action = ''] = mcp
  if (action === 'update_plan') {
    return withTarget('plan', planStep(input))
  }
  if (SERVICE.test(server)) {
    return undefined
  }
  if (/browser|chrome/i.test(server)) {
    return withTarget('web', hostOf(field(input, 'url')))
  }

  return withTarget('other', action.replace(/_/g, ' '))
}

/** Просьба человека: первые слова, без кода и разметки. Совсем короткая («да») — просто «принял». */
export const promptDeed = (text: string): Deed => {
  const task = /(?:^|\n)Task:\n([\s\S]*?)(?:\n\n|$)/.exec(text)?.[1] ?? text
  const flat = task
    .replace(/<(system-reminder|side-sessions-event|task-notification|ci-monitor-event|command-[\w-]+)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return flat.length < 4 ? { kind: 'go', target: '' } : { kind: 'prompt', target: cutWords(flat, 46) }
}

/** Инструмент упал: то же дело, но «не вышло». */
export const failDeed = (deed: Deed | undefined): Deed | undefined =>
  deed?.target ? { kind: 'fail', target: deed.target } : undefined

// ---- как это звучит ----

type Voice = Partial<Record<DeedKind, readonly string[]>>

const voice = (text: string): Voice =>
  Object.fromEntries(text.trim().split('\n').map(row => {
    const at = row.indexOf(':')

    return [row.slice(0, at).trim(), row.slice(at + 1).split('|').map(one => one.trim())]
  }))

const RU: Record<string, Voice> = {
  plain: voice(`
read: Читаю {t}
edit: Правлю {t}
write: Создаю {t}
search: Ищу: {t}
web: Смотрю в сети: {t}
agent: Отправил помощника: {t}
test: Гоняю тесты: {t}
build: Идёт сборка: {t}
look: Смотрю изменения: {t}
commit: Фиксирую: {t}
push: Отправляю: {t}
install: Ставлю: {t}
run: Запускаю {t}
plan: Сейчас: {t}
other: В работе: {t}
ask: Нужен твой ответ, смотри в чат.
prompt: Задача: «{t}»
go: Принято.
notice: Фоновая задача отчиталась, смотрю.
fail: Не вышло: {t}
danger: Осторожно: {t}
wait: Фоновая работа ещё идёт, жду.
stopped: Остановлено.
crash: Ход упал с ошибкой.
`),
  kadr: voice(`
read: Читаю {t} | Смотрю исходник: {t} | Крупный план: {t}
edit: Монтирую {t} | Правлю {t} | Перемонтаж: {t}
write: Новый файл: {t} | Снимаю с нуля: {t}
search: Ищу в архиве: {t} | Где у нас {t}? Ищу…
web: Смотрю в сети: {t} | Собираю материал: {t}
agent: Вторая камера: {t} | Отправил напарника: {t}
test: Контрольный просмотр: {t} | Гоняю тесты: {t}
build: Рендерю: {t} | Идёт сборка: {t}
look: Смотрю плёнку: {t} | Что изменилось? {t}
commit: Фиксирую дубль: {t}
push: Выкладываю: {t}
install: Ставлю: {t} | Докупаю реквизит: {t}
run: Мотор: {t} | Запускаю {t}
plan: Сейчас в кадре: {t} | Сцена: {t}
other: На площадке: {t}
ask: Стоп, мотор! Нужен твой ответ. | Вопрос к тебе, глянь в чат.
prompt: Снимаем: «{t}» | Тема ролика: «{t}»
go: Понял, снимаем! | Мотор, принял!
notice: Вторая камера отчиталась, смотрю.
fail: Дубль сорвался: {t} | Не вышло: {t}. Переснимем.
danger: Стоп! Опасный кадр: {t} | Осторожно: {t}
wait: Вторая камера ещё снимает, жду. | Фон работает, жду.
stopped: Съёмку остановили. | Стоп. Как скажешь.
crash: Съёмка сорвалась: ход упал с ошибкой.
`),
  talia: voice(`
read: Читаю {t}. Тихо. | Вскрываю {t} | Смотрю {t}
edit: Переписываю {t} | Вношу правку: {t} | Правлю {t}. Чисто.
write: Новая закладка: {t} | Создаю {t}
search: Сканирую: {t} | Ищу след: {t}
web: Иду в сеть: {t} | Пробиваю в сети: {t}
agent: Клон ушёл на задачу: {t} | Послала агента: {t}
test: Проверка защиты: {t} | Гоняю тесты: {t}
build: Компилирую: {t} | Собираю: {t}
look: Смотрю журналы: {t} | Проверяю следы: {t}
commit: Закрепляю: {t}
push: Выгружаю: {t}
install: Подгружаю: {t}
run: Запуск: {t} | Исполняю: {t}
plan: Текущая цель: {t} | Этап: {t}
other: Подключилась: {t}
ask: Нужно твоё решение. Смотри в чат. | Вопрос к тебе. Жду.
prompt: Цель: «{t}» | Задача: «{t}»
go: Принято. | Поняла. Работаю.
notice: Фоновый агент вернулся. Смотрю.
fail: Не прошло: {t} | Сорвалось: {t}. Захожу снова.
danger: Опасно: {t}. Смотри внимательно. | Осторожно: {t}
wait: Фон ещё работает. Жду сигнал. | Агенты в сети. Жду.
stopped: Вышла. Остановлено. | Прервано.
crash: Ход упал с ошибкой. Следы зачищу.
`),
  di: voice(`
read: Смотрю {t}. | Разбираю {t}. Гайки на месте? | Читаю {t}. Сонно.
edit: Подтягиваю {t}. Ещё болтик… | Чиню {t}. | Перепаиваю {t}.
write: Новая деталь: {t}. | Собираю {t} с нуля.
search: Где-то тут было: {t}. | Ищу в ящике: {t}.
web: Листаю мануал: {t}. | Смотрю в сети: {t}.
agent: Отправил дрона: {t}. | Дрон ушёл: {t}.
test: Обкатка: {t}. | Гоняю тесты: {t}.
build: Собираю: {t}. | На стенде: {t}.
look: Смотрю, что открутили: {t}.
commit: Закручиваю: {t}.
push: Отгружаю: {t}.
install: Ставлю запчасти: {t}.
run: Кручу: {t}. | Запускаю {t}.
plan: На верстаке: {t}. | Сейчас: {t}.
other: Вожусь: {t}.
ask: Нужен твой ответ. Гляди в чат. | Вопрос. Я подожду. Мне не сложно.
prompt: Заявка: «{t}». | Принял заявку: «{t}».
go: Ага. Чиню. | Понял. Беру ключ.
notice: Дрон вернулся. Смотрю, что привёз.
fail: Отвалилось: {t}. Перепаяем. | Не завелось: {t}.
danger: Эй. {t} — горячая деталь. | Осторожно: {t}.
wait: Фон крутится. Я подремлю. | Ещё крутится. Жду.
stopped: Выключил. Как скажешь. | Стоп-кран.
crash: Ход сгорел с ошибкой. Перепаяем.
`),
  wick: voice(`
read: Изучаю {t}. | Читаю {t}. Детали решают.
edit: Правлю {t}. | Чищу {t}. Аккуратно.
write: Новый файл: {t}. | Закладываю {t}.
search: Пробиваю: {t}. | Навожу справки: {t}.
web: Проверяю источник: {t}. | Спрашиваю сеть: {t}.
agent: Послал человека: {t}. | Отдал контракт: {t}.
test: Проверяю работу: {t}. | Гоняю тесты: {t}.
build: Собираем: {t}. | Сборка: {t}.
look: Сверяю следы: {t}.
commit: Фиксирую: {t}.
push: Отправляю: {t}.
install: Беру снаряжение: {t}.
run: Работаем: {t}. | Запускаю {t}.
plan: План такой: {t}. | Сейчас: {t}.
other: В деле: {t}.
ask: Решение за тобой, малой. Смотри в чат. | Нужен твой ответ.
prompt: Заказ: «{t}». | Принял заказ: «{t}».
go: Принято. Работаем. | Понял, малой.
notice: Человек вернулся с отчётом. Смотрю.
fail: Осечка: {t}. | Не сработало: {t}. Меняем план.
danger: Стоп. {t} — опасная работа. | Осторожно: {t}.
wait: Люди ещё в поле. Ждём. | Фон работает. Ждём.
stopped: Отбой. | Операция снята.
crash: Операция сорвалась: ошибка хода.
`),
}

const EN: Record<string, Voice> = {
  plain: voice(`
read: Reading {t}
edit: Editing {t}
write: Creating {t}
search: Searching: {t}
web: Looking up: {t}
agent: Sent a helper: {t}
test: Running tests: {t}
build: Building: {t}
look: Checking changes: {t}
commit: Committing: {t}
push: Pushing: {t}
install: Installing: {t}
run: Running {t}
plan: Now: {t}
other: Working on: {t}
ask: I need your answer, check the chat.
prompt: Task: "{t}"
go: Got it.
notice: A background task reported in, checking.
fail: That failed: {t}
danger: Careful: {t}
wait: Background work still running, waiting.
stopped: Stopped.
crash: The turn hit an error.
`),
  kadr: voice(`
read: Reading {t} | Checking the footage: {t} | Close-up on {t}
edit: Editing {t} | Recutting {t}
write: New file: {t} | Shooting from scratch: {t}
search: Searching the archive: {t} | Looking for {t}…
web: Looking it up: {t} | Gathering material: {t}
agent: Second camera: {t} | Sent a partner: {t}
test: Test screening: {t} | Running tests: {t}
build: Rendering: {t} | Building: {t}
look: Checking the reel: {t}
commit: Locking the take: {t}
push: Uploading: {t}
install: Getting new gear: {t}
run: Action: {t} | Running {t}
plan: Now shooting: {t} | Scene: {t}
other: On set: {t}
ask: Cut! I need your answer. | Question for you, check the chat.
prompt: Shooting: "{t}" | Video topic: "{t}"
go: Got it, rolling! | Action, on it!
notice: Second camera reported in, checking.
fail: Bad take: {t} | That failed: {t}. Reshoot.
danger: Stop! Dangerous shot: {t} | Careful: {t}
wait: Second camera still rolling, waiting. | Background work running, waiting.
stopped: Shoot stopped. | Cut. Your call.
crash: The shoot fell apart: the turn hit an error.
`),
  talia: voice(`
read: Reading {t}. Quietly. | Cracking open {t} | Looking at {t}
edit: Rewriting {t} | Patching {t} | Editing {t}. Clean.
write: New implant: {t} | Creating {t}
search: Scanning: {t} | Tracing: {t}
web: Going online: {t} | Checking the net: {t}
agent: Clone deployed: {t} | Sent an agent: {t}
test: Security check: {t} | Running tests: {t}
build: Compiling: {t} | Building: {t}
look: Reading the logs: {t} | Checking traces: {t}
commit: Locking in: {t}
push: Uploading: {t}
install: Loading: {t}
run: Executing: {t} | Running {t}
plan: Current target: {t} | Stage: {t}
other: Connected: {t}
ask: I need your decision. Check the chat. | Question for you. Waiting.
prompt: Target: "{t}" | Task: "{t}"
go: Understood. | Got it. Working.
notice: Background agent is back. Checking.
fail: Blocked: {t} | Failed: {t}. Going in again.
danger: Dangerous: {t}. Look closely. | Careful: {t}
wait: Background still running. Waiting for the signal. | Agents online. Waiting.
stopped: Disconnected. Stopped. | Aborted.
crash: The turn hit an error. I'll clean the traces.
`),
  di: voice(`
read: Looking at {t}. | Taking apart {t}. Bolts in place? | Reading {t}. Sleepily.
edit: Tightening {t}. One more bolt… | Fixing {t}. | Resoldering {t}.
write: New part: {t}. | Building {t} from scratch.
search: It was around here: {t}. | Digging through the drawer: {t}.
web: Reading the manual: {t}. | Looking online: {t}.
agent: Sent the drone: {t}. | Drone's out: {t}.
test: Test run: {t}. | Running tests: {t}.
build: Assembling: {t}. | On the bench: {t}.
look: Checking what got unscrewed: {t}.
commit: Screwing it down: {t}.
push: Shipping: {t}.
install: Fitting parts: {t}.
run: Spinning up: {t}. | Running {t}.
plan: On the bench: {t}. | Now: {t}.
other: Tinkering: {t}.
ask: Need your answer. Check the chat. | A question. I'll wait. Not hard.
prompt: Work order: "{t}". | Took the order: "{t}".
go: Yep. Fixing. | Got it. Grabbing a wrench.
notice: Drone's back. Seeing what it brought.
fail: Fell off: {t}. We'll resolder. | Won't start: {t}.
danger: Hey. {t} is a hot part. | Careful: {t}.
wait: Background's spinning. I'll nap. | Still spinning. Waiting.
stopped: Switched off. Your call. | Emergency stop.
crash: The turn burned out with an error. We'll resolder.
`),
  wick: voice(`
read: Studying {t}. | Reading {t}. Details matter.
edit: Fixing {t}. | Cleaning up {t}. Carefully.
write: New file: {t}. | Laying down {t}.
search: Running a check: {t}. | Asking around: {t}.
web: Checking the source: {t}. | Asking the net: {t}.
agent: Sent someone: {t}. | Handed off the contract: {t}.
test: Checking the work: {t}. | Running tests: {t}.
build: Putting it together: {t}. | Build: {t}.
look: Checking the tracks: {t}.
commit: Locking it in: {t}.
push: Sending it: {t}.
install: Getting gear: {t}.
run: On it: {t}. | Running {t}.
plan: Here's the plan: {t}. | Now: {t}.
other: On the job: {t}.
ask: Your call, kid. Check the chat. | Need your answer.
prompt: The job: "{t}". | Took the job: "{t}".
go: Understood. On it. | Got it, kid.
notice: My guy's back with a report. Checking.
fail: Misfire: {t}. | Didn't work: {t}. Changing the plan.
danger: Stop. {t} is dangerous work. | Careful: {t}.
wait: People still in the field. We wait. | Background's running. We wait.
stopped: Stand down. | Job's off.
crash: The job fell apart: the turn hit an error.
`),
}

/** Реплика о деле голосом героя. n выбирает вариант: один и тот же у дела, пока оно не сменится. */
export const deedLine = (heroId: string, lang: Lang, deed: Deed, n = 0) => {
  const voices = lang === 'en' ? EN : RU
  const list = voices[heroId]?.[deed.kind] ?? voices.plain?.[deed.kind] ?? []

  return (list[n % Math.max(1, list.length)] ?? '').replace('{t}', deed.target)
}

/** Все голоса — для проверки, что у каждого героя есть каждое дело. */
export const VOICES = { ru: RU, en: EN }
