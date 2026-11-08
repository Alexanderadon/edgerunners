// Игровая анимация героя: клипы из кадров с чётким ритмом, переходы между позами
// и сборка цепочки «переход → действие → следующее действие» в одну SVG, которую панель проигрывает сама.
// Ритм как в играх: упреждение (первый кадр дольше), быстрые промежуточные кадры, удержание ключевой позы.

// Больше движок в один Svg не пропустит.
export const SVG_LIMIT = 131072

export type Posture = 'stand' | 'sit' | 'lie' | 'sleep'
type Ref = readonly [clip: string, index: number]
// Эффект шага для питомца: подскочить (удивление), дрогнуть (испуг, пробуждение). Панель их не рисует.
// Владелец: сжатия и растяжения кодом делают движение «кривым» — движение даёт только рисунок кадров.
export type Fx = 'hop' | 'shake'
export const FX: readonly Fx[] = ['hop', 'shake']
// Кадр, сколько миллисекунд он держится, и эффект шага.
export type Step = readonly [frame: string, ms: number, fx?: Fx]

export type Clip = {
  steps: readonly Step[]
  posture: Posture
  // Петля играет, пока её не сменят; остальное проигрывается один раз.
  loop?: boolean
  overlay?: 'zzz' | 'question' | 'bang'
  // Подскок в панели (у питомца подскок — fx 'hop').
  hop?: boolean
}

// Ровная петля: кадры клипа подряд, каждый по ms.
const even = (name: string, count: number, ms: number): Step[] =>
  Array.from({ length: count }, (_, i) => [`${name}_0${i + 1}`, ms] as const)

/**
 * Переход по кадрам name_01..count: медленнее в начале и в конце (разгон и торможение), быстрее в середине —
 * от slow до fast миллисекунд на кадр. back — в обратную сторону (встать, опустить камеру); first — эффект первого шага.
 */
const ease = (name: string, count: number, slow: number, fast: number, back = false, first?: Fx): Step[] => {
  const frames = Array.from({ length: count }, (_, i) => `${name}_0${i + 1}`)

  return (back ? frames.reverse() : frames).map((frame, i) => {
    const ms = Math.round(slow - (slow - fast) * Math.sin((Math.PI * i) / (count - 1)))

    return i === 0 && first ? [frame, ms, first] as const : [frame, ms] as const
  })
}

// Съёмка стоя: плавная панорама центр → вправо → центр → присел → влево → центр; на краях чуть задерживается.
const FILM: readonly Step[] = [260, 180, 230, 180, 220, 180, 230, 180].map((ms, i) => [`film_0${i + 1}`, ms] as const)

