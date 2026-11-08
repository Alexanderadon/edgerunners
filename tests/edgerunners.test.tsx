import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { CLIPS, FX, HERO_CLIPS, STUNTS, SVG_LIMIT, chainSvg, cutAt, flatChain, heroFrames, route, skipSteps, stuntReel, transitions } from '../hooks/animation'
import type { Clip, ClipName } from '../hooks/animation'
import { HEROES, heroById, inLang, pickLine } from '../hooks/characters'
import { ANIME } from '../hooks/lines'
import { VOICES, deedLine, deedOf, failDeed, promptDeed } from '../hooks/deeds'
import { isDanger, report, summary } from '../hooks/helper'
import { SPRITES } from '../hooks/sprites'

// Панель героя справа от чата.
const PANE = {
  plugin: 'edgerunners',
  component: 'Pane',
  requestId: 'edgerunners',
  props: {
    title: 'Персонаж',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const COMPOSE = {
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  surfaces: ['desktop'],
  tools: [],
  outputStyle: null,
  traits: [],
} as const

const persona = (args: string) =>
  ({
    command: 'persona',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  }) as const

const START = { cwd: '/', surface: 'desktop', isInteractive: true } as const
const TYPED = { wait: false, origin: { kind: 'composer' } } as const
const NOTICE = { text: '<task-notification>done</task-notification>', wait: false, origin: { kind: 'task-notification' } } as const
const RAN = { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as const
const SESSION = 'test-session'

// Что мод зарегистрировал командами: их описания и какие идут посреди хода.
let descriptions: string[] = []
let immediate: string[] = []

// Под плагином ничего нет: эти хуки играют роль движка.
const engine = (on: On, withTools = true, withScreen = true) => {
  mock.store(on)
  const clock = mock.clock(on)
  descriptions = []
  immediate = []
  on('command.register', (_, e) => {
    descriptions.push(e.description)
    if (e.immediate) {
      immediate.push(e.name)
    }

    return { value: { command: 'persona' } }
  })
  if (withScreen) {
    on('ui.open', () => ({ value: { isPlaced: true } }))
  }
  on('session.id', () => ({ value: SESSION }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  if (withTools) {
    on('tool.call', () => ({ result: {} }))
  }
  on('prompt.compose', () => ({
    sections: [{ id: 'intro', text: 'intro', scope: 'shared' }],
  }))

  return clock
}

type Step = [string, number, string?]
type PetState = {
  seq: string; session: string; busy: boolean; hero: string | null; name: string; role: string
  timeline: Step[]; loop: Step[]; line: string; alive: number
  roster: { id: string; sprite: string; name: string; role: string; about: string; stats: [string, number][] }[]
  pokes: Step[][]; pokeLines: string[]; enter: Step[]
  costar?: { sprite: string; name: string; stunts: Step[][] }
}

// Что мод пишет питомцу: каждое состояние по порядку.
const petStates = (on: On) => {
  const states: PetState[] = []
  on('fs.write', (_, e) => {
    if (/assets[\\/]pet[\\/]state\.json$/.test(e.path)) {
      states.push(JSON.parse(e.text) as PetState)
    }

    return { value: undefined }
  })

  return states
}

const lastOf = (states: PetState[]) => states[states.length - 1]!
// Только новые сцены: записи с тем же seq — отметки «жив».
const scenesIn = (states: PetState[]) => states.filter((s, i) => i === 0 || s.seq !== states[i - 1]!.seq)

// Какой клип играет питомец в конце цепочки (по первому кадру петли).
const clipOf = (state: PetState | undefined) => state?.loop[0]?.[0].replace(/_\d+$/, '') ?? ''
const framesOf = (state: PetState | undefined) => [...(state?.timeline ?? []), ...(state?.loop ?? [])].map(s => s[0])
// Кадры без переходов (камера, подбородок, сесть-лечь-уснуть): с чего начинается само действие.
const actionFrames = (state: PetState | undefined) => framesOf(state).filter(f => !/^(rc|tc|sd|ld|fa)_/.test(f))

// Слой экрана поверх фона: Svg с героем, репликой (в подписи) и шкалой.
const overlayOf = async (ui: { find: (q: { key: string }) => Promise<{ children: unknown[] } | undefined> }) =>
  ((await ui.find({ key: 'overlay' }))?.children[0] as { props: Record<string, unknown> } | undefined)

const lineOf = async ($: Engine) => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // Экран героя — одна картинка; его реплика — её подпись.
  const text = String((await overlayOf(ui))?.props.alt ?? '')
  await ui.unmount()

  return text
}

const ROMAN = heroById('kadr')
const TALIA = heroById('talia')
const DI = heroById('di')
const WICK = heroById('wick')
const scenesOf = (id: string, clip: string) => heroById(id).scenes?.[clip] ?? []

// Имена кадров из контракта docs/plan-v8.md: одни на всех героев.
const series = (name: string, count: number) => Array.from({ length: count }, (_, i) => `${name}_0${i + 1}`)
const OLD_FRAMES = [
  ...series('idle', 3), 'look_01', 'look_02', 'filmyou_01', 'curious_01', 'surprised_01', ...series('think', 4), ...series('walk', 8),
  ...series('film', 8), ...series('happy', 6), ...series('hello', 4), ...series('sad', 4), 'sit_01', 'sit_02', 'yawn_01', 'doze_01',
  'lie_01', 'lie_02', 'sleep_01',
]
// Переходы и покой v8.1: сесть, лечь, уснуть, поднять камеру, рука к подбородку, мелочи покоя.
const MOVES = [...series('sd', 8), ...series('ld', 4), ...series('fa', 4), ...series('rc', 4), ...series('tc', 4), ...series('iv', 8)]
// Старые кадры переходов остаются файлами, но больше не играются.
const RETIRED = /^(sitdown|liedown|fallasleep|raisecam|tochin)_/
const NEW_CLIPS = ['wave', 'nod', 'laugh', 'celebrate', 'dance', 'type', 'read', 'scan', 'point', 'facepalm', 'angry', 'scared',
  'shrug', 'stretch', 'bored', 'drink', 'sneeze', 'phone', 'music', 'clap', 'bow', 'selfie', 'fix', 'run'] as const
const NEW_LOOPS = new Set(['dance', 'type', 'read', 'scan', 'bored', 'phone', 'music', 'run'])
const CONTRACT = new Set([...OLD_FRAMES, ...MOVES, ...NEW_CLIPS.flatMap(clip => series(clip, clip === 'dance' || clip === 'run' ? 8 : 4))])
// Кадры только у одного героя: ракурсы съёмки Романа и трюки Талии-напарницы.
const OWN: Record<string, string[]> = { kadr: series('an', 8), talia: [...series('lp', 8), ...series('pk', 8)] }
const TRANSITION_PAIRS = [
  ['sitDown', 'standUp', 'sd', 8], ['lieDown', 'getUp', 'ld', 4], ['fallAsleep', 'wakeUp', 'fa', 4],
  ['raiseCam', 'lowerCam', 'rc', 4], ['toChin', 'fromChin', 'tc', 4],
] as const
const TRANSITIONS = new Set<string>(TRANSITION_PAIRS.flatMap(([there, back]) => [there, back]))
const ACTIONS = Object.keys(CLIPS).filter(name => !TRANSITIONS.has(name))
const ALL_FRAMES = [...new Set(Object.values(CLIPS).flatMap((clip: Clip) => clip.steps.map(([f]) => f)))]
const FIDGET = /^(stretch|iv|drink|phone|music|bored|sneeze|fix|selfie|laugh|look)_/
const sum = (steps: readonly (readonly [string, number, string?])[]) => steps.reduce((all, [, ms]) => all + ms, 0)

test('по умолчанию Роман, и его стиль уходит в системный промпт', async ($, on) => {
  engine(on)
  await $.session.start(START)

  const composed = await $.prompt.compose(COMPOSE)
  const style = composed.sections.find(s => s.id === 'edgerunners:style')
  expect(style?.text).toContain('Роман, весёлый')
  expect(style?.scope).toBe('session')
})

test('все клипы из кадров контракта, у новых — стойка, эффекты допустимые, петли как в контракте', () => {
  for (const [name, clip] of Object.entries(CLIPS) as [string, Clip][]) {
    expect([name, clip.steps.length > 0]).toEqual([name, true])
    for (const [frame, ms, fx] of clip.steps) {
      expect([name, frame, CONTRACT.has(frame)]).toEqual([name, frame, true])
      expect([name, frame, ms >= 60 && ms <= 6000]).toEqual([name, frame, true])
      expect([name, frame, fx === undefined || FX.includes(fx)]).toEqual([name, frame, true])
    }
  }
  for (const name of NEW_CLIPS) {
    const clip: Clip = CLIPS[name]
    expect([name, clip.posture, clip.loop === true]).toEqual([name, 'stand', NEW_LOOPS.has(name)])
  }
  // Каждый кадр контракта где-то играется, а старые кадры переходов — нигде.
  expect(ALL_FRAMES.length).toBe(CONTRACT.size)
  expect(ALL_FRAMES.filter(f => RETIRED.test(f))).toEqual([])
  // Свои клипы героев — из общих кадров и его собственных; трюки — из кадров Талии.
  for (const [sprite, clips] of Object.entries(HERO_CLIPS)) {
    for (const [name, clip] of Object.entries(clips ?? {}) as [string, Clip][]) {
      for (const [frame] of clip.steps) {
        expect([sprite, name, frame, CONTRACT.has(frame) || (OWN[sprite] ?? []).includes(frame)]).toEqual([sprite, name, frame, true])
      }
    }
  }
  for (const [name, clip] of Object.entries(STUNTS) as [string, Clip][]) {
    expect([name, clip.steps.every(([f]) => OWN.talia!.includes(f) && !CONTRACT.has(f))]).toEqual([name, true])
  }
  // Свои кадры — только у своего героя.
  for (const sprite of ['kadr', 'talia', 'di', 'wick']) {
    const frames = heroFrames(sprite)
    for (const [owner, own] of Object.entries(OWN)) {
      expect([sprite, owner, own.every(f => frames.includes(f))]).toEqual([sprite, owner, sprite === owner])
      expect([sprite, owner, own.some(f => frames.includes(f))]).toEqual([sprite, owner, sprite === owner])
    }
  }
  // Движение даёт сам рисунок: новые клипы не сплющиваются и не прыгают кодом (только испуг дрожит),
  // а у радости остаются сжатие перед прыжком и приземление.
  for (const name of NEW_CLIPS) {
    const fx = (CLIPS[name] as Clip).steps.map(s => s[2]).filter(f => f !== undefined)
    expect([name, fx]).toEqual([name, name === 'scared' ? fx.map(() => 'shake') : []])
  }
  const joy = (CLIPS.happy as Clip).steps.map(s => s[2])
  expect(joy.filter(f => f !== undefined)).toEqual([])
})

test('переходы: свои кадры, 90–140 мс, медленнее в начале и в конце, обратно быстрее; пробуждение вздрагивает', () => {
  for (const [there, back, name, count] of TRANSITION_PAIRS) {
    const go = (CLIPS[there] as Clip).steps
    const ret = (CLIPS[back] as Clip).steps
    expect([there, go.map(([f]) => f)]).toEqual([there, series(name, count)])
    expect([back, ret.map(([f]) => f)]).toEqual([back, series(name, count).reverse()])
    for (const [clip, steps] of [[there, go], [back, ret]] as const) {
      const ms = steps.map(([, d]) => d)
      const middle = Math.max(...ms.slice(1, -1))
      expect([clip, ms.every(d => d >= 90 && d <= 140)]).toEqual([clip, true])
      expect([clip, ms[0]! >= middle && ms[ms.length - 1]! >= middle]).toEqual([clip, true])
      const fx = steps.map(s => s[2]).filter(f => f !== undefined)
      expect([clip, fx]).toEqual([clip, clip === 'wakeUp' ? ['shake'] : []])
    }
    expect([back, sum(ret) < sum(go)]).toEqual([back, true])
  }
  expect((CLIPS.wakeUp as Clip).steps[0]).toEqual(['fa_04', 120, 'shake'])
  // Сесть, лечь, уснуть и обратно — через новые кадры.
  const down = route('idle', [{ clip: 'sleep' }]).map(p => p.clip)
  expect(down).toEqual(['sitDown', 'lieDown', 'fallAsleep', 'sleep'])
  const steps = flatChain(route('idle', [{ clip: 'sleep' }])).timeline.map(([f]) => f)
  expect(steps).toEqual([...series('sd', 8), ...series('ld', 4), ...series('fa', 4)])
  // Рабочие сцены, сменившиеся раньше удержания, — без камеры вверх-вниз; задумчивость — с рукой у подбородка.
  expect(transitions('film', 'type')).toEqual(['lowerCam'])
  expect(transitions('film', 'type', true)).toEqual([])
  expect(transitions('type', 'film', true)).toEqual([])
  expect(transitions('think', 'film', true)).toEqual(['fromChin', 'raiseCam'])
})

test('покой живёт, но не мельтешит: только позы рядом со стойкой, долгие удержания; рука к голове — отдельной мелочью', () => {
  const idle = (CLIPS.idle as Clip).steps
  const iv = idle.filter(([f]) => f.startsWith('iv_')).map(([f]) => f)
  expect([...iv].sort()).toEqual(['iv_02', 'iv_03', 'iv_04', 'iv_07', 'iv_08'])
  const scratch = (CLIPS.scratch as Clip).steps.map(([f]) => f)
  expect(['iv_01', 'iv_05', 'iv_06', 'filmyou_01'].every(f => scratch.includes(f))).toBe(true)
  // Круг покоя — не меньше 40 секунд, из них стойка (idle_01 и моргание) — больше 60%.
  expect(sum(idle) >= 40_000).toBe(true)
  const still = sum(idle.filter(([f]) => f === 'idle_01' || f === 'idle_02'))
  expect(still / sum(idle) > 0.6).toBe(true)
  // Перед каждой мелочью — не меньше 1,5 секунды стойки (кроме «оглянулся» в обе стороны подряд).
  idle.forEach(([f], i) => {
    if (f.startsWith('iv_') && f !== 'iv_04') {
      expect([f, idle[i - 1]![0] === 'idle_01' && idle[i - 1]![1] >= 1500]).toEqual([f, true])
    }
  })
})

test('Роман снимает с разных ракурсов, у Талии film — взлом; трюки напарника — игровой ритм, серией', () => {
  const roman = flatChain([{ clip: 'film' }], 'kadr').loop.map(([f]) => f)
  expect([...new Set(roman.filter(f => f.startsWith('an_')))].sort()).toEqual(series('an', 8))
  expect(roman.filter(f => f.startsWith('film_')).length).toBe(24)
  // С колена — после стойки, сверху — после стойки ещё раз.
  expect(roman.indexOf('an_01') < roman.indexOf('an_05')).toBe(true)
  // Между ракурсами — стойка и переходы: камера не перепрыгивает из позы в позу.
  const between = roman.slice(roman.indexOf('an_04') + 1, roman.indexOf('an_05'))
  expect(between.some(f => f.startsWith('film_'))).toBe(true)
  expect(between.every(f => /^(film|rc|sd)_|^an_08$/.test(f))).toBe(true)
  expect(roman[roman.indexOf('an_01') - 1]).toBe('sd_03')
  for (const sprite of ['talia', 'di', 'wick', undefined]) {
    expect([sprite, flatChain([{ clip: 'film' }], sprite).loop.map(([f]) => f)]).toEqual([sprite, series('film', 8)])
  }
  const leap = STUNTS.leap.steps as readonly (readonly [string, number])[]
  const ms = (frame: string) => leap.find(([f]) => f === frame)![1]
  // Разбег медленнее полёта, приземление в присед держится.
  expect(ms('lp_01') > ms('lp_04') && ms('lp_02') > ms('lp_05')).toBe(true)
  expect(ms('lp_07') >= 300).toBe(true)
  expect(sum(STUNTS.parkour.steps) > 1000).toBe(true)
  // Серия: 4–6 трюков, один повторяется не больше двух раз подряд, потом смена.
  for (let seed = 0; seed < 40; seed += 1) {
    let x = seed * 7919 + 1
    const random = () => {
      x = (x * 48271) % 2147483647

      return x / 2147483647
    }
    const reel = stuntReel(['leap', 'parkour'], random).map(steps => steps[0]![0].slice(0, 2))
    expect([seed, reel.length >= 4 && reel.length <= 6]).toEqual([seed, true])
    expect([seed, reel.every(kind => kind === 'lp' || kind === 'pk')]).toEqual([seed, true])
    expect([seed, reel.some((kind, i) => i > 1 && kind === reel[i - 1] && kind === reel[i - 2])]).toEqual([seed, false])
    expect([seed, new Set(reel).size]).toEqual([seed, 2])
  }
})

test('цепочку не рвут на середине жеста: доигрывается жест, вход в сцену бросается', () => {
  const plan = route('idle', [{ clip: 'nod' }, { clip: 'curious', ms: 1500 }, { clip: 'think' }])
  // На кивке — доиграть кивок и вести от него.
  const onNod = cutAt(plan, 300)
  expect([onNod.keep.map(p => p.clip), onNod.offset, onNod.from]).toEqual([['nod'], 300, 'nod'])
  // На любопытстве (петля) — идти сразу от неё.
  const onCurious = cutAt(plan, 1500)
  expect([onCurious.keep, onCurious.from, onCurious.held]).toEqual([[], 'curious', 1500 - 1100])
  // Рука к подбородку, а думать уже не надо — не доигрывать.
  const onChin = cutAt(plan, 2700)
  expect([onChin.keep, onChin.from]).toEqual([[], 'toChin'])
  // Доигрывается только начатый жест: хвост цепочки за ним новое не ждёт.
  const oops = cutAt([{ clip: 'surprised' }, { clip: 'facepalm' }, { clip: 'think' }], 100)
  expect([oops.keep.map(p => p.clip), oops.offset, oops.from]).toEqual([['surprised'], 100, 'surprised'])
  // Переход позы тоже не рвут: встаёт до конца, дальше маршрут ведёт от него.
  const rising = cutAt(route('sleep', [{ clip: 'idle' }]), 500)
  expect([rising.keep.map(p => p.clip), rising.from]).toEqual([['getUp'], 'getUp'])
  // Разовый клип в конце давно доигран — стоит на последнем кадре.
  expect(cutAt([{ clip: 'wave' }], 5000)).toEqual({ keep: [], offset: 0, from: 'wave', held: 5000 - 1320 })
})

test('старые клипы Кадра нарисованы и влезают в Svg, как и самая длинная цепочка', () => {
  const set = SPRITES.kadr!
  const png = (frame: string) => set.frames[frame] ?? set.frames.idle_01 ?? ''
  for (const frame of OLD_FRAMES) {
    expect([frame, Boolean(set.frames[frame])]).toEqual([frame, true])
  }
  for (const name of Object.keys(CLIPS)) {
    expect([name, chainSvg([{ clip: name as ClipName }], png, set.size).length < SVG_LIMIT]).toEqual([name, true])
  }
  // Проснуться, встать, заинтересоваться и задуматься — переходы на месте.
  const wake = route('sleep', [{ clip: 'curious', ms: 1800 }, { clip: 'think' }]).map(p => p.clip)
  expect(wake).toEqual(['wakeUp', 'getUp', 'standUp', 'curious', 'toChin', 'think'])
  expect(chainSvg(route('sleep', [{ clip: 'curious', ms: 1800 }, { clip: 'think' }]), png, set.size).length < SVG_LIMIT).toBe(true)
})

// В тестах нет файловой системы: проверяем кадры, собранные из assets/<герой> в hooks/sprites (панель).
// Кадры питомца (assets/pet/<герой>) проверяет `node tools/pet-demo.mjs check`. Пока кадры рисуются — пропуск,
// а чего не хватает, видно в названии теста.
for (const one of HEROES.filter(each => each.sprite)) {
  const set = SPRITES[one.sprite!]
  const frames = heroFrames(one.sprite!)
  const missing = set ? frames.filter(frame => !set.frames[frame]) : frames
  const note = !set ? ' — пропуск: кадров ещё нет' : missing.length ? ` — пропуск: нет ${missing.length} кадров (${missing.join(' ')})` : ''
  test(`все кадры клипов нарисованы у ${one.sprite}${note}`, () => {
    if (missing.length > 0) {
      return
    }
    expect(missing).toEqual([])
  })
}

test('flatChain несёт эффекты шагов; замерший последний кадр — без эффекта; пропуск сыгранного', () => {
  const { timeline, loop } = flatChain([{ clip: 'happy' }, { clip: 'dance', ms: 600 }, { clip: 'idle' }])
  expect(timeline[0]).toEqual(['happy_01', 180])
  expect(flatChain([{ clip: 'surprised' }]).timeline[0]).toEqual(['surprised_01', 800, 'hop'])
  expect(flatChain([{ clip: 'scared' }]).timeline[2]).toEqual(['scared_03', 350, 'shake'])
  expect(timeline.slice(6)).toEqual([['dance_01', 150], ['dance_02', 150], ['dance_03', 150], ['dance_04', 150]])
  expect(loop[0]![0]).toBe('idle_01')
  // Разовый клип в конце замирает на последнем кадре, без повтора эффекта.
  expect(flatChain([{ clip: 'celebrate' }]).loop).toEqual([['celebrate_04', 1000]])
  // Питомец уже сыграл 500 мс поклона: продолжаем с середины третьего кадра.
  const enter = flatChain([{ clip: 'bow' }, { clip: 'hello', ms: 3000 }, { clip: 'idle' }]).timeline
  expect(skipSteps(enter, 500)[0]).toEqual(['bow_03', 540])
  expect(skipSteps(enter, 0)).toEqual(enter)
})

test('Кадр живёт в киберпанк-экране панели, в терминале — кадр и строки', async ($, on) => {
  engine(on)
  await $.session.start(START)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await overlayOf(ui)
  const source = String(svg?.props.source)
  expect(source).toContain('data:image/png;base64,iVBOR')
  expect(source).toContain('РОМАН.EXE')
  expect(source.length < SVG_LIMIT).toBe(true)
  // Вложенная картинка героя: ширина задана один раз, иначе SVG не разберётся.
  expect(/<svg [^>]*width="[^"]*"[^>]*width=/.test(source)).toBe(false)
  expect(svg?.props.width).toBe(384)
  // При старте герой машет.
  const line = String(svg?.props.alt)
  expect(scenesOf('kadr', 'wave')).toContain(line)
  await ui.unmount()

  // Картинку терминал кит не показывает (рисует пустое место); проверяем, что панель с Image не отвергнута.
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: line }))?.text).toBeTruthy()
  await term.unmount()
})

