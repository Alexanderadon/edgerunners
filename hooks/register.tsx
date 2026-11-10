import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, PromptSubmitInput, Register, Timer, TurnCompleteInput } from 'claude-code'

import type { Mood, Usage } from '../types'
import { CLIPS, COSTARS, TRANSITIONS, WORK, chainPoster, chainSvg, cutAt, flatChain, onceLength, route, skipSteps, stuntReel } from './animation'
import type { ClipName, Part, Step } from './animation'
import { DEFAULT_HERO, HEROES, findHero, heroById, inLang, pickLine } from './characters'
import type { Lang } from './characters'
import type { Hero } from './characters'
import { deedLine, deedOf, failDeed, promptDeed } from './deeds'
import type { Deed, DeedKind } from './deeds'
import { commandOf, isBackground, isDanger, report, summary, targetOf, usageLine } from './helper'
import type { Journal } from './helper'
import { BACKDROPS } from './backdrop'
import { backdropSvg, overlaySvg, screenHeight } from './hud'
import { SPRITES } from './sprites'

// Панель героя справа от чата: открывается только по /persona.
const PANE = 'edgerunners'
const TITLE = 'Персонаж'
// Ширина экрана героя в панели: по ширине панели, в разумных пределах (CSS-пиксели).
const HUD_MIN = 280
const HUD_MAX = 420
// Что герой делает — бегущая строка статуса на экране.
const STATUS: Partial<Record<ClipName, string>> = {
  idle: 'ONLINE', look: 'СМОТРИТ', curious: 'СМОТРИТ', surprised: '!!!', think: 'ДУМАЕТ', walk: 'ИЩЕТ', film: 'СНИМАЕТ',
  happy: 'ГОТОВО', hello: 'ГОТОВО', sad: 'ОШИБКА', sit: 'ОТДЫХ', yawn: 'ОТДЫХ', lie: 'ОТДЫХ', sleep: 'СПИТ',
  wave: 'ПРИВЕТ', nod: 'ПОНЯЛ', laugh: 'ХА-ХА', celebrate: 'ЕСТЬ!', dance: 'ТАНЦУЕТ', type: 'ПЕЧАТАЕТ', read: 'ЧИТАЕТ',
  scan: 'ИЩЕТ', point: 'ЭЙ, ТЫ!', facepalm: 'ОЙ…', angry: 'ЗЛИТСЯ', scared: 'ОПАСНО', shrug: 'НУ ВОТ',
  stretch: 'РАЗМИНКА', bored: 'СКУЧАЕТ', drink: 'ПЕРЕРЫВ', sneeze: 'АПЧХИ', phone: 'НА СВЯЗИ', music: 'МУЗЫКА',
  clap: 'БРАВО', bow: 'ПОКЛОН', selfie: 'ПОЗИРУЕТ', fix: 'НАСТРОЙКА', run: 'БЕЖИТ',
  scratch: 'ОТДЫХ',
}

const hero = atom({ plugin: 'edgerunners', key: 'hero' } as const, DEFAULT_HERO)
const mood = atom({ plugin: 'edgerunners', key: 'mood' } as const, 'idle' as Mood)
const tool = atom({ plugin: 'edgerunners', key: 'tool' } as const, '')
// Реплика к текущей сцене (не «line»: так зовут поля и переменные вокруг).
const phrase = atom({ plugin: 'edgerunners', key: 'line' } as const, '')
// Цепочка частей (Part[]) в JSON: что панель проигрывает сейчас.
const scene = atom({ plugin: 'edgerunners', key: 'scene' } as const, '[{"clip":"idle"}]')
const usage = atom({ plugin: 'edgerunners', key: 'usage' } as const, { percent: 0, tokens: 0, window: 0, usd: 0 } as Usage)

// Звать человека, если работа шла дольше CALL_AFTER (он мог уйти в другое окно), но не чаще раза в CALL_GAP.
const CALL_AFTER = 15_000
const CALL_GAP = 8_000
// Предупредить, когда контекст заполнен на CONTEXT_WARN процентов.
const CONTEXT_WARN = 80

// Журнал сессии для /отчёт; живёт в модуле, после перезагрузки мода начинается заново.
let journal: Journal = { startedAt: 0, turns: 0, entries: [] }
let lastCall = -CALL_GAP
let warnedContext = false
// Фоновые агенты и команды, которые ещё не отчитались уведомлением: пока они есть, «готово» не звоним.
let pending = 0
// Ошибки инструментов за ход: удивился → фейспалм → злится.
let turnErrors = 0
// Идёт ход Claude этой сессии (от prompt.submit до turn.complete): без дела герой не отдыхает и не балуется,
// а питомец по этому флагу держится за занятую сессию.
let busy = false

// Чей ход идёт: человека, уведомления о фоновой задаче, продолжение без новой просьбы; none — начала не видели.
type TurnKind = 'none' | 'user' | 'notice' | 'continuation'
let turnKind: TurnKind = 'none'
// Ход уже открыт в prompt.submit — turn.start к нему ничего не добавляет.
let announced = false
// Когда пришла слэш-команда: ход модели сразу за ней (скилл) — ход человека.
const COMMAND_GAP = 5_000
let commandAt = -COMMAND_GAP
// Человеку ещё причитается радость за его просьбу: она ждёт, пока фоновые задачи не отчитаются, и играет один раз.
let owed = false
// Когда началась работа по просьбе человека: звонок и танец — по всей работе, а не по ходу с уведомлением.
let cycleStart = 0
// Последний законченный ход: второй конец того же хода радости не повторяет.
let lastTurn = ''

