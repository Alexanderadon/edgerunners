// Проба анимации героя в браузере: собирает те же SVG-цепочки, что рисует мод (hooks/animation.ts),
// из кадров assets/<герой>. Запуск: node tools/preview.mjs <герой> <папка для preview.html>
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const mod = join(import.meta.dirname, '..')
const [hero = 'kadr', out = join(mod, 'preview')] = process.argv.slice(2)
// animation.ts лежит в папке без "type": "module", поэтому грузим его копию как .mts.
const copy = join(tmpdir(), 'personazhi-animation.mts')
copyFileSync(join(mod, 'hooks', 'animation.ts'), copy)
const { chainSvg, route } = await import(pathToFileURL(copy).href)

const dir = join(mod, 'assets', hero)
const frames = Object.fromEntries(readdirSync(dir).filter(f => f.endsWith('.png'))
  .map(f => [f.replace(/\.png$/, ''), readFileSync(join(dir, f)).toString('base64')]))
const first = readFileSync(join(dir, readdirSync(dir).find(f => f.endsWith('.png'))))
const size = [first.readUInt32BE(16), first.readUInt32BE(20)]
const png = f => frames[f] ?? frames.idle_01


const CHAINS = [
  ['Весь день подряд', [
    { clip: 'idle', ms: 4000 }, { clip: 'sit', ms: 4000 }, { clip: 'yawn' }, { clip: 'lie', ms: 3000 },
    { clip: 'sleep', ms: 4000 }, { clip: 'curious', ms: 1800 }, { clip: 'think', ms: 3500 }, { clip: 'film', ms: 3000 },
    { clip: 'walk', ms: 2500 }, { clip: 'happy' }, { clip: 'hello', ms: 3000 }, { clip: 'idle' },
  ]],
  ['Садится и ложится', [{ clip: 'idle', ms: 1500 }, { clip: 'sit', ms: 2500 }, { clip: 'yawn' }, { clip: 'lie' }]],
  ['Засыпает', [{ clip: 'lie', ms: 1500 }, { clip: 'sleep' }]],
  ['Просыпается от сообщения', [{ clip: 'sleep', ms: 2000 }, { clip: 'curious', ms: 1800 }, { clip: 'think' }]],
  ['Берётся за камеру', [{ clip: 'idle', ms: 1500 }, { clip: 'film', ms: 3000 }, { clip: 'idle' }]],
  ['Радуется', [{ clip: 'happy' }, { clip: 'hello' }]],
]

mkdirSync(out, { recursive: true })
const tiles = CHAINS.map(([title, plan], i) => {
  // Первая часть играет как есть, дальше — с переходами, как у режиссёра мода.
  const parts = [plan[0], ...route(plan[0].clip, plan.slice(1))]
  writeFileSync(join(out, `chain${i}.svg`), chainSvg(parts, png, size))

  return `<div class="tile"><img src="chain${i}.svg?${Date.now()}" width="${size[0]}" height="${size[1]}"><div>${title}</div>` +
    `<button onclick="this.parentNode.querySelector('img').src='chain${i}.svg?'+Date.now()">сначала</button></div>`
})
writeFileSync(join(out, 'preview.html'), `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Кадр — проба</title>
<style>body{margin:0;padding:16px;background:#24262c;color:#e8e8ec;font:15px/1.4 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#a9abb3}.grid{display:flex;flex-wrap:wrap;gap:12px}
.tile{background:#3c4048;border-radius:10px;padding:8px;text-align:center}.tile div{margin:4px 0;font-size:13px}
button{font:inherit;font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid #5a5e68;background:#31343b;color:#e8e8ec;cursor:pointer}</style>
</head><body><h1>Кадр — анимация с переходами</h1><p>Это те же SVG, что рисует мод. «сначала» — проиграть цепочку заново.</p>
<div class="grid">${tiles.join('')}</div></body></html>`)
console.log(`preview: ${CHAINS.length} chains → ${out}`)
