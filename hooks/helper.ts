// Полезное, что делает герой: журнал сессии для /отчёт, подпись о расходе контекста,
// опасные команды и текст звонка.
import type { Usage } from '../types'

export type Entry = { tool: string; target: string; isError: boolean }

export type Journal = { startedAt: number; turns: number; entries: Entry[] }

const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const READS = new Set(['Read', 'NotebookRead', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'ToolSearch'])
const SHELLS = new Set(['Bash', 'PowerShell'])

export const field = (input: object, key: string) => {
  const value = (input as Record<string, unknown>)[key]

  return typeof value === 'string' ? value : ''
}

// Что именно трогал инструмент: файл, команда, запрос.
export const targetOf = (input: object) =>
  (field(input, 'file_path') || field(input, 'notebook_path') || field(input, 'command') ||
    field(input, 'pattern') || field(input, 'url') || field(input, 'query')).replace(/\s+/g, ' ').slice(0, 70)

// Команды, от которых герой пугается: удалить всё, переписать историю, отформатировать диск.
const DANGER = [
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r\s+-f|-f\s+-r|--recursive\s+--force|--force\s+--recursive)\b/i,
  /\bgit\s+push\b[^\n;&|]*\s(--force\b|-f\b)/i,
  /\bgit\s+reset\b[^\n;&|]*\s--hard\b/i,
  /\bRemove-Item\b(?=[^\n;|]*\s-Recurse\b)(?=[^\n;|]*\s-Force\b)/i,
  /\b(del|erase|rd|rmdir)\b[^\n&|]*\s\/s\b/i,
  /(^|[;&|]\s*)format(\.com)?\s+[a-z]:/i,
  /\bFormat-Volume\b/i,
  /\bdrop\s+(table|database)\b/i,
]

export const isDanger = (command: string) => DANGER.some(rule => rule.test(command))

// Команда инструмента командной строки, если это он.
export const commandOf = (tool: string, input: object) => (SHELLS.has(tool) ? field(input, 'command') : '')

/**
 * Ушла ли работа в фон и отчитается позже уведомлением: агент, запущенный асинхронно, или команда в фоне.
 * Смотрим и на вход (run_in_background), и на ответ инструмента (так видно и фон по Ctrl+B или по таймауту).
 */
export const isBackground = (tool: string, input: object, result: unknown) => {
  const out = (typeof result === 'object' && result !== null ? result : {}) as Record<string, unknown>
  const asked = (input as Record<string, unknown>).run_in_background === true
  if (tool === 'Agent' || tool === 'Task') {
    return asked || out.status === 'async_launched' || out.status === 'remote_launched'
  }
  if (SHELLS.has(tool)) {
    // Команда, которую оборвут с концом ответа, уведомления не пришлёт.
    return (asked || typeof out.backgroundTaskId === 'string') && out.backgroundEndsWithFinalResponse !== true
  }

  return false
}

// Строки ответа без разметки; блоки кода, таблицы и заголовки — не содержание.
const plainLines = (answer: string) => {
  const out: string[] = []
  let isCode = false
  for (const raw of answer.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('```')) {
      isCode = !isCode
      continue
    }
    if (isCode || line.startsWith('#') || line.startsWith('|')) {
      continue
    }
    const text = line
      .replace(/^(>\s*)+/, '')
      .replace(/^([-*+]|\d+[.)])\s+/, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|__|`/g, '')
      .trim()
    if (text.length > 3) {
      out.push(text)
    }
  }

  return out
}

const shorten = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max - 2).trimEnd()}…` : text)

/**
 * Текст звонка: вопрос к человеку, если он есть (последняя строка с «?»), иначе первая содержательная
 * строка ответа как есть. Без «Готово:» — ход мог кончиться на «работа идёт».
 */
export const summary = (answer: string, lang: 'ru' | 'en' = 'ru') => {
  const lines = plainLines(answer)
  const question = [...lines].reverse().find(line => line.endsWith('?'))
  if (question) {
    return `${lang === 'en' ? 'Question' : 'Вопрос'}: ${shorten(question)}`
  }

  return lines[0] ? shorten(lines[0]) : lang === 'en' ? 'Claude is waiting for you' : 'Claude ждёт тебя'
}

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path

export const kilo = (n: number) =>
  n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

export const usageLine = (usage: Usage, lang: 'ru' | 'en' = 'ru') => {
  if (!usage.window) {
    return ''
  }
  const money = usage.usd > 0 ? ` · $${usage.usd.toFixed(2)}` : ''

  return lang === 'en'
    ? `context ${Math.round(usage.percent)}% (${kilo(usage.tokens)} of ${kilo(usage.window)})${money}`
    : `контекст ${Math.round(usage.percent)}% (${kilo(usage.tokens)} из ${kilo(usage.window)})${money}`
}

// who — кто рассказывает: значок и имя текущего героя.
export const report = (journal: Journal, usage: Usage, now: number, who = { icon: '🎥', name: 'Роман' }, lang: 'ru' | 'en' = 'ru') => {
  const minutes = Math.max(1, Math.round((now - journal.startedAt) / 60000))
  const edits = new Map<string, number>()
  const commands: string[] = []
  let reads = 0
  let errors = 0
  for (const entry of journal.entries) {
    if (entry.isError) {
      errors += 1
    }
    if (EDITS.has(entry.tool) && entry.target) {
      const name = fileName(entry.target)
      edits.set(name, (edits.get(name) ?? 0) + 1)
    } else if (SHELLS.has(entry.tool) && entry.target) {
      commands.push(`${entry.target.slice(0, 40)}${entry.isError ? ' ✗' : ''}`)
    } else if (READS.has(entry.tool)) {
      reads += 1
    }
  }
  const files = [...edits].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
  const en = lang === 'en'
  const lines = en ? [
    `${who.icon} Report: ${who.name} — ${minutes} min, turns: ${journal.turns}, actions: ${journal.entries.length}`,
    `✏️ Files (${files.length}): ${files.slice(0, 12).join(', ') || 'none changed'}${files.length > 12 ? ' …' : ''}`,
    `⚙️ Commands (${commands.length}): ${[...new Set(commands)].slice(-10).join(' · ') || 'none run'}`,
    `🔎 Read and searched: ${reads}`,
    `${errors > 0 ? '❌' : '✅'} Errors: ${errors}`,
  ] : [
    `${who.icon} Отчёт: ${who.name} — за ${minutes} мин, ходов: ${journal.turns}, действий: ${journal.entries.length}`,
    `✏️ Файлы (${files.length}): ${files.slice(0, 12).join(', ') || 'не менялись'}${files.length > 12 ? ' …' : ''}`,
    `⚙️ Команды (${commands.length}): ${[...new Set(commands)].slice(-10).join(' · ') || 'не запускались'}`,
    `🔎 Прочитано и найдено: ${reads}`,
    `${errors > 0 ? '❌' : '✅'} Ошибок: ${errors}`,
  ]
  const spent = usageLine(usage, lang)
  if (spent) {
    lines.push(spent)
  }

  return lines.join('\n')
}
