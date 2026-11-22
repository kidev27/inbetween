import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { loadContent } from '../server/content.ts'
import { serverModes } from '../server/modes/registry.ts'

// Validates every committed content file the same way the server does at boot.
it('all content files are valid', () => {
  const puzzles = loadContent(fileURLToPath(new URL('../content', import.meta.url)), serverModes)
  expect(puzzles.size).toBeGreaterThan(0)
})
