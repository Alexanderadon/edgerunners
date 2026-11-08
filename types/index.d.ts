export type Mood = 'idle' | 'think' | 'work' | 'happy' | 'sad'

export type Usage = { percent: number; tokens: number; window: number; usd: number }

declare module 'claude-code' {
  interface PluginState {
    edgerunners: {
      hero: string
      mood: Mood
      tool: string
      // Реплика героя к текущей сцене: выбирается случайно при смене сцены, без повтора подряд.
      line: string
      // Цепочка частей анимации героя с кадрами (Part[] из hooks/animation.ts) в JSON.
      scene: string
      // Сколько занято контекста и сколько стоила сессия — из session.measure.
      usage: Usage
    }
  }
}
