/** Enquadramento do mapa: deslocamento em pixels de tela e zoom. */
export const DEFAULT_VIEW = { x: 240, y: 160, zoom: 1 }

export const MIN_ZOOM = 0.15
export const MAX_ZOOM = 4

export function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}