test('без дела герой балуется, садится, зевает, ложится и засыпает, а на сообщение встаёт и потягивается', async ($, on) => {
  const clock = engine(on)
  const states = petStates(on)
  await $.session.start(START)

  // Первая мелочь — после 25 секунд тишины.
  await clock.advance(20_000)
  expect(states.some(s => s.timeline.some(([f]) => FIDGET.test(f)))).toBe(false)
  await clock.advance(20_000)
  expect(states.some(s => s.timeline.some(([f]) => FIDGET.test(f)))).toBe(true)

  await clock.advance(60_000)
  expect(scenesOf('kadr', 'sit')).toContain(await lineOf($))
  expect(framesOf(lastOf(states)).slice(0, 8)).toEqual(series('sd', 8))
  await clock.advance(70_000)
  expect(scenesOf('kadr', 'yawn')).toContain(await lineOf($))
  await clock.advance(100_000)
  expect(scenesOf('kadr', 'sleep')).toContain(await lineOf($))
  expect(clipOf(lastOf(states))).toBe('sleep')
  expect(framesOf(lastOf(states)).slice(0, 4)).toEqual(series('fa', 4))

  // Проснувшись, он вздрагивает, встаёт, потягивается и кивает: что там пишут.
  await $.prompt.submit({ text: 'привет', ...TYPED })
  await clock.settle()
  expect(await lineOf($)).toContain('привет')
  const woke = framesOf(lastOf(states))
  expect(lastOf(states).timeline[0]).toEqual(['fa_04', 120, 'shake'])
  expect(woke.indexOf('sd_01') > woke.indexOf('ld_01')).toBe(true)
  expect(woke.indexOf('stretch_01') < woke.indexOf('nod_01')).toBe(true)
  expect(clipOf(lastOf(states))).toBe('think')
})