export const CLIPS = {
  // Покой живёт, но не мельтешит: долгие удержания стойки, редкое моргание и по одной мелочи раз в 5–8 секунд.
  // iv_02/iv_03 — перенёс вес, iv_04 — оглянулся, iv_07 — моргнул, iv_08 — улыбнулся. Здесь только позы, близкие к стойке:
  // рука к голове без промежуточных кадров выглядела рывком, поэтому она — в отдельной мелочи scratch.
  idle: {
    posture: 'stand',
    loop: true,
    steps: [
      ['idle_01', 4200], ['idle_02', 110], ['idle_01', 3000], ['iv_02', 1800],
      ['idle_01', 3600], ['idle_02', 110], ['idle_01', 2200], ['iv_03', 1800],
      ['idle_01', 4000], ['iv_07', 130], ['idle_01', 3000], ['iv_04', 1400],
      ['idle_01', 3800], ['idle_02', 110], ['idle_01', 2000], ['iv_08', 1800],
      ['idle_01', 3600], ['idle_02', 110], ['idle_01', 2400], ['idle_03', 1200],
    ],
  },
  // Мелочи без дела: оглядеться по сторонам; почесать голову, поправить одежду, принять позу.
  scratch: { posture: 'stand', steps: [['iv_01', 240], ['iv_05', 1300], ['iv_01', 300], ['iv_06', 1200], ['iv_01', 300], ['filmyou_01', 1600], ['iv_01', 240]] },
  look: { posture: 'stand', steps: [['look_01', 900], ['idle_01', 240], ['look_02', 900], ['idle_02', 110], ['idle_01', 400]] },
  curious: { posture: 'stand', loop: true, overlay: 'question', steps: [['curious_01', 800]] },
  surprised: { posture: 'stand', hop: true, overlay: 'bang', steps: [['surprised_01', 800, 'hop']] },
  think: {
    posture: 'stand',
    loop: true,
    overlay: 'question',
    steps: [['think_01', 1040], ['think_02', 600], ['think_03', 600], ['think_04', 450], ['think_02', 400]],
  },
  walk: { posture: 'stand', loop: true, steps: even('walk', 8, 100) },
  film: { posture: 'stand', loop: true, steps: FILM },
  // Присел — толчок — в воздухе — приземлился.
  happy: {
    posture: 'stand',
    steps: [['happy_01', 180], ['happy_02', 90], ['happy_03', 90], ['happy_04', 200], ['happy_05', 90], ['happy_06', 180]],
  },
  hello: {
    posture: 'stand',
    loop: true,
    steps: [['hello_01', 1040], ['hello_02', 300], ['hello_01', 1040], ['hello_03', 500], ['hello_04', 600]],
  },
  sad: { posture: 'stand', loop: true, steps: [['sad_01', 2600], ['sad_02', 700], ['sad_03', 900], ['sad_04', 700]] },
  sit: { posture: 'sit', loop: true, steps: [['sit_01', 3600], ['sit_02', 120], ['sit_01', 1200]] },
  yawn: { posture: 'sit', steps: [['yawn_01', 1300], ['doze_01', 1300]] },
  lie: { posture: 'lie', loop: true, steps: [['lie_01', 3000], ['lie_02', 220], ['lie_01', 2400]] },
  sleep: { posture: 'sleep', loop: true, overlay: 'zzz', steps: [['sleep_01', 1800]] },
  // Новые действия, все стоя.
  // Жесты кончаются возвратом к спокойной позе, а не обрываются с поднятой рукой.
  wave: { posture: 'stand', steps: [['wave_01', 200], ['wave_02', 120], ['wave_03', 180], ['wave_04', 180], ['wave_03', 180], ['wave_04', 180], ['wave_02', 120], ['wave_01', 160]] },
  nod: { posture: 'stand', steps: [['nod_01', 160], ['nod_02', 110], ['nod_03', 130], ['nod_02', 100], ['nod_03', 120], ['nod_04', 320], ['nod_01', 160]] },
  laugh: { posture: 'stand', steps: [['laugh_01', 200], ['laugh_02', 110], ['laugh_03', 110], ['laugh_02', 110], ['laugh_03', 110], ['laugh_04', 420], ['laugh_01', 160]] },
  // Присел, выпрыгнул с кулаком вверх, приземлился и держит позу.
  celebrate: {
    posture: 'stand',
    steps: [['celebrate_01', 220], ['celebrate_02', 120], ['celebrate_03', 300], ['celebrate_04', 800]],
  },
  // Сильные доли — присел, слабые — вытянулся: 100 ударов в минуту.
  dance: {
    posture: 'stand',
    loop: true,
    steps: [
      ['dance_01', 150], ['dance_02', 150], ['dance_03', 150], ['dance_04', 150],
      ['dance_05', 150], ['dance_06', 150], ['dance_07', 150], ['dance_08', 150],
    ],
  },
  type: { posture: 'stand', loop: true, steps: [['type_01', 260], ['type_02', 170], ['type_03', 170], ['type_02', 170], ['type_03', 170], ['type_04', 260]] },
  read: { posture: 'stand', loop: true, steps: [['read_01', 700], ['read_02', 500], ['read_03', 700], ['read_04', 500]] },
  scan: { posture: 'stand', loop: true, steps: [['scan_01', 800], ['scan_02', 500], ['scan_03', 800], ['scan_04', 600]] },
  point: { posture: 'stand', steps: [['point_01', 220], ['point_02', 100], ['point_03', 560], ['point_04', 240]] },
  facepalm: { posture: 'stand', steps: [['facepalm_01', 220], ['facepalm_02', 120], ['facepalm_03', 500], ['facepalm_04', 900], ['facepalm_02', 130], ['facepalm_01', 160]] },
  // Топает: удар ногой — дрожь, дважды.
  angry: {
    posture: 'stand',
    steps: [['angry_01', 240], ['angry_02', 180], ['angry_01', 150], ['angry_02', 180], ['angry_03', 900], ['angry_04', 520]],
  },
  // Вздрогнул, отскочил (440 мс в воздухе), приземлился и ещё трясётся.
  scared: {
    posture: 'stand',
    overlay: 'bang',
    steps: [['scared_01', 120], ['scared_02', 90], ['scared_03', 350, 'shake'], ['scared_04', 160], ['scared_03', 400, 'shake'], ['scared_04', 500]],
  },
  shrug: { posture: 'stand', steps: [['shrug_01', 200], ['shrug_02', 110], ['shrug_03', 620], ['shrug_04', 260]] },
  stretch: { posture: 'stand', steps: [['stretch_01', 300], ['stretch_02', 180], ['stretch_03', 900], ['stretch_04', 320]] },
  bored: {
    posture: 'stand',
    loop: true,
    steps: [['bored_01', 1500], ['bored_02', 900], ['bored_03', 1100], ['bored_04', 1300]],
  },
  drink: { posture: 'stand', steps: [['drink_01', 240], ['drink_02', 130], ['drink_03', 800], ['drink_04', 450], ['drink_01', 180]] },
  // А-а-а… (вдох, откинулся) — ЧХИ! (резко присел) — мотает головой.
  sneeze: { posture: 'stand', steps: [['sneeze_01', 420], ['sneeze_02', 380], ['sneeze_03', 130], ['sneeze_04', 420]] },
  phone: { posture: 'stand', loop: true, steps: [['phone_01', 1000], ['phone_02', 600], ['phone_03', 1000], ['phone_04', 600]] },
  music: { posture: 'stand', loop: true, steps: [['music_01', 270], ['music_02', 270], ['music_03', 270], ['music_04', 270]] },
  clap: {
    posture: 'stand',
    steps: [['clap_01', 180], ['clap_02', 130], ['clap_03', 130], ['clap_02', 130], ['clap_03', 130], ['clap_04', 320], ['clap_01', 160]],
  },
  bow: { posture: 'stand', steps: [['bow_01', 240], ['bow_02', 200], ['bow_03', 600], ['bow_04', 260]] },
  // Коронка: присел, прыжок в позу, приземлился, держит позу.
  selfie: { posture: 'stand', steps: [['selfie_01', 220], ['selfie_02', 440], ['selfie_03', 140], ['selfie_04', 900]] },
  fix: { posture: 'stand', steps: [['fix_01', 300], ['fix_02', 500], ['fix_03', 600], ['fix_04', 500]] },
  run: { posture: 'stand', loop: true, steps: even('run', 8, 80) },
  // Переходы между позами: 90–140 мс на кадр, медленнее в начале и в конце; обратно — чуть быстрее.
  // sd_08 — уже сидит, ld_04 — лежит на спине, fa_04 — спит, rc_04 ≈ film_01, tc_04 ≈ think_01.
  sitDown: { posture: 'sit', steps: ease('sd', 8, 140, 90) },
  standUp: { posture: 'stand', steps: ease('sd', 8, 120, 90, true) },
  lieDown: { posture: 'lie', steps: ease('ld', 4, 140, 100) },
  getUp: { posture: 'sit', steps: ease('ld', 4, 120, 90, true) },
  fallAsleep: { posture: 'sleep', steps: ease('fa', 4, 140, 120) },
  // Проснулся рывком: вздрогнул на первом кадре и быстро открыл глаза.
  wakeUp: { posture: 'lie', overlay: 'bang', steps: ease('fa', 4, 120, 90, true, 'shake') },
  raiseCam: { posture: 'stand', steps: ease('rc', 4, 130, 90) },
  lowerCam: { posture: 'stand', steps: ease('rc', 4, 110, 90, true) },
  toChin: { posture: 'stand', steps: ease('tc', 4, 130, 90) },
  fromChin: { posture: 'stand', steps: ease('tc', 4, 110, 90, true) },
} satisfies Record<string, Clip>

