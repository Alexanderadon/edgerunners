// Пишет art/<герой>/sheets.json для всех героев: какие кадры в каком листе, масштаб и привязка;
// недорисованные листы пропускает, а их кадры временно подменяет похожими позами. Запуск: node tools/sheets-manifests.mjs
// Манифесты листов всех героев: какой кадр в какой ячейке, масштаб и привязка.
import fs from 'node:fs'
const art = 'E:/Projects/personazhi/art'
const n4 = (c, from = 1) => [0, 1, 2, 3].map(i => `${c}_0${i + from}`)
const n8 = c => [1, 2, 3, 4, 5, 6, 7, 8].map(i => `${c}_0${i}`)
const each = (list, mode) => Object.fromEntries(list.map(f => [f, mode]))
const X4 = ['-', '-', '-', '-']
const gest = p => [
  { file: `sheets/${p}-g1.png`, frames: [...n4('wave'), ...n4('nod')], scale: { ref: 'wave_01', part: 1.0 }, anchor: 'body' },
  { file: `sheets/${p}-g2.png`, frames: [...n4('laugh'), ...n4('celebrate')], scale: { ref: 'laugh_01', part: 1.0 }, anchor: 'body', anchors: each(n4('celebrate'), 'cell') },
  { file: `sheets/${p}-g3.png`, frames: n8('dance'), scale: { ref: 'dance_02', part: 1.0 }, anchor: 'cell' },
  { file: `sheets/${p}-g4.png`, frames: [...n4('type'), ...n4('read')], scale: { ref: 'type_01', part: 1.0 }, anchor: 'body' },
  { file: `sheets/${p}-g5.png`, frames: [...n4('scan'), ...n4('point')], scale: { ref: 'point_01', part: 1.0 }, anchor: 'body' },
  { file: `sheets/${p}-g6.png`, frames: [...n4('facepalm'), ...n4('angry')], scale: { ref: 'facepalm_01', part: 1.0 }, anchor: 'body' },
  { file: `sheets/${p}-g7.png`, frames: [...n4('scared'), ...n4('shrug')], scale: { ref: 'shrug_01', part: 1.0 }, anchor: 'body', anchors: each(n4('scared'), 'cell') },
  { file: `sheets/${p}-g8.png`, frames: [...n4('stretch'), ...n4('bored')], scale: { ref: 'stretch_01', part: 1.0 }, anchor: 'body' },
  { file: `sheets/${p}-g9.png`, frames: [...n4('drink'), ...n4('sneeze')], scale: { ref: 'drink_01', part: 1.0 }, anchor: 'body' },
  { file: `sheets/${p}-g10.png`, frames: [...n4('phone'), ...n4('music')], scale: { ref: 'phone_01', part: 1.0 }, anchor: 'body' },
  { file: `sheets/${p}-g11.png`, frames: [...n4('clap'), ...n4('bow')], scale: { ref: 'bow_01', part: 1.0 }, anchor: 'body' },
  { file: `sheets/${p}-g12.png`, frames: [...n4('selfie'), ...n4('fix')], scale: { ref: 'fix_01', part: 1.0 }, anchor: 'body' },
  { file: `sheets/${p}-g13.png`, frames: n8('run'), scale: { ref: 'run_01', part: 0.95 }, anchor: 'head' },
]
// Переходы и покой: сесть (sd), лечь (ld), уснуть (fa), начать работу (rc), рука к подбородку (tc), мелочи покоя (iv).
const moves = (p, legacy = false) => [
  { file: `sheets/${p}-t1.png`, frames: n8('sd'), scale: { ref: 'sd_01', part: 1.0 }, anchor: 'cell',
    alias: legacy ? undefined : { sit_01: 'sd_08', sitdown_01: 'sd_02', sitdown_02: 'sd_04', sitdown_03: 'sd_07' } },
  { file: `sheets/${p}-t2.png`, frames: [...n4('ld'), ...n4('fa')], scale: { ref: 'ld_01', match: 'sd_08', by: 'h' }, anchor: 'cell', anchors: { ld_01: 'center' },
    alias: { lie_01: 'ld_04', lie_02: 'fa_01', sleep_01: 'fa_04', fallasleep_01: 'fa_02', liedown_01: 'ld_02', liedown_02: 'ld_03' } },
  { file: `sheets/${p}-t3.png`, frames: [...n4('rc'), ...n4('tc')], scale: { ref: 'rc_01', part: 1.0 }, anchor: 'body' },
  { file: `sheets/${p}-t4.png`, frames: n8('iv'), scale: { ref: 'iv_01', part: 1.0 }, anchor: 'body' },
]
const base = (p, workAnchor, t1 = true, t2 = true) => [
  { file: `sheets/${p}-k1.png`, frames: ['idle_01', 'idle_02', 'idle_03', 'look_01', 'look_02', 'filmyou_01', 'curious_01', 'surprised_01'], scale: { ref: 'idle_01', part: 1.0 }, anchor: 'body' },
  { file: `sheets/${p}-k2.png`, frames: n8('walk'), scale: { ref: 'walk_03', part: 0.99 }, anchor: 'head' },
  { file: `sheets/${p}-k3.png`, frames: n8('film'), scale: { ref: 'film_01', part: 1.0 }, anchor: workAnchor },
  { file: `sheets/${p}-k4.png`, frames: [...n4('think'), ...n4('hello')], scale: { ref: 'think_01', part: 1.0 }, anchor: 'body' },
  { file: `sheets/${p}-k5.png`, frames: [...['01', '02', '03', '04', '05', '06'].map(i => `happy_${i}`), 'raisecam_01', 'tochin_01'], scale: { ref: 'raisecam_01', part: 1.0 }, anchor: 'cell', anchors: { raisecam_01: 'body', tochin_01: 'body' } },
  { file: `sheets/${p}-k6.png`, frames: [...n4('sad'), ...(t1 ? X4 : ['sitdown_01', 'sitdown_02', 'sitdown_03', 'sit_01'])], scale: { ref: 'sad_01', part: 0.97 }, anchor: 'body', anchors: each(['sitdown_01', 'sitdown_02', 'sitdown_03', 'sit_01'], 'cell') },
  { file: `sheets/${p}-k7.png`, frames: ['sit_02', 'yawn_01', 'doze_01', ...(t2 ? ['-', '-', '-', '-', '-'] : ['liedown_01', 'liedown_02', 'lie_01', 'lie_02', 'sleep_01'])], scale: { ref: 'sit_02', match: t1 ? 'sd_08' : 'sit_01', by: 'h' }, anchor: 'cell' },
]
const stunts = p => [
  { file: `sheets/${p}-st1.png`, frames: n8('lp'), scale: { ref: 'lp_08', part: 1.0 }, anchor: 'cell' },
  { file: `sheets/${p}-st2.png`, frames: n8('pk'), scale: { ref: 'pk_08', part: 1.0 }, anchor: 'cell' },
]
const FALLBACK = {
  sd: ['idle_01', 'sitdown_01', 'sitdown_01', 'sitdown_02', 'sitdown_02', 'sitdown_03', 'sitdown_03', 'sit_01'],
  ld: ['sit_02', 'liedown_01', 'liedown_02', 'lie_01'], fa: ['lie_02', 'lie_02', 'sleep_01', 'sleep_01'],
  rc: ['idle_01', 'raisecam_01', 'raisecam_01', 'film_01'], tc: ['idle_01', 'tochin_01', 'tochin_01', 'think_01'],
  iv: ['idle_01', 'idle_03', 'look_01', 'look_02', 'idle_01', 'idle_03', 'idle_02', 'idle_03'],
  run: n8('walk'), facepalm: ['surprised_01', 'sad_02', 'sad_02', 'sad_04'], angry: ['sad_01', 'surprised_01', 'sad_03', 'sad_04'],
  scared: ['surprised_01', 'surprised_01', 'surprised_01', 'surprised_01'], shrug: n4('think'),
  stretch: ['idle_01', 'hello_04', 'hello_04', 'idle_03'], bored: ['idle_02', 'look_01', 'sad_02', 'look_02'],
  drink: ['idle_01', 'idle_03', 'idle_03', 'idle_01'], sneeze: ['look_01', 'surprised_01', 'surprised_01', 'idle_02'],
  phone: n4('read'), music: ['nod_01', 'nod_02', 'nod_03', 'nod_02'],
  clap: ['celebrate_01', 'celebrate_04', 'celebrate_01', 'celebrate_04'], bow: ['nod_01', 'nod_02', 'nod_02', 'nod_03'],
  selfie: n4('hello'), fix: ['idle_01', 'idle_03', 'idle_02', 'idle_01'],
}
const fillGaps = list => {
  const real = new Set(list.flatMap(s => s.frames.filter(f => f !== '-')))
  const alias = {}
  for (const [clip, src] of Object.entries(FALLBACK)) src.forEach((from, i) => {
    const name = `${clip}_0${i + 1}`
    if (!real.has(name) && real.has(from)) alias[name] = from
  })
  if (list[0] && Object.keys(alias).length) list[0] = { ...list[0], alias: { ...(list[0].alias ?? {}), ...alias } }
  return list
}
const exists = (h, f) => fs.existsSync(`${art}/${h}/sheets/${h}-${f}.png`)
const has = (hero, s) => fs.existsSync(`${art}/${hero}/${s.file}`)
const grid = list => list.map(s => ({ grid: [2, 4], ...s }))
const write = (hero, list) => {
  let ok = grid(list).filter(s => s.file === 'film-sheet.png' || has(hero, s))
  // Лист, который подгоняется к кадру из ещё не нарисованного листа, ждёт его (у Романа есть старые одиночные кадры).
  const given = new Set(ok.flatMap(s => [...s.frames, ...Object.keys(s.alias ?? {})]))
  if (hero !== 'kadr') ok = fillGaps(ok.filter(s => !s.scale.match || given.has(s.scale.match)))
  fs.writeFileSync(`${art}/${hero}/sheets.json`, JSON.stringify(ok, null, 2) + '\n')
  console.log(hero, ok.length, '/', list.length)
}
write('talia', [...base('talia', 'feet'), ...gest('talia'), ...moves('talia'), ...stunts('talia')])
write('di', [...base('di', 'body', exists('di', 't1'), exists('di', 't2')), ...gest('di'), ...moves('di')])
write('wick', [...base('wick', 'body', exists('wick', 't1'), exists('wick', 't2')), ...gest('wick'), ...moves('wick')])
// Роман: старые одиночные кадры сидя/лёжа остаются, переходы подгоняются к ним.
write('kadr', [
  { file: 'film-sheet.png', frames: n8('film'), scale: { ref: 'film_01', part: 1.0 }, anchor: 'feet' },
  ...gest('roman'),
  ...moves('roman', true),
  { file: 'sheets/roman-an.png', frames: n8('an'), scale: { ref: 'an_08', part: 1.0 }, anchor: 'body' },
])