test('state.json: id сессии и busy от prompt.submit до turn.complete; отметка «жив» — без смены seq', async ($, on) => {
  const clock = engine(on)
  const states = petStates(on)
  await $.session.start(START)
  await clock.advance(5000)
  expect([lastOf(states).session, lastOf(states).busy]).toEqual([SESSION, false])

  await $.prompt.submit({ text: 'сделай', ...TYPED })
  await clock.settle()
  const working = lastOf(states)
  expect([working.session, working.busy]).toEqual([SESSION, true])
  // Раз в 15 секунд — отметка «жив»: тот же seq, та же реплика, ход всё ещё идёт.
  const count = states.length
  await clock.advance(16_000)
  expect(states.length).toBeGreaterThan(count)
  expect([lastOf(states).seq, lastOf(states).line, lastOf(states).busy]).toEqual([working.seq, working.line, true])

  await $.turn.complete({ answer: 'Сделал.', durationMs: 16_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(lastOf(states).busy).toBe(false)

  // Ход без prompt.submit (продолжение): busy есть, а стоящий герой не дёргается.
  await clock.advance(10_000)
  const idle = lastOf(states)
  await $.turn.start({ text: '', turnId: 't2' })
  await clock.settle()
  expect([lastOf(states).busy, lastOf(states).seq]).toEqual([true, idle.seq])
  // Его конец — без второй радости.
  await $.turn.complete({ answer: 'Ещё.', durationMs: 5_000, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect([lastOf(states).busy, lastOf(states).seq]).toEqual([false, idle.seq])
})

test('мелочи: не во время хода, после 25 с тишины, раз в 45–90 с и не одна и та же подряд', async ($, on) => {
  const clock = engine(on)
  const states = petStates(on)
  await $.session.start(START)
  await $.prompt.submit({ text: 'долгая задача', ...TYPED })
  await clock.settle()
  // Ход идёт 200 секунд без событий: ни мелочей, ни отдыха, только отметки «жив».
  const before = states.length
  await clock.advance(200_000)
  const during = states.slice(before)
  expect(during.length > 5).toBe(true)
  expect(during.every(s => s.seq === lastOf(states.slice(0, before)).seq)).toBe(true)
  await $.turn.complete({ answer: 'Готово.', durationMs: 200_000, isAborted: false, turnId: 'long', reason: 'answer' })
  await clock.settle()

  // Без хода: каждые 85 секунд что-то происходит (тогда герой не садится), мелочи — по правилам.
  const fidgets: { at: number; kind: string }[] = []
  let touched = clock.now()
  let seen = states.length
  for (let round = 0; round < 8; round += 1) {
    for (let second = 0; second < 85; second += 1) {
      await clock.advance(1000)
      for (const state of scenesIn(states.slice(seen - 1)).slice(1)) {
        const first = actionFrames(state)[0] ?? ''
        if (FIDGET.test(first)) {
          expect(state.alive - touched >= 25_000).toBe(true)
          fidgets.push({ at: state.alive, kind: first.replace(/_\d+$/, '') })
        }
      }
      seen = states.length
    }
    await $.command.run(persona('роман'))
    await clock.settle()
    touched = clock.now()
    seen = states.length
  }
  expect(fidgets.length >= 4).toBe(true)
  fidgets.forEach((one, i) => {
    const prev = fidgets[i - 1]
    if (prev) {
      expect([i, one.kind === prev.kind, one.at - prev.at >= 45_000]).toEqual([i, false, true])
    }
  })
})

test('/report показывает, что Claude менял и запускал, и сколько ошибок', async ($, on) => {
  engine(on, false)
  on('tool.call', (_, e) => ('command' in e && String(e.command).startsWith('npm') ? { result: {}, isError: true } : { result: {} }))
  await $.session.start(START)
  await $.prompt.submit({ text: 'почини', ...TYPED })
  await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/src/app.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/src/app.ts', old_string: 'b', new_string: 'c' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'PowerShell', command: 'Get-ChildItem' })
  await $.tool.call({ tool: 'Grep', pattern: 'todo' })

  const { text = '' } = await $.command.run({ ...persona(''), command: 'report' })
  expect(text).toContain('Роман')
  expect(text).toContain('app.ts ×2')
  expect(text).toContain('npm test ✗')
  expect(text).toContain('Get-ChildItem')
  expect(text).toContain('Ошибок: 1')
  expect(text).toContain('ходов: 1')
})

test('панель показывает расход контекста', async ($, on) => {
  engine(on)
  on('ui.toast', () => ({ value: undefined }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.start(START)
  await $.session.measure({ context: { tokens: 170_000, window: 200_000, percent: 85 }, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(String((await overlayOf(ui))?.props.source)).toContain('85% · 170k/200k')
  await ui.unmount()
})

test('текст звонка честный: строка ответа как есть, вопрос — с «Вопрос:», пусто — «Claude ждёт тебя»', () => {
  expect(summary('## Итог\n**Починил** ходьбу и добавил звонок.')).toBe('Починил ходьбу и добавил звонок.')
  expect(summary('Запустил трёх агентов, работа идёт.')).toBe('Запустил трёх агентов, работа идёт.')
  expect(summary('Сделал миграцию.\n\n- Запушить в `main`?')).toBe('Вопрос: Запушить в main?')
  expect(summary('```ts\nconst a = b ?\n```\nВсё собрал.')).toBe('Всё собрал.')
  expect(summary('')).toBe('Claude ждёт тебя')
  expect(summary('```\nkod\n```')).toBe('Claude ждёт тебя')
  const long = summary(`${'очень '.repeat(30)}длинно`)
  expect(long.length <= 90 && long.endsWith('…')).toBe(true)
  expect(summary('Готово').startsWith('Готово:')).toBe(false)
})

test('после долгого хода Кадр звонит «входящим вызовом» с тем, что сделано, а насчёт разрешений молчит', async ($, on) => {
  const clock = engine(on)
  const runs: string[][] = []
  const states = petStates(on)
  on('process.run', (_, e) => {
    runs.push([...e.argv])

    return RAN
  })
  on('tool.check', () => ({ decision: 'ask' }))
  on('classic.PermissionRequest', () => ({}))
  await $.session.start(START)
  await clock.advance(2000)

  // Короткий ход не зовёт, долгий — зовёт: показывает на тебя и машет.
  await $.turn.complete({ answer: 'ok', durationMs: 3_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.turn.complete({ answer: '## Итог\n**Починил** ходьбу и добавил звонок.', durationMs: 20_000, isAborted: false, turnId: 't2', reason: 'answer' })
  const ringing = framesOf(lastOf(states))
  expect(ringing.indexOf('point_01') < ringing.indexOf('wave_01')).toBe(true)
  expect(lastOf(states).line).toBe('Починил ходьбу и добавил звонок.')
  await clock.advance(10_000)
  // Разрешения его не касаются: окно с непонятным вопросом владельца только раздражало.
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, isReadOnly: false } as never)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } } as never)
  await clock.advance(100)

  const calls = runs.map(argv => argv.join(' ')).filter(line => line.includes('call.ps1'))
  expect(calls.length).toBe(1)
  expect(calls[0]).toContain('-Caller Роман')
  expect(calls[0]).toContain('-Text Починил ходьбу и добавил звонок.')
  expect(calls[0]).not.toContain('Готово')
})

test('радость за просьбу — ровно одна: фоновые задачи её откладывают, уведомления не повторяют, звонок один', async ($, on) => {
  const clock = engine(on)
  const runs: string[] = []
  const states = petStates(on)
  on('process.run', (_, e) => {
    runs.push(e.argv.join(' '))

    return RAN
  })
  const calls = () => runs.filter(line => line.includes('call.ps1')).length
  // Сколько раз герой радовался: сцены с прыжком радости, победой, хлопками или танцем.
  const cheers = () => scenesIn(states).filter(s => s.timeline.some(([f]) => /^(happy|celebrate|clap|dance)_/.test(f))).length
  await $.session.start(START)

  await $.prompt.submit({ text: 'подними сервер и проверь', ...TYPED })
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', run_in_background: true })
  // Фоновый агент: так его запускает модель (в схеме этой сборки поля нет, а isBackground его понимает).
  await $.tool.call({ tool: 'Agent', description: 'проверка', prompt: 'проверь', run_in_background: true } as never)
  await $.turn.complete({ answer: 'Сервер запущен в фоне, жду.', durationMs: 30_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(10_000)
  expect([calls(), cheers()]).toEqual([0, 0])

  // Конец хода субагента — не конец работы.
  await $.turn.complete({ answer: 'отчёт агента', durationMs: 40_000, isAborted: false, turnId: 't2', reason: 'answer', agentId: 'a1' })
  await clock.advance(10_000)
  expect([calls(), cheers()]).toEqual([0, 0])

  // Первая задача отчиталась, вторая ещё работает: ход с уведомлением кончается тихо.
  await $.prompt.submit(NOTICE)
  await $.turn.complete({ answer: 'Сервер поднялся, жду проверку.', durationMs: 20_000, isAborted: false, turnId: 't3', reason: 'answer' })
  await clock.advance(10_000)
  expect([calls(), cheers()]).toEqual([0, 0])

  // Вторая отчиталась: теперь радость и звонок — один раз.
  await $.prompt.submit(NOTICE)
  await $.turn.complete({ answer: 'Сервер поднялся, тесты прошли.', durationMs: 20_000, isAborted: false, turnId: 't4', reason: 'answer' })
  await clock.advance(100)
  expect([calls(), cheers()]).toEqual([1, 1])
  // Тот же конец хода второй раз — ничего.
  await $.turn.complete({ answer: 'Сервер поднялся, тесты прошли.', durationMs: 20_000, isAborted: false, turnId: 't4', reason: 'answer' })
  await clock.advance(10_000)
  expect([calls(), cheers()]).toEqual([1, 1])

  // Запоздалое уведомление после радости: Claude его разбирает, герой не празднует второй раз и не звонит.
  await $.prompt.submit(NOTICE)
  await $.turn.complete({ answer: 'Ещё один отчёт.', durationMs: 25_000, isAborted: false, turnId: 't5', reason: 'answer' })
  await clock.advance(10_000)
  expect([calls(), cheers()]).toEqual([1, 1])
  expect(clipOf(lastOf(states))).toBe('idle')
  expect(lastOf(states).busy).toBe(false)
})

test('Кадр живёт десктоп-питомцем: мод запускает его и пишет, что играть, что сказать и кто ещё есть', async ($, on) => {
  const clock = engine(on)
  const runs: string[] = []
  const states = petStates(on)
  on('process.run', (_, e) => {
    runs.push(e.argv.join(' '))

    return RAN
  })
  await $.session.start(START)
  await clock.advance(100)
  expect(runs.filter(line => line.includes('pet.ps1')).length).toBe(1)
  // Сразу же /persona Роман — второго запуска нет.
  await $.command.run(persona('роман'))
  await clock.advance(5000)
  expect(runs.filter(line => line.includes('pet.ps1')).length).toBe(1)

  await $.prompt.submit({ text: 'привет', ...TYPED })
  await clock.advance(100)
  const state = lastOf(states)
  expect(state.hero).toBe('kadr')
  expect(state.name).toBe('Роман')
  expect(state.role).toBe('ОПЕРАТОР')
  expect(clipOf(state)).toBe('think')
  // Сперва кивает: понял.
  expect(state.timeline[0]![0]).toBe('nod_01')
  expect(state.line).toContain('привет')
  // Меню питомца: только герои с кадрами, со шкалами.
  expect(state.roster.map(one => one.id)).toEqual(['kadr', 'talia', 'di', 'wick'])
  expect(state.roster[1]).toEqual(expect.objectContaining({ sprite: 'talia', name: 'Талия', role: 'НЕТРАННЕР' }))
  expect(state.roster[2]).toEqual(expect.objectContaining({ sprite: 'di', name: 'Ди', role: 'ТЕХНИК' }))
  expect(state.roster[3]).toEqual(expect.objectContaining({ sprite: 'wick', name: 'Уик', role: 'ФИКСЕР' }))
  for (const one of state.roster) {
    expect(one.about.length > 0 && one.stats.length === 3 && one.stats.every(([, v]) => v >= 0 && v <= 1)).toBe(true)
  }
  // Тычки: 3–5 коротких реакций стоя, с эффектами; вход — поклон и привет.
  expect(state.pokes.length >= 3 && state.pokes.length <= 5).toBe(true)
  expect(state.pokes.every(steps => steps.length > 0 && steps.every(([f]) => CONTRACT.has(f)))).toBe(true)
  expect(state.pokes.some(steps => steps.some(s => s[2] !== undefined))).toBe(true)
  expect(state.pokeLines).toEqual([...ROMAN.pokeLines!])
  expect(state.enter[0]![0]).toBe('bow_01')
  expect(state.enter.some(([f]) => f.startsWith('hello_'))).toBe(true)
  // Напарник — только в съёмке.
  expect(state.costar).toBe(undefined)

  // Раз в 15 секунд — отметка «жив» с той же репликой, без неё питомец уходит сам.
  const before = states.length
  await clock.advance(16_000)
  expect(states.length).toBeGreaterThan(before)
  expect(lastOf(states).line).toBe(state.line)
  expect(lastOf(states).seq).toBe(state.seq)
})

test('режиссёр берёт сцену по инструменту: читать, искать, печатать, снимать, звонить агентам, идти в сеть', async ($, on) => {
  const clock = engine(on)
  const states = petStates(on)
  await $.session.start(START)
  await $.prompt.submit({ text: 'сделай', ...TYPED })

  const seen: string[] = []
  const calls = [
    () => $.tool.call({ tool: 'Read', file_path: 'C:/a.ts' }),
    () => $.tool.call({ tool: 'Grep', pattern: 'x' }),
    () => $.tool.call({ tool: 'Glob', pattern: '*.ts' }),
    () => $.tool.call({ tool: 'Edit', file_path: 'C:/a.ts', old_string: 'a', new_string: 'b' }),
    () => $.tool.call({ tool: 'Write', file_path: 'C:/b.ts', content: 'b' }),
    () => $.tool.call({ tool: 'Bash', command: 'npm test' }),
    () => $.tool.call({ tool: 'PowerShell', command: 'Get-Date' }),
    () => $.tool.call({ tool: 'Agent', description: 'проверка', prompt: 'проверь' }),
    () => $.tool.call({ tool: 'WebSearch', query: 'x', mode: 'standard' }),
  ]
  for (const call of calls) {
    await clock.advance(6500)
    await call()
    await clock.settle()
    seen.push(clipOf(lastOf(states)))
  }
  expect(seen).toEqual(['read', 'scan', 'scan', 'type', 'type', 'film', 'film', 'phone', 'walk'])
  expect(await lineOf($)).toContain(': x')

  // Рабочая сцена держится 6 секунд: новый инструмент ждёт, и потом сцена меняется один раз.
  const walking = lastOf(states).seq
  await $.tool.call({ tool: 'Read', file_path: 'C:/a.ts' })
  await clock.settle()
  // Цепочка та же (seq прежний), а реплика уже о новом деле.
  expect(lastOf(states).seq).toBe(walking)
  expect(lastOf(states).line).toContain('a.ts')
  expect(clipOf(lastOf(states))).toBe('walk')
  await clock.advance(6500)
  expect(clipOf(lastOf(states))).toBe('read')
})

test('рабочие сцены не дёргаются: инструменты каждую секунду — смена не чаще раза в 6 с, та же сцена не пишется', async ($, on) => {
  const clock = engine(on)
  const states = petStates(on)
  await $.session.start(START)
  await $.prompt.submit({ text: 'сделай', ...TYPED })
  await clock.advance(3000)
  const from = states.length
  const tools = [
    () => $.tool.call({ tool: 'Read', file_path: 'C:/a.ts' }),
    () => $.tool.call({ tool: 'Edit', file_path: 'C:/a.ts', old_string: 'a', new_string: 'b' }),
    () => $.tool.call({ tool: 'Bash', command: 'npm test' }),
    () => $.tool.call({ tool: 'Grep', pattern: 'x' }),
    () => $.tool.call({ tool: 'WebSearch', query: 'x', mode: 'standard' }),
  ]
  for (let i = 0; i < 40; i += 1) {
    await tools[i % tools.length]!()
    await clock.advance(1000)
  }
  const work = scenesIn(states.slice(from - 1)).slice(1)
  expect(work.length >= 4 && work.length <= 8).toBe(true)
  work.forEach((one, i) => {
    const prev = work[i - 1]
    if (prev) {
      expect([i, one.alive - prev.alive >= 6000, clipOf(one) !== clipOf(prev)]).toEqual([i, true, true])
    }
  })
})

test('опасная команда пугает героя, потом он снимает', async ($, on) => {
  const clock = engine(on)
  const states = petStates(on)
  await $.session.start(START)
  await $.prompt.submit({ text: 'почисти', ...TYPED })
  await clock.advance(3000)

  await $.tool.call({ tool: 'Bash', command: 'rm -rf build && npm run build' })
  await clock.settle()
  const state = lastOf(states)
  expect(actionFrames(state)[0]).toBe('scared_01')
  expect(clipOf(state)).toBe('film')
  expect(state.line).toContain(': rm')

  for (const command of ['rm -fr /tmp/x', 'git push --force origin main', 'git push -f', 'git reset --hard HEAD~1',
    'Remove-Item -Force -Recurse C:\\build', 'del /s /q *.tmp', 'format D: /q', 'psql -c "DROP TABLE users"']) {
    expect([command, isDanger(command)]).toEqual([command, true])
  }
  for (const command of ['rm file.txt', 'git push origin main', 'git log --format=%H', 'Format-Table', 'git reset HEAD a.ts', 'npm run format']) {
    expect([command, isDanger(command)]).toEqual([command, false])
  }
})

test('ошибки: удивился, фейспалм, злость — не та же подряд и не чаще раза в 4 с; новый ход — заново', async ($, on) => {
  const clock = engine(on, false)
  const states = petStates(on)
  on('tool.call', () => ({ result: {}, isError: true }))
  await $.session.start(START)
  await $.prompt.submit({ text: 'почини', ...TYPED })

  const firstAfterError = async () => {
    await clock.advance(4500)
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await clock.settle()

    return actionFrames(lastOf(states)).find(f => /^(surprised|facepalm|angry)_/.test(f))
  }
  expect(await firstAfterError()).toBe('surprised_01')
  expect(await firstAfterError()).toBe('facepalm_01')
  expect(await firstAfterError()).toBe('angry_01')
  expect(await firstAfterError()).toBe('facepalm_01')
  expect(await firstAfterError()).toBe('angry_01')

  await $.prompt.submit({ text: 'ещё раз', ...TYPED })
  expect(await firstAfterError()).toBe('surprised_01')

  // Пачка ошибок сразу (параллельные инструменты) — одна реакция.
  await clock.advance(4500)
  await Promise.all([1, 2, 3].map(() => $.tool.call({ tool: 'Read', file_path: 'C:/x.ts' })))
  await clock.settle()
  expect(new Set(actionFrames(lastOf(states)).filter(f => /^(surprised|facepalm|angry)_01$/.test(f))).size).toBe(1)
})

test('конец хода: короткий — победа, хлопки или кивок; долгий — танец; прерван — пожал плечами', async ($, on) => {
  const clock = engine(on)
  const states = petStates(on)
  await $.session.start(START)

  const ending = async (durationMs: number, reason: 'answer' | 'aborted' = 'answer') => {
    await $.prompt.submit({ text: 'сделай', ...TYPED })
    await clock.advance(3000)
    await $.turn.complete({ answer: 'Сделал.', durationMs, isAborted: reason === 'aborted', turnId: 't', reason })
    await clock.settle()
    const frames = actionFrames(lastOf(states))
    // Радость доигрывается до конца, прежде чем герой кивнёт на новую просьбу.
    await clock.advance(10_000)

    return frames
  }
  const short = await ending(5_000)
  expect(['celebrate_01', 'clap_01', 'nod_01']).toContain(short[0])
  expect(short.some(f => f.startsWith('hello_'))).toBe(true)
  const medium = await ending(30_000)
  expect(medium[0]).toBe('happy_01')
  expect(medium).toContain('celebrate_01')
  const long = await ending(90_000)
  expect(long[0]).toBe('happy_01')
  expect(long).toContain('dance_01')
  const aborted = await ending(5_000, 'aborted')
  expect(aborted[0]).toBe('shrug_01')
  expect(clipOf(lastOf(states))).toBe('idle')
})

test('смена героя посреди хода — сразу и в той же сцене, без поклона; ход идёт дальше; Роман снимает Талию', async ($, on) => {
  const clock = engine(on)
  const states = petStates(on)
  let choice = ''
  on('fs.read', (_, e) => (e.path.endsWith('choice.json') && choice ? { value: choice } : { deny: 'ENOENT' }))
  await $.session.start(START)
  expect(immediate).toContain('persona')
  await $.prompt.submit({ text: 'сделай', ...TYPED })
  await clock.advance(3000)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.settle()

  // Роман снимает: с разных ракурсов, а в кадре — трюки Талии.
  const filming = lastOf(states)
  expect([filming.hero, clipOf(filming), filming.busy]).toEqual(['kadr', 'film', true])
  expect(filming.loop.some(([f]) => f.startsWith('an_'))).toBe(true)
  expect([filming.costar?.sprite, filming.costar?.name]).toEqual(['talia', 'Талия'])
  const stunts = filming.costar?.stunts ?? []
  expect(stunts.length >= 4 && stunts.length <= 6).toBe(true)
  expect(stunts.every(steps => steps.length === 8 && steps.every(([f]) => /^(lp|pk)_0[1-8]$/.test(f)))).toBe(true)
  // Отметка «жив» несёт тех же напарников.
  await clock.advance(16_000)
  expect(lastOf(states).costar).toEqual(filming.costar)

  await $.command.run(persona('талия'))
  await clock.settle()
  const switched = lastOf(states)
  expect([switched.hero, clipOf(switched), switched.busy]).toEqual(['talia', 'film', true])
  expect(switched.seq === filming.seq).toBe(false)
  expect(framesOf(switched).some(f => f.startsWith('bow_'))).toBe(false)
  expect(switched.loop.map(([f]) => f)).toEqual(series('film', 8))
  expect(switched.costar).toBe(undefined)
  // Тот же разговор о деле, но её голосом.
  expect(switched.line).toContain('npm test')
  expect(VOICES.ru.talia!.test!.map(one => one.replace('{t}', 'npm test'))).toContain(switched.line)

  // Выбор в меню питомца посреди хода — так же.
  choice = JSON.stringify({ hero: 'kadr', at: clock.now() })
  await clock.advance(1500)
  const back = lastOf(states)
  expect([back.hero, clipOf(back)]).toEqual(['kadr', 'film'])
  expect(framesOf(back).some(f => f.startsWith('bow_'))).toBe(false)
  expect(back.costar?.sprite).toBe('talia')

  // Ход идёт дальше: следующий инструмент — своя сцена.
  await clock.advance(7000)
  await $.tool.call({ tool: 'Read', file_path: 'C:/a.ts' })
  await clock.settle()
  expect([lastOf(states).hero, clipOf(lastOf(states)), lastOf(states).costar]).toEqual(['kadr', 'read', undefined])
})

test('выбор героя в меню питомца (choice.json) переключает героя один раз и переживает новую сессию', async ($, on) => {
  const clock = engine(on, true)
  const states = petStates(on)
  let choice = ''
  on('fs.read', (_, e) => (e.path.endsWith('choice.json') && choice ? { value: choice } : { deny: 'ENOENT' }))
  await $.session.start(START)
  await clock.advance(2000)

  // Битый файл — молча ничего.
  choice = '{не json'
  await clock.advance(2000)
  expect(lastOf(states).hero).toBe('kadr')

  choice = JSON.stringify({ hero: 'talia', at: clock.now() })
  await clock.advance(1500)
  const state = lastOf(states)
  expect([state.hero, state.name, state.role]).toEqual(['talia', 'Талия', 'НЕТРАННЕР'])
  // Поклон питомец уже начал сам: мод продолжает с того же места, не с начала.
  expect(state.timeline[0]![0] === 'bow_01' && state.timeline[0]![1] === 240).toBe(false)
  expect(state.timeline.some(([f]) => f.startsWith('hello_'))).toBe(true)
  expect(scenesOf('talia', 'bow')).toContain(state.line)
  expect(state.pokeLines).toEqual([...TALIA.pokeLines!])
  const style = (await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'edgerunners:style')?.text
  expect(style).toContain('Талия, кибер-ниндзя')

  // Тот же выбор второй раз не применяется: /persona пират держится.
  await $.command.run(persona('пират'))
  await clock.advance(3000)
  await $.session.start(START)
  await clock.advance(3000)
  expect((await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'edgerunners:style')?.text).toContain('пират')

  // Новый выбор — применяется; герой без кадров из меню не выбирается.
  choice = JSON.stringify({ hero: 'robot', at: clock.now() })
  await clock.advance(1500)
  expect((await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'edgerunners:style')?.text).toContain('пират')
  // PowerShell 5 пишет UTF-8 с BOM — читается так же.
  choice = `\uFEFF${JSON.stringify({ hero: 'kadr', at: clock.now() })}`
  await clock.advance(1500)
  expect((await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'edgerunners:style')?.text).toContain('Роман')
})

test('у героев с кадрами на каждую сцену 6–12 разных реплик, коротких и без эмодзи; тычки — 8–10', () => {
  for (const one of [ROMAN, TALIA, DI, WICK]) {
    for (const clip of ACTIONS) {
      const lines = one.scenes?.[clip] ?? []
      expect([one.id, clip, lines.length >= 6 && lines.length <= 12]).toEqual([one.id, clip, true])
      expect([one.id, clip, new Set(lines).size]).toEqual([one.id, clip, lines.length])
      for (const line of [...lines, ...(one.pokeLines ?? [])]) {
        expect([line, /\p{Extended_Pictographic}/u.test(line), line.length <= 60]).toEqual([line, false, true])
      }
    }
    const pokes = one.pokeLines ?? []
    expect([one.id, pokes.length >= 8 && pokes.length <= 10]).toEqual([one.id, true])
    expect([one.id, Boolean(one.role && one.about && one.stats?.length === 3 && one.style.length > 100)]).toEqual([one.id, true])
  }
  // У остальных — 4–5 реплик на настроение.
  for (const one of HEROES.filter(each => !each.sprite)) {
    for (const [feeling, lines] of Object.entries(one.lines)) {
      expect([one.id, feeling, lines.length >= 4 && lines.length <= 5]).toEqual([one.id, feeling, true])
    }
  }
})

test('реплика выбирается случайно, но не повторяется подряд', async ($, on) => {
  const lines = ['а', 'б', 'в']
  let last = ''
  for (let i = 0; i < 200; i += 1) {
    const next = pickLine(lines, last)
    expect(next === last).toBe(false)
    last = next
  }
  expect(pickLine(['один'], 'один')).toBe('один')

  // И у героя: один и тот же инструмент через раз — реплики разные.
  const clock = engine(on)
  const states = petStates(on)
  await $.session.start(START)
  let previous = ''
  for (let i = 0; i < 6; i += 1) {
    await clock.advance(6500)
    await $.tool.call({ tool: i % 2 ? 'Read' : 'Grep', pattern: 'x', file_path: 'C:/a.ts' } as never)
    await clock.settle()
    const line = lastOf(states).line
    expect(line === previous).toBe(false)
    previous = line
  }
})

test('панель сама не открывается, только по /persona, и без экрана приложения команда не ломается', async ($, on) => {
  const clock = engine(on, true, false)
  let opens = 0
  on('ui.open', () => {
    opens += 1

    return { deny: 'no-surface: no surface is attached' }
  })
  await $.session.start(START)
  await clock.advance(30_000)
  expect(opens).toBe(0)

  const run = await $.command.run(persona(''))
  expect(opens).toBe(1)
  expect(run.text).toContain('Сейчас:')
  expect(run.text).toContain('Талия (нетраннер) — /persona талия')
  expect(run.text).toContain('Ди (техник) — /persona ди')
  expect(run.text).toContain('Уик (фиксер) — /persona уик')
})

test('/persona: пират, ниндзя, ди, уик и «выкл»; в описании команды — все герои', async ($, on) => {
  engine(on)
  await $.session.start(START)
  expect(descriptions[0]).toContain('роман, талия, ди, уик, кот, пират, бабушка, робот, выкл')
  const styleNow = async () => (await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'edgerunners:style')?.text

  const run = await $.command.run(persona('пират'))
  expect(run.text).toContain('Капитан Боцман')
  expect(await styleNow()).toContain('пират')

  expect((await $.command.run(persona('ниндзя'))).text).toContain('Талия')
  expect(await styleNow()).toContain('миссия')

  expect((await $.command.run(persona('ди'))).text).toContain('Ди на связи')
  expect(await styleNow()).toContain('Ты — Ди, техник')
  expect((await $.command.run(persona('механик'))).text).toContain('Ди')

  expect((await $.command.run(persona('уик'))).text).toContain('Уик на связи')
  expect(await styleNow()).toContain('фиксер')
  expect((await $.command.run(persona('босс'))).text).toContain('Уик')

  await $.command.run(persona('выкл'))
  const plain = await $.prompt.compose(COMPOSE)
  expect(plain.sections.some(s => s.id === 'edgerunners:style')).toBe(false)

  const unknown = await $.command.run(persona('дракон'))
  expect(unknown.text).toContain('Не знаю персонажа')
})

test('выбор переживает новую сессию', async ($, on) => {
  engine(on)
  await $.session.start(START)
  await $.command.run(persona('бабушка'))
  await $.session.start(START)

  const composed = await $.prompt.compose(COMPOSE)
  expect(composed.sections.find(s => s.id === 'edgerunners:style')?.text).toContain('бабушка Зина')
})

test('герой без кадров говорит своими словами, и в терминале, и на десктопе', async ($, on) => {
  engine(on)
  await $.session.start(START)

  await $.command.run(persona('робот'))
  expect(heroById('robot').lines.happy).toContain(await lineOf($))
  await $.command.run(persona('бабушка'))
  const line = await lineOf($)
  expect(heroById('babushka').lines.happy).toContain(line)

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: line }))?.text).toBeTruthy()
  await term.unmount()
})

test('у четырёх героев есть английский набор на каждую сцену, реплики короткие и без эмодзи; в русском добавлены реплики в духе аниме', () => {
  const scenesRu = (id: string) => Object.keys(heroById(id).scenes ?? {})
  for (const id of ['kadr', 'talia', 'di', 'wick']) {
    const hero = heroById(id)
    const en = inLang(hero, 'en')
    expect([id, en.name !== hero.name, /^[A-Z ]+$/.test(en.role ?? '')]).toEqual([id, true, true])
    expect(en.stats?.map(([label]) => label)).toEqual(['ENERGY', 'STEALTH', 'CHARISMA'])
    expect(/[а-яё]/i.test(en.style)).toBe(false)
    for (const scene of scenesRu(id)) {
      const lines = en.scenes?.[scene] ?? []
      expect([id, scene, lines.length >= 2]).toEqual([id, scene, true])
      expect([id, scene, lines.every(line => line.length <= 60 && !/[а-яё]/i.test(line))]).toEqual([id, scene, true])
    }
    expect((en.pokeLines ?? []).length >= 8).toBe(true)
    expect(ANIME[id]!.film!.every(line => (hero.scenes?.film ?? []).includes(line))).toBe(true)
  }
})

test('settings.json меняет язык: реплика, имя и список героев сразу на английском; битый файл ничего не ломает', async ($, on) => {
  const clock = engine(on, true)
  const states = petStates(on)
  let settings = ''
  on('fs.read', (_, e) => (e.path.endsWith('settings.json') && settings ? { value: settings } : { deny: 'ENOENT' }))
  await $.session.start(START)
  expect(lastOf(states).name).toBe('Роман')
  settings = '﻿{"lang":"en"}'
  await clock.advance(1500)
  await clock.settle()
  const state = lastOf(states)
  expect([state.name, state.role]).toEqual(['Roman', 'OPERATOR'])
  expect(state.roster.map(one => one.name)).toEqual(['Roman', 'Talia', 'Dee', 'Wick'])
  expect(/[а-яё]/i.test(state.line)).toBe(false)
  settings = '{битый'
  await clock.advance(1500)
  await clock.settle()
  expect(lastOf(states).name).toBe('Roman')
  settings = '{"lang":"ru"}'
  await clock.advance(1500)
  await clock.settle()
  expect(lastOf(states).name).toBe('Роман')
})

test('текст звонка и отчёт на английском', () => {
  expect(summary('', 'en')).toBe('Claude is waiting for you')
  expect(summary('Всё готово.\nМержим?', 'en')).toBe('Question: Мержим?')
  expect(report({ startedAt: 0, turns: 1, entries: [] }, { percent: 0, tokens: 0, window: 0, usd: 0 }, 60000, { icon: '⚔', name: 'Talia' }, 'en')).toContain('Report: Talia')
})

test('герой говорит о настоящем деле: просьба, файл, команда, ошибка, итог; новая реплика не перезапускает сцену', async ($, on) => {
  const clock = engine(on, false)
  on('tool.call', (_, e) => ('command' in e && String(e.command).startsWith('npm') ? { result: {}, isError: true } : { result: {} }))
  const states = petStates(on)
  await $.session.start(START)
  await clock.advance(2000)

  await $.prompt.submit({ text: 'почини\nклик   по герою', ...TYPED })
  await clock.settle()
  expect(lastOf(states).line).toContain('почини клик по герою')

  await clock.advance(7000)
  await $.tool.call({ tool: 'Read', file_path: 'C:/proj/src/app.ts' })
  await clock.settle()
  const reading = lastOf(states)
  expect(clipOf(reading)).toBe('read')
  expect(reading.line).toContain('app.ts')
  expect(reading.line.includes('C:/proj')).toBe(false)

  // Сцена та же, а файл другой: реплика новая, цепочка питомца не начинается заново.
  await $.tool.call({ tool: 'Read', file_path: 'C:/proj/src/other.ts' })
  await clock.settle()
  expect(lastOf(states).line).toContain('other.ts')
  expect(lastOf(states).seq).toBe(reading.seq)

  // Сцена ещё держится, а дело уже другое; когда она сменится, реплика останется о деле.
  await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/src/third.ts', old_string: 'a', new_string: 'b' })
  await clock.settle()
  expect(lastOf(states).line).toContain('third.ts')
  expect(lastOf(states).seq).toBe(reading.seq)
  await clock.advance(7000)
  expect(clipOf(lastOf(states))).toBe('type')
  expect(lastOf(states).line).toContain('third.ts')

  // Служебный инструмент ничего не меняет.
  await $.tool.call({ tool: 'ToolSearch', query: 'x', max_results: 1 } as never)
  await clock.settle()
  expect(lastOf(states).line).toContain('third.ts')

  // Что упало.
  await clock.advance(7000)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.settle()
  expect(lastOf(states).line).toContain('npm test')
  expect(VOICES.ru.kadr!.fail!.map(one => one.replace('{t}', 'npm test'))).toContain(lastOf(states).line)

  // Итог — первая строка ответа; вопрос к человеку — вопрос.
  await $.turn.complete({ answer: 'Починил клик по герою.', durationMs: 5000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(lastOf(states).line).toBe('Починил клик по герою.')
  expect(lastOf(states).busy).toBe(false)

  await $.prompt.submit({ text: 'дальше', ...TYPED })
  await clock.advance(100)
  await $.turn.complete({ answer: 'Сделал.\nКакой размер поставить?', durationMs: 5000, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(lastOf(states).line).toBe('Вопрос: Какой размер поставить?')
})

test('на экран идёт только программа и подкоманда: токены и значения из команд не показываются', () => {
  expect(deedOf('Bash', { command: 'curl -H "Authorization: Bearer sk-123" https://x.io/api?key=abc' })).toEqual({ kind: 'run', target: 'curl' })
  expect(deedOf('Bash', { command: 'API_KEY=abc123 npm run build -- --token=zzz' })).toEqual({ kind: 'build', target: 'npm run build' })
  expect(deedOf('Bash', { command: 'cd /proj && npm test | tail -5' })).toEqual({ kind: 'test', target: 'npm test' })
  expect(deedOf('Bash', { command: 'git add . && git commit -m "секрет" && git push origin main' })).toEqual({ kind: 'push', target: 'git push' })
  expect(deedOf('Bash', { command: 'git status' })).toEqual({ kind: 'look', target: 'git status' })
  expect(deedOf('PowerShell', { command: '& "C:\\Program Files\\nodejs\\node.exe" tools\\pet-demo.mjs walk' })).toEqual({ kind: 'run', target: 'node pet-demo.mjs' })
  expect(deedOf('Bash', { command: 'python -m pytest tests/' })).toEqual({ kind: 'test', target: 'python pytest' })
  expect(deedOf('Bash', { command: 'pnpm add lodash' })).toEqual({ kind: 'install', target: 'pnpm add lodash' })
  expect(deedOf('Bash', { command: 'rm -rf build && npm run build' })).toEqual({ kind: 'danger', target: 'rm' })
  expect(deedOf('Bash', { command: 'cat .env' })).toEqual({ kind: 'read', target: 'cat' })
  expect(deedOf('Bash', { command: 'sed -n 1,5p hooks/register.tsx' })).toEqual({ kind: 'read', target: 'register.tsx' })
  expect(deedOf('Bash', { command: 'cd /proj' })).toBe(undefined)
  expect(deedOf('PowerShell', { command: "[IO.File]::WriteAllText('E:\\x\\settings.json', '{}')" })).toEqual({ kind: 'run', target: 'WriteAllText' })
  expect(deedOf('Bash', { command: "cat 'notes.md'," })).toEqual({ kind: 'read', target: 'notes.md' })
  expect(deedOf('PowerShell', { command: 'Get-Content cart.test.js' })).toEqual({ kind: 'read', target: 'cart.test.js' })
  expect(deedOf('PowerShell', { command: '(Get-ChildItem E:\\x).Count' })).toEqual({ kind: 'search', target: 'Get-ChildItem' })
  expect(deedOf('PowerShell', { command: '$n = Get-Content a.md' })).toEqual({ kind: 'read', target: 'a.md' })
  expect(deedOf('Bash', { command: 'for f in *.ts; do wc -l $f; done' })).toEqual({ kind: 'run', target: 'wc' })

  expect(deedOf('WebFetch', { url: 'https://user:pass@example.com/path?token=1' })).toEqual({ kind: 'web', target: 'example.com' })
  expect(deedOf('Agent', { description: 'проверить звонок', prompt: 'длинный текст' })).toEqual({ kind: 'agent', target: 'проверить звонок' })
  expect(deedOf('AskUserQuestion', {})).toEqual({ kind: 'ask', target: '' })
  expect(deedOf('TodoWrite', { todos: [{ status: 'completed', content: 'a' }, { status: 'in_progress', content: 'b', activeForm: 'Чиню клик' }] })).toEqual({ kind: 'plan', target: 'Чиню клик' })
  expect(deedOf('mcp__ccd_turn__update_plan', { items: [{ status: 'in_progress', content: 'Тесты' }] })).toEqual({ kind: 'plan', target: 'Тесты' })
  expect(deedOf('mcp__ccd_turn__update_plan', { advance: true })).toBe(undefined)
  expect(deedOf('mcp__ccd_turn__wrap_up', { recap: 'x' })).toBe(undefined)
  expect(deedOf('mcp__Claude_Browser__navigate', { url: 'https://chatgpt.com/c/1' })).toEqual({ kind: 'web', target: 'chatgpt.com' })
  expect(deedOf('ToolSearch', { query: 'x' })).toBe(undefined)

  expect(promptDeed('да')).toEqual({ kind: 'go', target: '' })
  expect(promptDeed('Background (from the session that started this one):\nслужебное\n\nTask:\nПочини баг в корзине.\n\nShared notes folder: C:\\x').target).toBe('Почини баг в корзине.')
  expect(promptDeed('<system-reminder>секрет</system-reminder>привет мир').target).toBe('привет мир')
  expect(promptDeed('почини\n\nклик <b>тут</b> ```код```').target).toBe('почини клик тут')
  expect(promptDeed('слово '.repeat(40)).target.length <= 47).toBe(true)
  expect(failDeed({ kind: 'read', target: 'a.ts' })).toEqual({ kind: 'fail', target: 'a.ts' })
  expect(failDeed({ kind: 'ask', target: '' })).toBe(undefined)
})

test('у каждого героя на двух языках есть голос для каждого дела; реплики короткие, с целью там, где она есть', () => {
  const kinds = Object.keys(VOICES.ru.plain!) as (keyof typeof VOICES.ru.plain)[]
  const noTarget = new Set(['ask', 'go', 'notice', 'wait', 'stopped', 'crash'])
  for (const lang of ['ru', 'en'] as const) {
    for (const id of ['plain', 'kadr', 'talia', 'di', 'wick']) {
      const who = VOICES[lang][id]!
      expect([lang, id, Object.keys(who).sort()]).toEqual([lang, id, [...kinds].sort()])
      for (const kind of kinds) {
        for (const text of who[kind]!) {
          expect([lang, id, kind, text.includes('{t}')]).toEqual([lang, id, kind, !noTarget.has(kind)])
          expect(text.length <= 56).toBe(true)
          expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false)
        }
      }
    }
  }
  // Выбор варианта устойчив: тот же номер — та же фраза; герой без голоса говорит нейтрально.
  const reading = { kind: 'read', target: 'a.ts' } as const
  expect(deedLine('kadr', 'ru', reading, 5)).toBe(deedLine('kadr', 'ru', reading, 5))
  expect(deedLine('pirate', 'ru', reading, 5)).toBe('Читаю a.ts')
  expect(deedLine('pirate', 'en', reading, 5)).toBe('Reading a.ts')
})

test('питомец получает реплики на серию кликов на нужном языке', async ($, on) => {
  const clock = engine(on)
  const states = petStates(on)
  await $.session.start(START)
  await clock.settle()
  const state = lastOf(states) as unknown as { pokeMad: string[] }
  expect(state.pokeMad).toEqual([...inLang(heroById('kadr'), 'ru').pokeMad!])
  for (const hero of ['kadr', 'talia', 'di', 'wick']) {
    for (const lang of ['ru', 'en'] as const) {
      expect(inLang(heroById(hero), lang).pokeMad!.length >= 4).toBe(true)
    }
  }
})