export type ClipName = keyof typeof CLIPS

// Переходы между позами и при входе-выходе из сцен с камерой и рукой у подбородка.
export const TRANSITIONS: ReadonlySet<ClipName> = new Set<ClipName>([
  'sitDown', 'standUp', 'lieDown', 'getUp', 'fallAsleep', 'wakeUp', 'raiseCam', 'lowerCam', 'toChin', 'fromChin',
])
// Рабочие сцены: герой занят инструментом Claude.
export const WORK: ReadonlySet<ClipName> = new Set<ClipName>(['walk', 'film', 'type', 'read', 'scan', 'phone', 'run'])

/**
 * Свои версии клипов у героя — из кадров, которые нарисованы только у него; у прочих героев играет общий клип.
 * Роман снимает с разных ракурсов: стоя, с колена снизу вверх (an_01..04), стоя, камерой высоко над головой (an_05..08).
 */
export const HERO_CLIPS: Partial<Record<string, Partial<Record<ClipName, Clip>>>> = {
  kadr: {
    film: {
      posture: 'stand',
      loop: true,
      steps: [
        ...FILM, ...FILM,
        // Опускает камеру и приседает на колено — снимает снизу — обратно теми же кадрами.
        ['rc_03', 110], ['rc_02', 110], ['sd_03', 120],
        ['an_01', 300], ['an_02', 800], ['an_03', 800], ['an_04', 600],
        ['sd_03', 120], ['rc_02', 110], ['rc_03', 110],
        ...FILM,
        // Камера вверх, над головой — снимает сверху — обратно.
        ['an_08', 130],
        ['an_05', 300], ['an_06', 800], ['an_07', 800], ['an_08', 300],
      ],
    },
  },
}

