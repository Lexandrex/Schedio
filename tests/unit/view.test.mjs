import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_VIEW, MAX_ZOOM, MIN_ZOOM, clampZoom } from '../../client/src/canvas/view.js'

test('o zoom fica entre o mínimo e o máximo', () => {
  assert.equal(clampZoom(1), 1)
  assert.equal(clampZoom(0.01), MIN_ZOOM)
  assert.equal(clampZoom(100), MAX_ZOOM)
})

test('o enquadramento inicial já respeita os limites', () => {
  assert.equal(clampZoom(DEFAULT_VIEW.zoom), DEFAULT_VIEW.zoom)
})
