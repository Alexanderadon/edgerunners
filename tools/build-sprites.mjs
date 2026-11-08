// Собирает hooks/sprites/ из assets/<герой>/*.png: по файлу на анимацию (движок не читает файлы больше 1 МБ —
// большая анимация делится на части <герой>_<анимация>_2, _3…) и hooks/sprites.ts: кадры героя по имени файла и их размер.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const mod = process.argv[2]
const assets = join(mod, 'assets')
const outDir = join(mod, 'hooks', 'sprites')
// Герои с кадрами панели /persona (assets/<id>, 160x208). Остальные папки assets — не герои.
const HEROES = ['kadr', 'talia', 'di', 'wick']
const LIMIT = 1_000_000
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir)

const HEAD = '// Сгенерировано из assets/: кадры PNG в base64. Руками не править — пересобрать.\n'
const imports = []
const sets = []
const write = (name, frames) => {
  writeFileSync(
    join(outDir, `${name}.ts`),
    `${HEAD}export const frames: Record<string, string> = {\n${frames.map(([n, b]) => `  ${n}: '${b}',`).join('\n')}\n}\n`,
  )
  imports.push(`import { frames as ${name} } from './sprites/${name}'`)
  return `...${name}`
}
for (const hero of HEROES) {
  const dir = join(assets, hero)
  const pngs = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.png')).sort() : []
  if (pngs.length === 0) {
    console.log(`${hero}: нет кадров в assets/${hero} — пропущен`)
    continue
  }
  const groups = {}
  let size
  for (const file of pngs) {
    const bytes = readFileSync(join(dir, file))
    size ??= [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
    ;(groups[file.split('_')[0]] ??= []).push([file.replace(/\.png$/, ''), bytes.toString('base64')])
  }
  const parts = []
  for (const [group, frames] of Object.entries(groups)) {
    // Части не больше LIMIT: строка кадра — имя, кавычки и base64.
    let chunk = []
    let bytes = HEAD.length + 64
    let n = 1
    for (const frame of frames) {
      const cost = frame[0].length + frame[1].length + 8
      if (chunk.length > 0 && bytes + cost > LIMIT) {
        parts.push(write(n === 1 ? `${hero}_${group}` : `${hero}_${group}_${n}`, chunk))
        chunk = []
        bytes = HEAD.length + 64
        n++
      }
      chunk.push(frame)
      bytes += cost
    }
    parts.push(write(n === 1 ? `${hero}_${group}` : `${hero}_${group}_${n}`, chunk))
  }
  sets.push(`  ${hero}: { size: [${size}], frames: { ${parts.join(', ')} } },`)
  console.log(`${hero}: ${size} ${Object.values(groups).flat().length} frames, ${parts.length} modules`)
}

writeFileSync(
  join(mod, 'hooks', 'sprites.ts'),
  `${HEAD}${imports.join('\n')}\n\nexport type SpriteSet = { size: readonly [number, number]; frames: Record<string, string> }\n\n` +
    `export const SPRITES: Record<string, SpriteSet> = {\n${sets.join('\n')}\n}\n`,
)

// Фоны экрана героя: assets/backdrop/<герой>.jpg → hooks/backdrop.ts.
const backdrops = join(assets, 'backdrop')
const bgs = readdirSync(backdrops).filter(f => f.endsWith('.jpg')).sort()
writeFileSync(
  join(mod, 'hooks', 'backdrop.ts'),
  `${HEAD}export const BACKDROPS: Record<string, string> = {\n${bgs
    .map(f => `  ${f.replace(/\.jpg$/, '')}: '${readFileSync(join(backdrops, f)).toString('base64')}',`).join('\n')}\n}\n`,
)
console.log(`backdrops: ${bgs.join(', ')}`)

// Проверка: ни один сгенерированный модуль не больше 1 МБ.
const big = [...readdirSync(outDir).map(f => join(outDir, f)), join(mod, 'hooks', 'sprites.ts'), join(mod, 'hooks', 'backdrop.ts')]
  .filter(f => statSync(f).size > LIMIT)
if (big.length > 0) {
  console.error(`больше 1 МБ: ${big.join(', ')}`)
  process.exit(1)
}