// Клип героя: его собственный, если есть, иначе общий.
export const clipOf = (name: ClipName, sprite?: string): Clip => (sprite ? HERO_CLIPS[sprite]?.[name] : undefined) ?? CLIPS[name]

/**
 * Трюки напарника, которого Роман снимает в сцене film, — кадры только у Талии, боком, лицом вправо.
 * Игровой ритм: разбег медленнее, полёт быстро, приземление с удержанием.
 * leap: lp_01–02 разбег, lp_03 толчок, lp_04–05 полёт, lp_06 приземление, lp_07 присед с рукой о землю, lp_08 стойка.
 * parkour: pk_01 рывок, pk_02–03 сальто вбок, pk_04 разворот, pk_05 удар с разворота, pk_06 приземление,
 * pk_07 присед, pk_08 печать рукой.
 */
export const STUNTS = {
  leap: {
    posture: 'stand',
    steps: [['lp_01', 160], ['lp_02', 130], ['lp_03', 90], ['lp_04', 70], ['lp_05', 70], ['lp_06', 90], ['lp_07', 420], ['lp_08', 320]],
  },
  parkour: {
    posture: 'stand',
    steps: [['pk_01', 150], ['pk_02', 80], ['pk_03', 70], ['pk_04', 90], ['pk_05', 260], ['pk_06', 110], ['pk_07', 300], ['pk_08', 560]],
  },
} satisfies Record<string, Clip>

export type StuntName = keyof typeof STUNTS

// Напарник в кадре: у какого героя, в какой сцене, кто (sprite) и какими трюками.
export const COSTARS: Partial<Record<string, { scene: ClipName; partner: string; stunts: readonly StuntName[] }>> = {
  kadr: { scene: 'film', partner: 'talia', stunts: ['leap', 'parkour'] },
}

/**
 * Серия трюков для напарника: 4–6 подряд, каждый повторяется 1–2 раза, потом смена — как серия дублей.
 * random — для проверки; питомец играет их по очереди и по кругу, пока идёт сцена.
 */