// Что герой делает с каким инструментом; прочее — снимает (Талия — взламывает).
const TOOL_CLIPS: Partial<Record<string, ClipName>> = {
  Read: 'read', NotebookRead: 'read',
  Grep: 'scan', Glob: 'scan', LS: 'scan', ToolSearch: 'scan',
  WebFetch: 'walk', WebSearch: 'walk',
  Edit: 'type', Write: 'type', MultiEdit: 'type', NotebookEdit: 'type',
  Bash: 'film', PowerShell: 'film',
  Agent: 'phone', Task: 'phone',
}
// Рабочая сцена держится не меньше WORK_HOLD: инструменты Claude меняются чаще, чем глаз успевает понять сцену.
export const WORK_HOLD = 6_000
// Реакция на ошибку (и испуг) — не чаще раза в OOPS_GAP: параллельные инструменты падают пачкой.
export const OOPS_GAP = 4_000
// Позы отдыха: из них герой сам не уходит, пока его не позовут.
const REST = new Set<ClipName>(['idle', 'sit', 'lie', 'sleep'])
// Сколько ждать без дела, прежде чем сесть, лечь и уснуть.
export const SIT_AFTER = 90_000
export const LIE_AFTER = 160_000
export const SLEEP_AFTER = 260_000
// Мелочи без дела: только без хода, после FIDGET_QUIET тишины и не чаще раза в 45–90 секунд.
export const FIDGET_QUIET = 25_000
export const FIDGET_MIN = 45_000
const FIDGET_MAX = 90_000
// Не в позе отдыха и без хода дольше этого (ход оборвался без конца) — вернуться в стойку.
const STRAY_AFTER = 20_000
// Ход, о конце которого не сообщили, дольше этого без событий не держит героя «занятым».
const BUSY_MAX = 300_000
// Ход короче SHORT_TURN — короткий, дольше LONG_TURN — долгий.
const SHORT_TURN = 15_000
const LONG_TURN = 60_000

export const FIDGETS: readonly (readonly Part[])[] = [
  [{ clip: 'stretch' }], [{ clip: 'scratch' }], [{ clip: 'drink' }], [{ clip: 'phone', ms: 5000 }], [{ clip: 'music', ms: 6000 }],
  [{ clip: 'bored', ms: 4000 }], [{ clip: 'sneeze' }], [{ clip: 'fix' }], [{ clip: 'selfie' }], [{ clip: 'laugh' }], [{ clip: 'look' }],
]
// Выбор героя: поклон, привет, стойка. Питомец играет то же сам, когда героя выбрали в его меню.
// Привет длится ровно до опущенной руки (кадр hello_01), чтобы стойка не начиналась рывком.
const HELLO_MS = 2380
const ENTER: Part[] = [{ clip: 'bow' }, { clip: 'hello', ms: HELLO_MS }, { clip: 'idle' }]
const AFTER_JOY: Part[] = [{ clip: 'hello', ms: HELLO_MS }, { clip: 'idle' }]
// Звонок: показать на человека, помахать.
const RING: Part[] = [{ clip: 'point' }, { clip: 'wave' }, { clip: 'idle' }]
// Реакции на ошибку: по счёту за ход; та же, что только что была, заменяется соседней.
const OOPS: Record<string, readonly Part[]> = {
  surprised: [{ clip: 'surprised' }, { clip: 'facepalm' }],
  facepalm: [{ clip: 'facepalm' }, { clip: 'sad', ms: 2500 }],
  angry: [{ clip: 'angry' }, { clip: 'sad', ms: 2500 }],
}
const INSTEAD: Record<string, string> = { surprised: 'facepalm', facepalm: 'angry', angry: 'facepalm' }

const between = (min: number, max: number) => min + Math.random() * (max - min)
const pickOne = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!

// Режиссёр живёт в модуле: после перезагрузки мода герой просто начнёт с текущей сцены.
type Director = {
  // Где кончится цепочка, когда началась её первая часть и когда кончится разовая часть.
  clip: ClipName
  since: number
  until: number
  lastActivity: number
  // Когда можно следующую мелочь без дела и какая была последней (чтобы не подряд).
  fidgetAt: number
  fidget: number
  parts: Part[]
  line: string
  // Рабочая сцена, которая ждёт, пока текущая отдержится WORK_HOLD.
  want?: ClipName
  // Последняя реакция (ключ OOPS или «scared») и когда была.
  reaction: string
  reactedAt: number
}
const freshDirector = (now = 0): Director => ({
  clip: 'idle', since: 0, until: 0, lastActivity: now, fidgetAt: 0, fidget: -1, parts: [{ clip: 'idle' }], line: '',
  reaction: '', reactedAt: -OOPS_GAP,
})
let director: Director = freshDirector()
// Кто сейчас герой и какое настроение — копия атомов: решение и запись сцены идут без ожиданий между ними.
let current: Hero = heroById(DEFAULT_HERO)
let feeling: Mood = 'idle'
let timer: Timer | undefined
// Открыть панель; без подключённого экрана приложения открывать нечем — тогда молча ничего.
const openPane = async ($: EngineInterface) => {
  await $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
}

const parseParts = (json: string): Part[] => {
  try {
    const parts = (JSON.parse(json) as Part[]).filter(p => p && p.clip in CLIPS)

    return parts.length > 0 ? parts : [{ clip: 'idle' }]
  } catch {
    return [{ clip: 'idle' }]
  }
}

// Первое настоящее действие цепочки — по нему реплика и статус.
const actionOf = (parts: readonly Part[]): ClipName => parts.find(p => !TRANSITIONS.has(p.clip))?.clip ?? 'idle'

// Реплики к сцене у героя с кадрами, иначе по настроению.
// Язык из настроек питомца (assets/pet/settings.json).
let lang: Lang = 'ru'
const linesFor = (hero: Hero, action: ClipName, how: Mood) => {
  const who = inLang(hero, lang)

  return (who.sprite ? who.scenes?.[action] : undefined) ?? who.lines[how]
}

