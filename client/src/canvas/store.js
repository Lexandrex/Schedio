import { useSyncExternalStore } from 'react'

/**
 * Estado pequeno e muito frequente (coordenadas do mouse, seleção do texto em
 * edição) que só um componente mostra. Guardado num `useState` do CanvasPage,
 * cada mudança re-renderizava a página inteira — mapa, camadas e painel — a
 * cada movimento do mouse. Num store, só quem assina re-renderiza.
 */
export function createStore(initial) {
  let value = initial
  const listeners = new Set()
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore(store) {
  return useSyncExternalStore(store.subscribe, store.get)
}