export const stuntReel = (names: readonly StuntName[], random: () => number = Math.random): Step[][] => {
  const out: Step[][] = []
  const count = 4 + Math.floor(random() * 3)
  let name = names[Math.floor(random() * names.length)]
  while (name && out.length < count) {
    const takes = 1 + Math.floor(random() * 2)
    for (let i = 0; i < takes && out.length < count; i += 1) {
      out.push([...STUNTS[name].steps])
    }
    const others = names.filter(one => one !== name)
    name = others.length > 0 ? others[Math.floor(random() * others.length)] : name
  }

  return out
}

// Какие кадры нужны герою: общие клипы (или его собственные версии) и трюки, если он чей-то напарник.
export const heroFrames = (sprite: string): string[] => {
  const clips = (Object.keys(CLIPS) as ClipName[]).map(name => clipOf(name, sprite))
  const stunts = Object.values(COSTARS).flatMap(one => (one?.partner === sprite ? one.stunts.map(name => STUNTS[name] as Clip) : []))

  return [...new Set([...clips, ...stunts].flatMap(clip => clip.steps.map(([frame]) => frame)))]
}

// Какой переход играть между позами и при входе-выходе из сцен с камерой и рукой у подбородка.
const LEVEL: Record<Posture, number> = { stand: 0, sit: 1, lie: 2, sleep: 3 }
const DOWN: Record<number, ClipName> = { 0: 'sitDown', 1: 'lieDown', 2: 'fallAsleep' }
const UP: Record<number, ClipName> = { 3: 'wakeUp', 2: 'getUp', 1: 'standUp' }
const ENTER: Partial<Record<ClipName, ClipName>> = { film: 'raiseCam', think: 'toChin' }
const LEAVE: Partial<Record<ClipName, ClipName>> = { film: 'lowerCam', think: 'fromChin' }
// Вход в сцену: если сцены уже не будет, его не доигрывают.
const ENTERING: ReadonlySet<ClipName> = new Set(Object.values(ENTER))

/**
 * Переходы от сцены from к сцене to. brief — from только началась (держалась меньше удержания рабочей сцены):
 * между двумя рабочими сценами тогда без входа и выхода, иначе камера вверх-вниз выглядит дёрганьем.
 */
export const transitions = (from: ClipName, to: ClipName, brief = false): ClipName[] => {
  if (from === to) {
    return []
  }
  const quiet = brief && WORK.has(from) && WORK.has(to)
  const out: ClipName[] = []
  const leave = LEAVE[from]
  if (leave && !quiet) {
    out.push(leave)
  }
  let level = LEVEL[CLIPS[from].posture]
  const target = LEVEL[CLIPS[to].posture]
  while (level < target) {
    out.push(DOWN[level]!)
    level += 1
  }
  while (level > target) {
    out.push(UP[level]!)
    level -= 1
  }
  const enter = ENTER[to]
  if (enter && !quiet) {
    out.push(enter)
  }

  return out
}

// Часть цепочки: клип и сколько его крутить (петля без ms в конце цепочки крутится всегда).
export type Part = { clip: ClipName; ms?: number }

export const partLength = (part: Part, sprite?: string) => {
  const clip = clipOf(part.clip, sprite)
  const once = clip.steps.reduce((sum, [, ms]) => sum + ms, 0)

  return clip.loop ? (part.ms ?? once) : once
}

// Сколько играет разовая часть цепочки: всё, кроме петли в конце.
export const onceLength = (parts: readonly Part[], sprite?: string) =>
  parts.reduce((sum, part, i) => (i === parts.length - 1 && clipOf(part.clip, sprite).loop ? sum : sum + partLength(part, sprite)), 0)

// Маршрут: между соседними частями вставляются переходы; brief — только для первого шага (см. transitions).
export const route = (from: ClipName, plan: readonly Part[], brief = false): Part[] => {
  const out: Part[] = []
  let at = from
  plan.forEach((part, i) => {
    out.push(...transitions(at, part.clip, brief && i === 0).map(clip => ({ clip })))
    out.push(part)
    at = part.clip
  })

  return out
}

/**
 * Где цепочка в момент elapsed от её начала и что из неё надо доиграть: начатый жест (или переход позы)
 * не рвут на середине, но и хвост цепочки за ним не ждут — новое начинается сразу после него.
 * Вход в сцену (поднять камеру, рука к подбородку) не доигрывается: сцены уже не будет.
 * keep — что доиграть, offset — сколько от keep[0] уже сыграно, from — откуда вести дальше,
 * held — сколько уже крутится петля на экране (0, если на экране жест).
 */