/**
 * Что поставить. say — чьи реплики брать вместо первого действия; keep — доиграть начатый жест (по умолчанию да);
 * from — откуда вести без доигрыша (по умолчанию — от конца цепочки); skip — сколько миллисекунд питомец уже
 * сыграл сам; force — поставить, даже если это та же петля, что идёт (новый герой в той же сцене).
 */
type Staging = { plan: readonly Part[]; say?: ClipName; line?: string; keep?: boolean; from?: ClipName; skip?: number; force?: boolean }

// Дело, о котором герой говорит, пока идёт ход: настоящий файл, команда, задача. Вариант фразы выбран один раз,
// поэтому смена сцены не меняет реплику, а смена героя говорит о том же деле его голосом.
let deed: (Deed & { n: number }) | undefined
const deedText = () => (deed ? deedLine(current.id, lang, deed, deed.n) : '')
const pickN = () => Math.floor(Math.random() * 1000)
const tellDeed = (next: Deed | undefined) => {
  if (!next || (deed && deed.kind === next.kind && deed.target === next.target)) {
    return false
  }
  deed = { ...next, n: pickN() }

  return true
}
// Разовая реплика без цели: «жду фон», «остановили».
const voiced = (kind: DeedKind) => deedLine(current.id, lang, { kind, target: '' }, pickN())
const spoken = (staging: Staging | undefined, line: string): Staging | undefined => staging && { ...staging, line }

// Десктоп-питомец: что ему играть и говорить — файлом, который он сам перечитывает; раз в PET_PULSE —
// отметка «жив» с тем же seq, без неё он уходит.
const PET_PULSE = 15_000
type Costar = { sprite: string; name: string; stunts: Step[][] }
let pet: { seq: string; timeline: readonly Step[]; loop: readonly Step[]; wrote: number; costar?: Costar } = {
  seq: '', timeline: [], loop: [['idle_01', 1000]], wrote: 0,
}

/**
 * Ставит цепочку: доигрывает начатый жест, от него через переходы — к плану. Одна и та же петля второй раз
 * не ставится: новый seq заставил бы питомца начать её сначала. Возвращает, поставила ли.
 */
const commit = (now: number, staging: Staging): boolean => {
  const sprite = current.sprite
  const [first] = staging.plan
  const isSame = staging.plan.length === 1 && first !== undefined && first.ms === undefined && first.clip === director.clip
  if (!staging.force && isSame && now >= director.until) {
    return false
  }
  const at = staging.keep === false
    ? { keep: [] as Part[], offset: 0, from: staging.from ?? director.clip, held: WORK_HOLD }
    : cutAt(director.parts, now - director.since, sprite)
  const next = route(at.from, staging.plan, at.held < WORK_HOLD)
  const parts = [...at.keep, ...next]
  const last = parts[parts.length - 1]!
  const since = now - at.offset
  director = {
    ...director,
    clip: last.clip,
    since,
    until: since + onceLength(parts, sprite),
    parts,
    line: staging.line
      || (staging.say === undefined && busy ? deedText() : '')
      || pickLine(linesFor(current, staging.say ?? actionOf(next), feeling), director.line),
  }
  const { timeline, loop } = flatChain(parts, sprite)
  // Напарник в кадре: Роман в сцене film снимает трюки Талии.
  const costar = sprite ? COSTARS[sprite] : undefined
  const partner = costar?.scene === last.clip ? HEROES.find(one => one.sprite === costar.partner) : undefined
  pet = {
    seq: `${now}-${Math.round(Math.random() * 1e6)}`,
    timeline: skipSteps(timeline, at.offset + (staging.skip ?? 0)),
    loop,
    wrote: now,
    costar: costar && partner ? { sprite: costar.partner, name: inLang(partner, lang).name, stunts: stuntReel(costar.stunts) } : undefined,
  }

  return true
}

/**
 * Решает и ставит сцену. decide получает время и смотрит на режиссёра в тот же миг, когда сцена записывается:
 * между решением и записью нет ожиданий, поэтому тик и событие не поставят одно и то же дважды.
 * touch — это событие от Claude: отсчёт «без дела» начинается заново.
 */
const stage = async ($: EngineInterface, decide: (now: number) => Staging | undefined, touch = false) => {
  const now = await $.clock.now()
  if (touch) {
    director.lastActivity = now
  }
  const staging = decide(now)
  if (!staging || !commit(now, staging)) {
    return false
  }
  void tellPet($)
  // Значения берутся в момент записи: если сцена успела смениться ещё раз, панель получит последнюю.
  await update($, phrase, () => director.line)
  await update($, scene, () => JSON.stringify(director.parts))

  return true
}

// Записи идут по очереди: иначе медленная старая могла лечь поверх новой.
let writing: Promise<void> = Promise.resolve()

// Меню питомца: герои с кадрами, их роль, строка о себе и шкалы.
const roster = () => HEROES.filter(one => one.sprite).map(hero => inLang(hero, lang)).map(one => ({
  id: one.id, sprite: one.sprite, name: one.name, role: one.role ?? '', about: one.about ?? '', stats: one.stats ?? [],
}))
// Реакции на тычок мышью: короткие, стоя, с эффектами.
const POKES = (['laugh', 'wave', 'surprised', 'shrug', 'celebrate'] as const).map(clip => flatChain([{ clip }]).timeline)
const ENTER_STEPS = flatChain(ENTER).timeline

// session — id сессии Claude, busy — идёт ли её ход: питомец держится за одну сессию и не скачет между ними.
const writePet = async ($: EngineInterface) => {
  const now = await $.clock.now()
  const session = await $.session.id().catch(() => '')
  const who = inLang(current, lang)
  await $.fs.write(`${$.plugin.root}/assets/pet/state.json`, JSON.stringify({
    seq: pet.seq, session, busy, hero: who.sprite ?? null, name: who.name, role: who.role ?? '',
    timeline: pet.timeline, loop: pet.loop, line: director.line, alive: now,
    roster: roster(), pokes: POKES, pokeLines: who.pokeLines ?? [], pokeMad: who.pokeMad ?? [], enter: ENTER_STEPS,
    ...(pet.costar ? { costar: pet.costar } : {}),
  }))
}

