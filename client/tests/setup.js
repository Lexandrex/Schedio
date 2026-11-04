import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// O padrão de 1 s para `findBy`/`waitFor` falha à toa com a máquina ocupada.
configure({ asyncUtilTimeout: 10000 })

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})