export const cutAt = (parts: readonly Part[], elapsed: number, sprite?: string) => {
  let start = 0
  let i = 0
  for (; i < parts.length - 1; i += 1) {
    const length = partLength(parts[i]!, sprite)
    if (elapsed < start + length) {
      break
    }
    start += length
  }
  const showing = parts[i]
  if (!showing) {
    return { keep: [] as Part[], offset: 0, from: 'idle' as ClipName, held: 0 }
  }
  const offset = Math.max(0, elapsed - start)
  const length = partLength(showing, sprite)
  const isGesture = !clipOf(showing.clip, sprite).loop && !ENTERING.has(showing.clip)
  // Петля на экране, вход в сцену или последняя разовая часть, уже доигранная (герой стоит на её последнем кадре).
  if (!isGesture || (i === parts.length - 1 && offset >= length)) {
    return { keep: [] as Part[], offset: 0, from: showing.clip, held: isGesture ? offset - length : offset }
  }

  return { keep: [showing], offset, from: showing.clip, held: 0 }
}

// Шаг с другой длительностью; эффект остаётся при нём.
const cut = (step: Step, ms: number): Step => (step[2] ? [step[0], ms, step[2]] : [step[0], ms])

/**
 * Цепочка плоским списком кадров для десктоп-питомца: разовая часть (переходы, прыжок, петли
 * с ограниченным временем) и петля, которая крутится после неё. Эффекты шагов идут третьим элементом.
 * sprite — чей набор: у героя могут быть свои версии клипов.
 */
export const flatChain = (parts: readonly Part[], sprite?: string) => {
  const timeline: Step[] = []
  parts.forEach((part, i) => {
    const clip = clipOf(part.clip, sprite)
    if (i === parts.length - 1 && clip.loop) {
      return
    }
    if (!clip.loop) {
      timeline.push(...clip.steps)

      return
    }
    let left = partLength(part, sprite)
    while (left > 0) {
      for (const step of clip.steps) {
        if (left <= 0) {
          break
        }
        timeline.push(cut(step, Math.min(step[1], left)))
        left -= step[1]
      }
    }
  })
  const last = parts[parts.length - 1]
  const tail: Clip | undefined = last ? clipOf(last.clip, sprite) : undefined
  // Разовый клип в конце замирает на последнем кадре — без эффекта, иначе он повторялся бы каждую секунду.
  const loop: readonly Step[] = tail?.loop ? tail.steps : [[tail?.steps[tail.steps.length - 1]?.[0] ?? 'idle_01', 1000]]

  return { timeline, loop }
}

// Разовая часть без первых ms: питомец уже сыграл их сам (вход героя, выбранного в его меню, начатый жест).
export const skipSteps = (steps: readonly Step[], ms: number): Step[] => {
  const out: Step[] = []
  let left = ms
  for (const step of steps) {
    if (left >= step[1]) {
      left -= step[1]
      continue
    }
    // Эффект начатого шага уже случился.
    out.push(left > 0 ? [step[0], step[1] - left] : step)
    left = 0
  }

  return out
}

// Значки над героем — в цветах киберпанк-экрана, с тёмной обводкой для читаемости.
const TEXT = 'font-family="Bahnschrift, Arial, sans-serif" font-weight="bold" stroke="#07090b" stroke-width="3" paint-order="stroke"'

const overlay = (kind: NonNullable<Clip['overlay']>, w: number) => {
  const x = Math.round(w * 0.74)
  switch (kind) {
    case 'zzz':
      return [0, 1, 2]
        .map(i => `<text x="${x + i * 9}" y="70" font-size="${13 + i * 4}" fill="#2ef2ff" opacity="0" ${TEXT}>z` +
          `<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="${i * 0.8}s" repeatCount="indefinite"/>` +
          `<animate attributeName="y" values="74;48" dur="2.4s" begin="${i * 0.8}s" repeatCount="indefinite"/></text>`)
        .join('')
    case 'question':
      return `<text x="${x}" y="36" font-size="24" fill="#2ef2ff" ${TEXT}>?</text>`
    case 'bang':
      return `<text x="${x}" y="34" font-size="28" fill="#ff3b47" ${TEXT}>!</text>`
  }
}

