// Пишет питомцу состояние для проверки без сессии Claude:
//   node tools/pet-demo.mjs [сцена|клип] [реплика] [--hero talia]
// Сцены: cheer (прыжок и привет), party (долгий ход: танец), enter (выбор героя), call (звонок), think (кивнул,
// рука к подбородку), oops, danger, film (поднял камеру и снимает; у Романа — с ракурсами и трюками Талии в кадре),
// idle (покой с мелочами iv_), sit (садится), stand (встаёт), lie (сидя ложится), sleep (садится, ложится, засыпает),
// wake (просыпается рывком, встаёт, потягивается); любой клип по имени (wave, dance, run…) — он и стойка после него.
//   node tools/pet-demo.mjs list   — все клипы;   node tools/pet-demo.mjs check — каких кадров нет в assets/pet/<герой>.
// Демо пишет session "demo" и busy: true: питомец держится за занятую сессию, и простаивающие сессии демо не перебьют.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const mod = join(import.meta.dirname, '..')
const tmp = join(tmpdir(), 'personazhi-hud')
mkdirSync(tmp, { recursive: true })
for (const name of ['animation', 'lines', 'characters']) {
  const source = readFileSync(join(mod, 'hooks', `${name}.ts`), 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.mts'")
  writeFileSync(join(tmp, `${name}.mts`), source)
}
const { CLIPS, COSTARS, flatChain, heroFrames, route, stuntReel } = await import(pathToFileURL(join(tmp, 'animation.mts')).href)
const { HEROES, heroById } = await import(pathToFileURL(join(tmp, 'characters.mts')).href)

const args = process.argv.slice(2)
const flag = args.indexOf('--hero')
const heroId = flag >= 0 ? args.splice(flag, 2)[1] : 'kadr'
const [scene = 'cheer', given] = args
const who = heroById(heroId)

if (scene === 'list') {
  console.log(Object.keys(CLIPS).join(' '))
  process.exit(0)
}

// Все кадры, которые играют клипы героя (с его собственными и трюками напарника), — есть ли они у героев с кадрами.
if (scene === 'check') {
  for (const one of HEROES.filter(each => each.sprite)) {
    const frames = heroFrames(one.sprite).sort()
    const dir = join(mod, 'assets', 'pet', one.sprite)
    const missing = existsSync(dir) ? frames.filter(f => !existsSync(join(dir, `${f}.png`))) : frames
    console.log(`${one.sprite}: ${existsSync(dir) ? `нет ${missing.length} из ${frames.length}` : 'папки нет'}${missing.length && existsSync(dir) ? `\n  ${missing.join(' ')}` : ''}`)
  }
  process.exit(0)
}

// from — с какой позы начинать (по умолчанию стоя): переходы вставляет route.
const PLANS = {
  cheer: { plan: [{ clip: 'happy' }, { clip: 'celebrate' }, { clip: 'hello', ms: 3000 }, { clip: 'idle' }] },
  party: { plan: [{ clip: 'happy' }, { clip: 'dance', ms: 5000 }, { clip: 'hello', ms: 3000 }, { clip: 'idle' }] },
  enter: { plan: [{ clip: 'bow' }, { clip: 'hello', ms: 3000 }, { clip: 'idle' }] },
  call: { plan: [{ clip: 'point' }, { clip: 'wave' }, { clip: 'idle' }] },
  think: { plan: [{ clip: 'nod' }, { clip: 'curious', ms: 1500 }, { clip: 'think' }] },
  oops: { plan: [{ clip: 'surprised' }, { clip: 'facepalm' }, { clip: 'sad', ms: 2500 }, { clip: 'idle' }] },
  danger: { plan: [{ clip: 'scared' }, { clip: 'film' }] },
  film: { plan: [{ clip: 'film' }] },
  idle: { plan: [{ clip: 'idle' }] },
  sit: { plan: [{ clip: 'sit' }] },
  stand: { from: 'sit', plan: [{ clip: 'idle' }] },
  lie: { from: 'sit', plan: [{ clip: 'lie' }] },
  sleep: { plan: [{ clip: 'sit', ms: 1500 }, { clip: 'yawn' }, { clip: 'lie', ms: 2000 }, { clip: 'sleep' }] },
  wake: { from: 'sleep', plan: [{ clip: 'stretch' }, { clip: 'idle' }] },
}
// Клип по имени: петля крутится сама, разовый — и потом стойка.
const named = CLIPS[scene] ? { plan: CLIPS[scene].loop ? [{ clip: scene }] : [{ clip: scene }, { clip: 'idle' }] } : undefined
const chosen = PLANS[scene] ?? named
if (!chosen) {
  console.error(`Нет сцены «${scene}». Сцены: ${Object.keys(PLANS).join(' ')}; клипы: node tools/pet-demo.mjs list`)
  process.exit(1)
}
const parts = route(chosen.from ?? 'idle', chosen.plan)
const { timeline, loop } = flatChain(parts, who.sprite)
const action = chosen.plan[0].clip
const lines = who.scenes?.[action] ?? who.lines.happy
const line = given ?? lines[Math.floor(Math.random() * lines.length)]
const roster = HEROES.filter(one => one.sprite).map(one => ({ id: one.id, sprite: one.sprite, name: one.name, role: one.role ?? '', about: one.about ?? '', stats: one.stats ?? [] }))
const pokes = ['laugh', 'wave', 'surprised', 'shrug', 'celebrate'].map(clip => flatChain([{ clip }]).timeline)
// Напарник в кадре: как у мода — только в своей сцене (Роман в film снимает трюки Талии).
const costar = who.sprite ? COSTARS[who.sprite] : undefined
const partner = costar && costar.scene === parts[parts.length - 1].clip ? HEROES.find(one => one.sprite === costar.partner) : undefined
writeFileSync(join(mod, 'assets', 'pet', 'state.json'), JSON.stringify({
  seq: `demo-${Date.now()}`, session: 'demo', busy: true, hero: who.sprite ?? null, name: who.name, role: who.role ?? '',
  timeline, loop, line, alive: Date.now(), roster, pokes, pokeLines: who.pokeLines ?? [], pokeMad: who.pokeMad ?? [], enter: flatChain(PLANS.enter.plan).timeline,
  ...(partner ? { costar: { sprite: costar.partner, name: partner.name, stunts: stuntReel(costar.stunts) } } : {}),
}))
const path = parts.map(part => part.clip).join(' → ')
console.log(`${who.name}, ${scene}: ${path}; ${timeline.length} + ${loop.length} кадров${partner ? `, в кадре ${partner.name}` : ''} — «${line}»`)