// Новая реплика без новой сцены: seq прежний, цепочка питомца не начинается заново.
const sayLine = async ($: EngineInterface, line: string) => {
  if (!line) {
    return
  }
  director = { ...director, line }
  void tellPet($)
  await update($, phrase, () => director.line)
}

const tellPet = ($: EngineInterface) => {
  writing = writing.then(() => writePet($)).catch(() => undefined)

  return writing
}

// Запускает питомца отдельной программой Windows; второй экземпляр сам уйдёт (мьютекс в pet.ps1).
// Повторный запуск сразу за первым (старт сессии и тут же /persona) только плодит процессы.
const LAUNCH_GAP = 20_000
let launchedAt = -LAUNCH_GAP

// Окно консоли не должно мелькать ни на секунду (на Windows 11 консоль ещё и открывается в Windows Terminal, где
// -WindowStyle Hidden не помогает). conhost.exe сам окна не создаёт, а с --headless консоль PowerShell внутри
// него создаётся сразу невидимой. Код выхода дочерней программы conhost не возвращает (всегда 0).
const hidden = (argv: readonly string[]): string[] => ['conhost.exe', '--headless', ...argv]

// Аргумент для Start-Process -ArgumentList: он склеивает аргументы пробелами, так что путь с пробелом берём в кавычки.
const psArg = (a: string) => `'${/\s/.test(a) ? `"${a}"` : a}'`

