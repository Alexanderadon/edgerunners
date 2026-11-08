// Рисует экран героя (hooks/hud.ts) в файл hud-<сцена>.svg для проверки глазами.
// Запуск: node tools/hud-preview.mjs <папка> [ширина]
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const mod = join(import.meta.dirname, '..')
const [out = join(mod, 'preview'), width = '380'] = process.argv.slice(2)
// Модули мода лежат в папке без "type": "module": грузим их копии как .mts.
const tmp = join(tmpdir(), 'personazhi-hud')
mkdirSync(tmp, { recursive: true })
for (const name of ['animation', 'helper', 'hud']) {
  const src = readFileSync(join(mod, 'hooks', `${name}.ts`), 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.mts'")
  writeFileSync(join(tmp, `${name}.mts`), src)
}
const { chainSvg } = await import(pathToFileURL(join(tmp, 'animation.mts')).href)
const { backdropSvg, overlaySvg, screenHeight } = await import(pathToFileURL(join(tmp, 'hud.mts')).href)
const jpeg = readFileSync(join(mod, 'assets', 'backdrop', 'kadr.jpg')).toString('base64')

const dir = join(mod, 'assets', 'kadr')
const frames = Object.fromEntries(readdirSync(dir).filter(f => f.endsWith('.png'))
  .map(f => [f.replace(/\.png$/, ''), readFileSync(join(dir, f)).toString('base64')]))
const size = [160, 208]
const usage = { percent: 64, tokens: 641000, window: 1000000, usd: 38.52 }
const scenes = [
  ['idle', [{ clip: 'idle' }], 'ONLINE', 'Камера готова, жду сюжет.'],
  ['sit', [{ clip: 'sit' }], 'ОТДЫХ', 'Сижу, жду тебя.'],
  ['think', [{ clip: 'think' }], 'ДУМАЕТ', 'О, что ты там пишешь? Дай посмотреть, это интересно!'],
]
mkdirSync(out, { recursive: true })
// Как в панели: фон, поверх него прозрачный слой.
const uri = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
for (const [name, parts, status, line] of scenes) {
  const overlay = overlaySvg({
    width: Number(width), name: 'kadr', status, line, usage,
    hero: budget => chainSvg(parts, f => frames[f] ?? frames.idle_01, size, budget), heroSize: size, portrait: frames.idle_01,
  })
  const h = screenHeight(Number(width))
  writeFileSync(join(out, `hud-${name}.html`), `<!doctype html><body style="margin:0;background:#1a1a1a">` +
    `<div style="position:relative;width:${width}px;height:${h}px"><img src="${uri(backdropSvg(Number(width), jpeg))}" style="position:absolute">` +
    `<img src="${uri(overlay)}" style="position:absolute"></div></body>`)
  console.log(`hud-${name}: overlay ${overlay.length} chars`)
}