const ms = (n: number) => `${Math.round(n)}ms`

/**
 * Одна SVG на всю цепочку: кадры лежат в defs по разу, каждая часть включает свои кадры
 * в своё время (set для разовых клипов, discrete animate для петель), последняя петля — бесконечно.
 * Цепочка, не влезшая в budget (по умолчанию — предел движка), теряет переходы и промежуточные части.
 * Эффекты шагов панель не рисует; клипы общие — свои кадры героев есть только у питомца.
 */
export const chainSvg = (
  parts: readonly Part[],
  png: (frame: string) => string,
  size: readonly [number, number],
  budget = SVG_LIMIT,
): string => {
  const [w, h] = size
  const frames = [...new Set(parts.flatMap(p => CLIPS[p.clip].steps.map(([f]) => f)))]
  // Одинаковые картинки — один раз: у героя, которому кадры ещё не нарисованы, вместо них один и тот же запасной.
  const images = [...new Set(frames.map(png))]
  const id = (frame: string) => `f${images.indexOf(png(frame))}`
  const defs = images.map((data, i) => `<image id="f${i}" href="data:image/png;base64,${data}" width="${w}" height="${h}"/>`).join('')
  let at = 0
  const layers = parts.map((part, i) => {
    const clip: Clip = CLIPS[part.clip]
    const isLast = i === parts.length - 1
    const length = partLength(part)
    const begin = at
    at += length
    const cycle = clip.steps.reduce((sum, [, d]) => sum + d, 0)
    const used = [...new Set(clip.steps.map(([f]) => f))]
    const body = used.map(frame => {
      if (!clip.loop) {
        let t = begin
        const sets = clip.steps.map(([f, d]) => {
          const set = f === frame ? `<set attributeName="opacity" to="1" begin="${ms(t)}" ${isLast ? '' : `dur="${ms(d)}"`} fill="${isLast ? 'freeze' : 'remove'}"/>` : ''
          t += d

          return set
        })
        // Последний кадр разовой части в конце цепочки остаётся на экране.
        return `<use href="#${id(frame)}" opacity="0">${sets.join('')}</use>`
      }
      const keys: string[] = []
      const values: string[] = []
      let t = 0
      for (const [f, d] of clip.steps) {
        keys.push(String(Math.round((t / cycle) * 100000) / 100000))
        values.push(f === frame ? '1' : '0')
        t += d
      }
      const repeat = isLast ? 'repeatCount="indefinite"' : `repeatDur="${ms(length)}"`

      return `<use href="#${id(frame)}" opacity="0"><animate attributeName="opacity" calcMode="discrete" begin="${ms(begin)}" dur="${ms(cycle)}" ${repeat} keyTimes="${keys.join(';')}" values="${values.join(';')}"/></use>`
    }).join('')
    const shown = isLast ? `begin="${ms(begin)}"` : `begin="${ms(begin)}" dur="${ms(length)}"`
    const hop = clip.hop
      ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -16;0 0" keyTimes="0;.4;1" calcMode="spline" keySplines=".2 .7 .4 1;.5 0 .8 .3" begin="${ms(begin)}" dur="450ms" fill="remove"/>`
      : ''
    const mark = clip.overlay ? `<g opacity="0"><set attributeName="opacity" to="1" ${shown}/>${overlay(clip.overlay, w)}</g>` : ''

    return `<g>${hop}${body}</g>${mark}`
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${layers.join('')}</svg>`
  if (svg.length < budget || parts.length < 2) {
    return svg
  }

  return chainSvg(parts.slice(1), png, size, budget)
}

// Первый кадр последней части — для терминала, где SVG нет.
export const chainPoster = (parts: readonly Part[]): string => {
  const last = parts[parts.length - 1]

  return last ? CLIPS[last.clip].steps[0]?.[0] ?? 'idle_01' : 'idle_01'
}

export type { Ref }