const launchPet = async ($: EngineInterface) => {
  const now = await $.clock.now()
  if (now - launchedAt < LAUNCH_GAP) {
    return
  }
  launchedAt = now
  const root = $.plugin.root.replace(/\//g, '\\').replace(/'/g, "''")
  const args = [
    '--headless', 'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
    '-File', `${root}\\assets\\pet\\pet.ps1`, '-Root', root,
  ]
  // Питомец живёт дольше этого вызова, поэтому стартует отдельным процессом (Start-Process), тоже без окна.
  await $.process.run(hidden([
    'powershell', '-NoProfile', '-WindowStyle', 'Hidden', '-Command',
    `Start-Process conhost.exe -WindowStyle Hidden -ArgumentList ${args.map(psArg).join(',')}`,
  ]), { timeoutMs: 30_000 }).catch(() => undefined)
}

// Отдыхал — сперва потянется.
const wake = (plan: readonly Part[]): Part[] =>
  director.clip === 'sleep' || director.clip === 'lie' ? [{ clip: 'stretch' }, ...plan] : [...plan]

// Стойка без лишних жестов.
const calm = (): Staging => ({ plan: [{ clip: 'idle' }] })

/**
 * Рабочая сцена по инструменту. Та же, что идёт или к которой идём, — ничего. Цепочка идёт к рабочей сцене,
 * которая ещё не отдержалась WORK_HOLD (с момента, как началась её петля), — новая ждёт своей очереди
 * (её поставит тик). Начатый жест доигрывается.
 */
const workPlan = (now: number, clip: ClipName): Staging | undefined => {
  if (director.clip === clip) {
    director.want = undefined

    return undefined
  }
  if (WORK.has(director.clip) && now - director.until < WORK_HOLD) {
    director.want = clip

    return undefined
  }
  director.want = undefined

  return { plan: [{ clip }] }
}

// Реакция на ошибку с хвостом tail: не чаще OOPS_GAP и не та же, что была только что.
const oopsPlan = (now: number, tail: readonly Part[]): Staging | undefined => {
  if (now - director.reactedAt < OOPS_GAP) {
    return undefined
  }
  const due = turnErrors <= 1 ? 'surprised' : turnErrors === 2 ? 'facepalm' : 'angry'
  const key = due === director.reaction ? INSTEAD[due]! : due
  director.reaction = key
  director.reactedAt = now
  director.want = undefined

  return { plan: [...OOPS[key]!, ...tail] }
}

// Радость по длине работы; кивку реплики берутся от радости, а не от «понял».
const joy = (ms: number): { plan: Part[]; say?: ClipName } => {
  if (ms > LONG_TURN) {
    return { plan: [{ clip: 'happy' }, { clip: 'dance', ms: 5000 }] }
  }
  if (ms > SHORT_TURN) {
    return { plan: [{ clip: 'happy' }, { clip: 'celebrate' }] }
  }
  const clip = pickOne<ClipName>(['celebrate', 'clap', 'nod'])

  return { plan: [{ clip }], say: clip === 'nod' ? 'happy' : undefined }
}

// Мелочь без дела: любая, кроме прошлой.
const fidget = (): Part[] => {
  const options = FIDGETS.map((_, i) => i).filter(i => i !== director.fidget)
  const i = pickOne(options)
  director.fidget = i

  return [...FIDGETS[i]!, { clip: 'idle' }]
}

// Что делать без дела: сесть, лечь, уснуть, мелочь, а застрявшего — вернуть в стойку. Во время хода — ничего.
const idlePlan = (now: number): Staging | undefined => {
  if (busy || now < director.until) {
    return undefined
  }
  const idle = now - director.lastActivity
  const at = director.clip
  if (at === 'idle' && idle > SIT_AFTER) {
    return { plan: [{ clip: 'sit' }] }
  }
  if (at === 'sit' && idle > LIE_AFTER) {
    return { plan: [{ clip: 'yawn' }, { clip: 'lie' }] }
  }
  if (at === 'lie' && idle > SLEEP_AFTER) {
    return { plan: [{ clip: 'sleep' }] }
  }
  if (at === 'idle' && idle >= FIDGET_QUIET && now >= director.fidgetAt) {
    director.fidgetAt = now + between(FIDGET_MIN, FIDGET_MAX)

    return { plan: fidget() }
  }
  if (!REST.has(at) && idle > STRAY_AFTER) {
    return calm()
  }

  return undefined
}

// Пишем, только если значение другое: каждая запись перерисовывает панель.
const setMood = async ($: EngineInterface, next: Mood, toolName = '') => {
  feeling = next
  if ((await read($, mood)) !== next) {
    await update($, mood, () => next)
  }
  if ((await read($, tool)) !== toolName) {
    await update($, tool, () => toolName)
  }
}

// Тик, на котором героя сменили здесь: общий выбор из $.store ещё может быть старым.
let ticks = 0
let heroTick = -100
const setHero = async ($: EngineInterface, id: string) => {
  current = heroById(id)
  heroTick = ticks
  await update($, hero, () => current.id)
}

// Та же сцена новым героем, сразу: без входа, без доигрыша и без ожидания удержания.
const recast = (): Staging => ({ plan: [{ clip: director.clip }], keep: false, force: true })

// fromPet — сколько миллисекунд назад героя выбрали в меню питомца: тот уже сам играет вход.
const chooseHero = async ($: EngineInterface, id: string, fromPet?: number) => {
  await setHero($, id)
  await $.store.set('hero', id)
  if (busy) {
    // Ход идёт: герой меняется сразу и продолжает ту же работу; ход идёт дальше как шёл.
    await stage($, recast)
  } else if (fromPet === undefined) {
    await setMood($, 'happy')
    await stage($, () => ({ plan: ENTER }), true)
  } else {
    // Питомец начал вход прямо с поклона, без переходов: продолжаем с того же места.
    await setMood($, 'happy')
    await stage($, () => ({ plan: ENTER, keep: false, from: 'idle', skip: fromPet }), true)
  }
  if (fromPet === undefined && current.sprite) {
    void launchPet($)
  }
}

// Герой общий для всех сессий ($.store): сменили в другой сессии — эта показывает того же и в той же сцене,
// иначе питомец получал бы то одного героя, то другого. isForced — не ждать после своей смены.
const HERO_SYNC = 5
const syncHero = async ($: EngineInterface, isForced = false) => {
  if (!isForced && ticks - heroTick < HERO_SYNC) {
    return
  }
  const saved = await $.store.get('hero').catch(() => undefined)
  const next = typeof saved === 'string' ? heroById(saved) : undefined
  if (!next || next.id === current.id) {
    return
  }
  await setHero($, next.id)
  await stage($, recast)
}

// Выбор в меню питомца: { hero, at }; новое — то, что новее последнего обработанного (он хранится между сессиями).
let lastChoice = 0
// Файл может прийти с BOM (так пишет PowerShell 5) и с at строкой.
const parseChoice = (text: string) => {
  try {
    const value = JSON.parse(text.replace(/^\uFEFF/, '')) as { hero?: unknown; at?: unknown } | null
    const at = Number(value?.at)

    return typeof value?.hero === 'string' && Number.isFinite(at) && at > 0 ? { hero: value.hero, at } : undefined
  } catch {
    return undefined
  }
}

// Настройки пишет меню питомца. Копия в $.store возвращает их, если файл пропал при переустановке мода.
let settingsText: string | undefined
const parseLang = (text: string): Lang => {
  try {
    return (JSON.parse(text.replace(/^\uFEFF/, '')) as { lang?: unknown }).lang === 'en' ? 'en' : 'ru'
  } catch {
    return lang
  }
}
const checkSettings = async ($: EngineInterface) => {
  const path = `${$.plugin.root}/assets/pet/settings.json`
  const text = await $.fs.read(path).catch(() => undefined)
  if (typeof text !== 'string') {
    if (settingsText === undefined) {
      settingsText = ''
      const saved = await $.store.get('settings').catch(() => undefined)
      if (typeof saved === 'string' && saved) {
        lang = parseLang(saved)
        await $.fs.write(path, saved).catch(() => undefined)
      }
    }

    return
  }
  if (text === settingsText) {
    return
  }
  const first = settingsText === undefined
  settingsText = text
  await $.store.set('settings', text).catch(() => undefined)
  const next = parseLang(text)
  if (next === lang) {
    return
  }
  lang = next
  // Язык сменился: та же сцена, но реплика и подписи уже на новом языке.
  if (!first) {
    await stage($, recast)
  }
}

const checkChoice = async ($: EngineInterface) => {
  const text = await $.fs.read(`${$.plugin.root}/assets/pet/choice.json`).catch(() => undefined)
  const choice = typeof text === 'string' ? parseChoice(text) : undefined
  if (!choice || choice.at <= lastChoice) {
    return
  }
  lastChoice = choice.at
  // Этот выбор уже применила другая сессия: второй вход с поклоном не нужен, герой просто тот же.
  const seen = await $.store.get('choiceAt').catch(() => undefined)
  if (typeof seen === 'number' && seen >= choice.at) {
    await syncHero($, true)

    return
  }
  await $.store.set('choiceAt', choice.at).catch(() => undefined)
  const picked = HEROES.find(one => one.sprite && (one.id === choice.hero || one.sprite === choice.hero))
  if (!picked) {
    return
  }
  await chooseHero($, picked.id, Math.max(0, (await $.clock.now()) - choice.at))
}

// Раз в секунду: выбор в меню питомца, общий герой, отметка «жив»; отложенная рабочая сцена, когда ей пора;
// без хода — сесть, лечь, уснуть или побаловаться.
const restOnce = async ($: EngineInterface) => {
  ticks += 1
  await checkSettings($).catch(() => undefined)
  await checkChoice($)
  if (ticks % HERO_SYNC === 0) {
    await syncHero($)
  }
  const now = await $.clock.now()
  if (busy && now - director.lastActivity >= BUSY_MAX) {
    busy = false
    turnKind = 'none'
    pet.wrote = 0
  }
  if (now - pet.wrote >= PET_PULSE) {
    pet.wrote = now
    void tellPet($)
  }
  const want = director.want
  if (want) {
    await stage($, at => (director.want === want ? workPlan(at, want) : undefined))
  } else if (!busy && now >= director.until) {
    await stage($, idlePlan)
  }
}

// Тики таймера не накладываются: медленный файл не даст двух одинаковых сцен подряд.
// Зависший тик держит остальные не дольше REST_STUCK тиков — иначе питомец остался бы без отметки «жив».
const REST_STUCK = 10
let resting = false
let skipped = 0
const rest = async ($: EngineInterface) => {
  if (resting && skipped < REST_STUCK) {
    skipped += 1

    return
  }
  resting = true
  skipped = 0
  try {
    await restOnce($)
  } finally {
    resting = false
  }
}

/**
 * Зовёт человека «входящим вызовом» в духе аниме-киберпанка (если Claude не на виду): портрет героя,
 * его имя, что сделано, рингтон; «ОТВЕТИТЬ» возвращает в Claude. Герои без кадров шлют обычное уведомление.
 */
const callYou = async ($: EngineInterface, text: string) => {
  const now = await $.clock.now()
  if (now - lastCall < CALL_GAP) {
    return
  }
  lastCall = now
  const who = current
  const named = inLang(who, lang)
  const notify = () => $.ui.notify(text, { title: `${who.icon} ${named.name}` }).catch(() => undefined)
  if (!who.sprite) {
    await notify()

    return
  }
  const root = $.plugin.root
  const call = $.process.run(hidden([
    'powershell', '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
    '-File', `${root}/assets/popup/call.ps1`, '-Caller', named.name, '-Text', text,
    '-Portrait', `${root}/assets/pet/${who.sprite}/idle_01.png`, '-Seconds', '15',
  ]), { timeoutMs: 120_000 })
  void call.then(({ exitCode }) => (exitCode === 0 ? undefined : notify()), notify)
}

// Ход начался: человека — кивнуть, присмотреться, задуматься; уведомления — задуматься без «понял»;
// продолжения — не дёргаться (только встать, если отдыхал).
const openTurn = async ($: EngineInterface, kind: Exclude<TurnKind, 'none'>) => {
  const wasBusy = busy
  turnKind = kind
  busy = true
  lastTurn = ''
  director.want = undefined
  let staged = false
  if (kind === 'user') {
    pending = 0
    turnErrors = 0
    director.reaction = ''
    owed = true
    cycleStart = await $.clock.now()
    journal.turns += 1
    await setMood($, 'think')
    staged = await stage($, () => ({ plan: wake([{ clip: 'nod' }, { clip: 'curious', ms: 1500 }, { clip: 'think' }]) }), true)
  } else if (kind === 'notice') {
    await setMood($, 'think')
    staged = await stage($, () => ({ plan: wake([{ clip: 'think' }]) }), true)
  } else {
    staged = await stage($, () => (REST.has(director.clip) && director.clip !== 'idle' ? { plan: wake([{ clip: 'think' }]) } : undefined), true)
  }
  if (!staged && deed) {
    await sayLine($, deedText())
  } else if (!staged && !wasBusy) {
    void tellPet($)
  }
}

// prompt.submit: просьба человека или отчёт фоновой задачи. Уведомление внутрь идущего хода — не новый ход.
// Не человек: отчёт фоновой задачи, расписание, сообщение другой сессии. О таком герой не цитирует текст.
const MACHINE = new Set(['task-notification', 'scheduled-trigger', 'peer', 'peer-send-message'])
const isMachine = (e: PromptSubmitInput) => MACHINE.has(e.origin?.kind ?? '')

const startTurn = async ($: EngineInterface, e: PromptSubmitInput) => {
  const isNotice = e.origin?.kind === 'task-notification'
  if (isNotice) {
    pending = Math.max(0, pending - 1)
  }
  if (e.turnId !== undefined) {
    // Дописка к идущему ходу: герой знает, о чём теперь просят.
    if (!isMachine(e) && !e.command && tellDeed(promptDeed(e.text))) {
      await sayLine($, deedText())
    }

    return
  }
  // Слэш-команда сама показывает своё (/persona — вход героя); если за ней пойдёт ход модели, его откроет turn.start.
  if (e.command) {
    commandAt = await $.clock.now()

    return
  }
  announced = true
  deed = undefined
  tellDeed(isMachine(e) ? { kind: 'notice', target: '' } : promptDeed(e.text))
  await openTurn($, isNotice ? 'notice' : 'user')
}

// turn.start главного цикла без prompt.submit: ход скилла (сразу за слэш-командой) или продолжение.
const beginTurn = async ($: EngineInterface) => {
  if (announced) {
    announced = false

    return
  }
  if (busy && turnKind !== 'none') {
    return
  }
  const now = await $.clock.now()
  const isCommand = now - commandAt < COMMAND_GAP
  commandAt = -COMMAND_GAP
  await openTurn($, isCommand ? 'user' : 'continuation')
}

// Инструмент: герой занят им; опасная команда сперва пугает.
const startTool = async ($: EngineInterface, name: string, input: object) => {
  await setMood($, 'work', name)
  const clip = TOOL_CLIPS[name] ?? 'film'
  const isScary = isDanger(commandOf(name, input))
  const isNew = tellDeed(deedOf(name, input))
  const staged = await stage($, now => {
    if (isScary && director.reaction !== 'scared' && now - director.reactedAt >= OOPS_GAP) {
      director.reaction = 'scared'
      director.reactedAt = now
      director.want = undefined

      return { plan: [{ clip: 'scared' }, { clip }] }
    }

    return workPlan(now, clip)
  }, true)
  // Сцена держится (WORK_HOLD), а дело уже другое — реплика меняется и без новой сцены.
  if (isNew && !staged) {
    await sayLine($, deedText())
  }
}

const failTool = async ($: EngineInterface, name: string, input: object) => {
  turnErrors += 1
  await setMood($, 'sad', name)
  const isNew = tellDeed(failDeed(deedOf(name, input)))
  const staged = await stage($, now => oopsPlan(now, [{ clip: 'think' }]), true)
  if (isNew && !staged) {
    await sayLine($, deedText())
  }
}

/**
 * Конец хода. Своя просьба человека (или ход, начала которого мод не видел) — реакция: радость по длине работы,
 * прерван — пожать плечами, ошибка — как ошибка; долгая работа — звонок. Радость играет один раз за просьбу:
 * пока фоновые задачи не отчитались, она ждёт, и её играет ход с последним уведомлением; остальные ходы
 * с уведомлениями и продолжения кончаются просто стойкой.
 */
const finishTurn = async ($: EngineInterface, e: TurnCompleteInput) => {
  if (e.turnId === lastTurn) {
    return
  }
  lastTurn = e.turnId
  const kind = turnKind
  const isOwn = kind === 'user' || kind === 'none'
  turnKind = 'none'
  announced = false
  busy = false
  deed = undefined
  director.want = undefined
  let staged = false
  // Чем кончилось на самом деле: первая строка ответа, вопрос к человеку, ошибка.
  let said = ''
  if (e.reason === 'error') {
    owed = false
    turnErrors += 1
    await setMood($, 'sad')
    said = voiced('crash')
    staged = await stage($, now => spoken(oopsPlan(now, [{ clip: 'idle' }]) ?? calm(), said), true)
  } else if (e.reason !== 'answer') {
    owed = false
    await setMood($, e.reason === 'refusal' ? 'sad' : 'idle')
    said = isOwn ? voiced('stopped') : ''
    staged = await stage($, () => spoken(isOwn ? { plan: [{ clip: 'shrug' }, { clip: 'idle' }] } : calm(), said), true)
  } else if (!isOwn && !owed) {
    await setMood($, 'idle')
    staged = await stage($, calm, true)
  } else if (pending > 0) {
    // Агенты и фоновые команды ещё работают: ход кончился на «работа идёт» — кивнуть и ждать их отчёта.
    owed = true
    await setMood($, 'work')
    said = voiced('wait')
    staged = await stage($, () => spoken(isOwn ? { plan: [{ clip: 'nod' }, { clip: 'phone', ms: 3000 }, { clip: 'idle' }], say: 'phone' } : calm(), said), true)
  } else {
    owed = false
    await setMood($, 'happy')
    const now = await $.clock.now()
    const worked = Math.max(e.durationMs, cycleStart > 0 ? now - cycleStart : 0)
    cycleStart = 0
    const ringing = worked > CALL_AFTER && now - lastCall >= CALL_GAP
    const { plan, say } = joy(worked)
    said = summary(e.answer, lang)
    staged = await stage($, () => ({ plan: [...plan, ...(ringing ? RING : AFTER_JOY)], say: ringing ? 'point' : say, line: said }), true)
    if (ringing) {
      void callYou($, summary(e.answer, lang)).catch(() => undefined)
    }
  }
  // Сцена та же, а ход кончился: питомец должен узнать, что сессия свободна.
  if (!staged && said) {
    await sayLine($, said)
  } else if (!staged) {
    void tellPet($)
  }
}

// /report и /отчёт: что Claude сделал за сессию — от имени текущего героя.
const answerReport = async ($: EngineInterface) => ({
  text: report(journal, await read($, usage), await $.clock.now(), inLang(heroById(await read($, hero)), lang), lang),
})

const heroList = () =>
  HEROES.map(hero => inLang(hero, lang)).map(one => `${one.icon} ${one.name}${one.role ? ` (${one.role.toLowerCase()})` : ''} — /persona ${one.aliases[0]}`).join('\n')

type Screen = { width: number; name: string; status: string; line: string; usage: Usage; face: string; sprite?: string }

// Экран героя: на десктопе и телефоне — киберпанк-фон и поверх него прозрачный слой с героем и текстом,
// в терминале — кадр героя и строки.
// Svg есть в таблице и у терминала, но там он пустой: картинки рисуем только там, где их видно.
const drawScreen = (els: ElementTable, parts: Part[], screen: Screen, isPicture: boolean) => {
  const set = screen.sprite ? SPRITES[screen.sprite] : undefined
  const png = (frame: string) => set?.frames[frame] ?? set?.frames.idle_01 ?? ''
  if (isPicture && 'Svg' in els) {
    const { Box, Svg } = els
    const overlay = overlaySvg({
      ...screen,
      hero: set ? budget => chainSvg(parts, png, set.size, budget) : undefined,
      heroSize: set?.size,
      portrait: set?.frames.idle_01,
    })
    // Не h: так называется функция, в которую собирается JSX.
    const tall = screenHeight(screen.width)
    const backdrop = BACKDROPS[screen.sprite ?? DEFAULT_HERO] ?? BACKDROPS[DEFAULT_HERO]

    return (
      <Box key="screen">
        {backdrop && <Svg source={backdropSvg(screen.width, backdrop)} alt=" " width={screen.width} height={tall} />}
        <Box key="overlay" position="absolute" top={0} left={0}>
          <Svg source={overlay} alt={screen.line} width={screen.width} height={tall} />
        </Box>
      </Box>
    )
  }
  const { Box, Text } = els
  const picture = set && 'Image' in els
    ? <els.Image key="hero" source={{ png: png(chainPoster(parts)) }} columns={18} rows={12} alt={screen.face} />
    : <Text bold>{screen.face}</Text>

  return (
    <Box flexDirection="column">
      {picture}
      <Text italic>«{screen.line}»</Text>
      <Text dimColor>{usageLine(screen.usage)}</Text>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('hero')
    await setHero($, typeof saved === 'string' ? heroById(saved).id : (await read($, hero)))
    const seen = await $.store.get('choiceAt')
    lastChoice = typeof seen === 'number' ? seen : 0
    await checkSettings($).catch(() => undefined)
    await setMood($, 'idle')
    const now = await $.clock.now()
    director = freshDirector(now)
    journal = { startedAt: now, turns: 0, entries: [] }
    pending = 0
    turnErrors = 0
    busy = false
    turnKind = 'none'
    announced = false
    owed = false
    cycleStart = 0
    await stage($, () => ({ plan: [{ clip: 'wave' }, { clip: 'idle' }] }))
    // Выбор героя — и посреди хода: иначе команда ждала бы его конца.
    await $.command.register({
      name: 'persona',
      description: `Выбрать персонажа: ${HEROES.map(one => one.aliases[0]).join(', ')}`,
      immediate: true,
    })
    // Кириллическое имя движок может не принять — тогда остаётся /report.
    for (const name of ['report', 'отчёт']) {
      await $.command.register({
        name,
        description: 'Отчёт героя: что Claude сделал за сессию, ошибки, контекст',
        immediate: true,
      }).catch(() => undefined)
    }
    // Панель сама не открывается: владелец не хочет отдельного окна, она только по /persona.
    // Вместо неё герой живёт десктоп-питомцем в углу окна Claude.
    if (current.sprite) {
      void launchPet($)
    }
    timer?.cancel()
    timer = $.clock.every(1000, () => {
      void rest($).catch(() => undefined)
    })

    return next(e)
  })

  // /persona открывает экран героя в панели; работает и посреди хода.
  on('command.run', { command: 'persona' }, async ($, e) => {
    void openPane($)
    const word = e.args.trim()
    if (!word) {
      return { text: lang === 'en' ? `Now: ${current.icon} ${inLang(current, lang).name}\n\n${heroList()}` : `Сейчас: ${current.icon} ${current.name}\n\n${heroList()}` }
    }
    const picked = findHero(word)
    if (!picked) {
      return { text: lang === 'en' ? `No character "${word}". Available:\n${heroList()}` : `Не знаю персонажа «${word}». Есть:\n${heroList()}` }
    }
    await chooseHero($, picked.id)

    return { text: lang === 'en' ? `${picked.faces.happy} ${inLang(picked, lang).name} is online!` : `${picked.faces.happy} ${picked.name} на связи!` }
  })

  on('command.run', { command: 'report' }, answerReport).catch(() => ({ text: 'Отчёт не собрался — попробуй ещё раз.' }))
  on('command.run', { command: 'отчёт' }, answerReport).catch(() => ({ text: 'Отчёт не собрался — попробуй ещё раз.' }))

  // Расход контекста: подпись в панели и предупреждение, когда пора сжимать.
  on('session.measure', async ($, e, next) => {
    const now: Usage = {
      percent: e.context.percent ?? 0,
      tokens: e.context.tokens ?? 0,
      window: e.context.window,
      usd: e.cost?.usd ?? 0,
    }
    const was = await read($, usage)
    if (Math.round(was.percent) !== Math.round(now.percent) || Math.abs(was.usd - now.usd) >= 0.01 || was.window !== now.window) {
      await update($, usage, () => now)
    }
    if (now.percent >= CONTEXT_WARN && !warnedContext) {
      warnedContext = true
      $.ui.toast(`Контекст заполнен на ${Math.round(now.percent)}% — пора набрать /compact`)
    }
    if (now.percent < CONTEXT_WARN - 20) {
      warnedContext = false
    }

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const style = inLang(heroById(await read($, hero)), lang).style
    if (!style) {
      return composed
    }

    return {
      sections: [
        ...composed.sections,
        { id: 'edgerunners:style', text: style, scope: 'session' },
      ],
    }
  })

  // Герой — украшение: его сбой не должен задерживать промпт или инструмент (next в .catch не запускает их повторно).
  on('prompt.submit', async ($, e, next) => {
    await startTurn($, e).catch(() => undefined)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    // Ход субагента — не ход сессии.
    if (e.agentId === undefined) {
      await beginTurn($).catch(() => undefined)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    // Инструменты субагентов в журнал, но не в сцену: пока агенты работают, герой на связи с ними.
    const isMain = e.agentId === undefined
    if (isMain) {
      await startTool($, e.tool, e).catch(() => undefined)
    }
    const ran = await next(e)
    const isError = ran.deny !== undefined || ran.isError === true
    journal.entries.push({ tool: e.tool, target: targetOf(e), isError })
    if (isMain && !isError && isBackground(e.tool, e, ran.result)) {
      pending += 1
    }
    if (isMain && isError) {
      await failTool($, e.tool, e).catch(() => undefined)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    // Конец хода субагента — не конец работы.
    if (e.agentId === undefined) {
      await finishTurn($, e).catch(() => undefined)
    }

    return next(e)
  })

  // Экран героя в панели справа от чата.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const now = heroById(await read($, hero))
    const how = await read($, mood)
    const parts = parseParts(await read($, scene))
    const action = actionOf(parts)
    // Колонка панели — около 8 пикселей; экран занимает её ширину без отступов.
    const width = Math.max(HUD_MIN, Math.min(HUD_MAX, (e.props.bodyColumns - 2) * 8))

    return drawScreen(els, parts, {
      width,
      name: now.name,
      status: now.status?.[action] ?? STATUS[action] ?? 'ONLINE',
      line: (await read($, phrase)) || (now.lines[how][0] ?? ''),
      usage: await read($, usage),
      face: now.faces[how],
      sprite: now.sprite,
    }, e.surface === 'desktop' || e.surface === 'mobile')
  })
}
