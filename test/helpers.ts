/** A valid prompt: limits Low (10) and High (100) on a log scale, with one answer per outcome. */
export function testPrompt(title = 'Test prompt') {
  return {
    category: 'weight',
    title,
    question: 'Name something heavier than Low but lighter than High.',
    unit: 'kg',
    scale: 'log',
    words: ['heavy', 'light'],
    lo: { name: 'Low', value: 10 },
    hi: { name: 'High', value: 100 },
    common: 'Middle',
    rarest: 'Gem',
    source: 'Made up for tests',
    answers: [
      { name: 'Middle', value: 50, tier: 'pin', aliases: ['mid'] },
      { name: 'Ruler', value: 40, tier: 'ruler' },
      { name: 'Yardstick', value: 60, tier: 'yardstick' },
      { name: 'Gem', value: 30, tier: 'milestone', fact: 'Gems are rare.' },
      { name: 'Edge', value: 102 },
      { name: 'Giant', value: 500 },
      { name: 'Speck', value: 1 },
    ],
  }
}

export function testPuzzle(title = 'Test day') {
  return { prompts: Array.from({ length: 7 }, (_, i) => testPrompt(`${title} ${i + 1}`)) }
}
