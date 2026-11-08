// Экран героя в стиле аниме-киберпанка. Фон — HUD-панель из ChatGPT (assets/backdrop: красная шапка,
// красная голо-карточка сообщения со слотом под портрет, бирюзовая зона героя с кольцом сканера, нижний слот);
// поверх неё прозрачный слой: герой на кольце, портрет и реплика в карточке, шкала контекста в слоте.
// Фон и слой — две SVG: у каждой свой предел размера, и фон не урезает анимацию.
import type { Usage } from '../types'
import { SVG_LIMIT } from './animation'
import { kilo } from './helper'

// Где что на фоне, в его координатах 384x576 (размечено по art/backdrop/kadr-hud.png).
export const LAYOUT = {
  w: 384,
  h: 576,
  header: { x: 24, y: 24, right: 360 },
  portrait: { x: 38, y: 62, w: 52, h: 48 },
  card: { x: 104, label: 68, y: 86, lines: 2, step: 18, w: 248 },
  stage: { x: 192, floor: 440, scale: 1.55 },
  bar: { x: 30, y: 531, segs: 14, seg: 9, gap: 3, h: 10 },
  barText: { x: 206, y: 540 },
}

const CYAN = '#2ef2ff'
const RED = '#ff3b47'
const YELLOW = '#fcee0a'
const FONT = 'font-family="Bahnschrift, \'Segoe UI\', sans-serif"'

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Реплика по строкам под ширину карточки.
const wrap = (text: string, perLine: number, max: number) => {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(/\s+/)) {
    if (current && (current + ' ' + word).length > perLine) {
      lines.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) {
    lines.push(current)
  }

  return lines.length > max ? [...lines.slice(0, max - 1), `${lines[max - 1]}…`] : lines
}

const shell = (width: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${screenHeight(width)}" viewBox="0 0 ${LAYOUT.w} ${LAYOUT.h}">${body}</svg>`

export const screenHeight = (width: number) => Math.round(width * LAYOUT.h / LAYOUT.w)

export const backdropSvg = (width: number, jpeg: string) =>
  shell(width, `<image href="data:image/jpeg;base64,${jpeg}" width="${LAYOUT.w}" height="${LAYOUT.h}"/>`)

// Текст с лёгким глитчем: красная и бирюзовая тени со сдвигом, как на старом голо-экране.
const glitch = (x: number, y: number, size: number, fill: string, text: string, anchor = 'start') =>
  `<g ${FONT} font-size="${size}" text-anchor="${anchor}" letter-spacing="1.5">` +
  `<text x="${x - 1}" y="${y}" fill="${RED}" opacity=".55">${text}</text>` +
  `<text x="${x + 1}" y="${y}" fill="${CYAN}" opacity=".55">${text}</text>` +
  `<text x="${x}" y="${y}" fill="${fill}">${text}</text></g>`

export type Hud = {
  width: number
  name: string
  status: string
  line: string
  usage: Usage
  // Герой с кадрами: готовая SVG цепочки и её размер, кадр-портрет; без кадров — крупное лицо из символов.
  hero?: (budget: number) => string
  heroSize?: readonly [number, number]
  portrait?: string
  face?: string
}

export const overlaySvg = (hud: Hud) => {
  const { header, portrait, card, stage, bar, barText } = LAYOUT
  const glow = '<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'

  // Мини-портрет героя в слоте карточки: голова из кадра стойки, с бирюзовой подсветкой.
  const face = hud.portrait
    ? `<svg x="${portrait.x}" y="${portrait.y}" width="${portrait.w}" height="${portrait.h}" viewBox="54 30 54 50" preserveAspectRatio="xMidYMid slice">` +
      `<image href="data:image/png;base64,${hud.portrait}" width="160" height="208"/></svg>` +
      `<rect x="${portrait.x}" y="${portrait.y}" width="${portrait.w}" height="${portrait.h}" fill="${CYAN}" opacity=".08"/>`
    : ''

  // Герой стоит на кольце сканера: линия земли кадра совпадает с полом.
  let figure = ''
  if (hud.hero && hud.heroSize) {
    const [fw, fh] = hud.heroSize
    const w = fw * stage.scale
    const h = fh * stage.scale
    const ground = (fh - 6) * stage.scale
    figure = hud.hero(SVG_LIMIT - 7000 - (hud.portrait?.length ?? 0))
      .replace(`width="${fw}" height="${fh}"`, `x="${stage.x - w / 2}" y="${stage.floor - ground}" width="${w}" height="${h}"`)
  } else if (hud.face) {
    figure = `<text x="${stage.x}" y="${stage.floor - 70}" text-anchor="middle" font-size="40" fill="${CYAN}" filter="url(#glow)" ${FONT}>${esc(hud.face)}</text>`
  }

  // Реплика в красной карточке: бирюзовая подпись «входящее», текст — светлый, с мерцанием появления.
  const say = wrap(hud.line, Math.floor(card.w / 8.2), card.lines)
  const message = `<g>` +
    `<text x="${card.x}" y="${card.label}" font-size="10" letter-spacing="2" fill="${CYAN}" ${FONT}>ВХОДЯЩЕЕ // ${esc(hud.name.toUpperCase())}</text>` +
    say.map((s, i) => `<text x="${card.x}" y="${card.y + i * card.step}" font-size="16" font-weight="600" fill="#ffffff" ${FONT}>${esc(s)}</text>`).join('') +
    `<animate attributeName="opacity" values="0;1;.4;1" dur="420ms" fill="freeze"/></g>`

  // Шкала контекста в нижнем слоте: бирюзовые сегменты, к пределу — красные; жёлтая подпись.
  const ctx = Math.max(0, Math.min(100, Math.round(hud.usage.percent)))
  const lit = Math.round((ctx / 100) * bar.segs)
  const segments = Array.from({ length: bar.segs }, (_, i) => {
    const on = i < lit
    const color = i >= bar.segs - 3 ? RED : CYAN

    return `<path d="M${bar.x + i * (bar.seg + bar.gap) + 2} ${bar.y}h${bar.seg}l-2 ${bar.h}h-${bar.seg}z" fill="${on ? color : '#16202a'}"${on ? ' filter="url(#glow)"' : ''}/>`
  }).join('')
  const money = hud.usage.usd > 0 ? ` · $${hud.usage.usd.toFixed(2)}` : ''
  const ctxText = hud.usage.window ? `CTX ${ctx}% · ${kilo(hud.usage.tokens)}/${kilo(hud.usage.window)}${money}` : 'CTX —'

  return shell(hud.width, `${glow}${figure}${face}${message}
${glitch(header.x, header.y, 13, '#ffffff', `${esc(hud.name.toUpperCase())}.EXE`)}
<g ${FONT} font-size="12" letter-spacing="1.5" text-anchor="end"><text x="${header.right}" y="${header.y}" fill="${YELLOW}">[ ${esc(hud.status)} ]<animate attributeName="opacity" values="1;1;.2;1;1" keyTimes="0;.7;.75;.8;1" dur="2.4s" repeatCount="indefinite"/></text></g>
${segments}<text x="${barText.x}" y="${barText.y}" font-size="11" letter-spacing="1" fill="${YELLOW}" ${FONT}>${esc(ctxText)}</text>`)
}
