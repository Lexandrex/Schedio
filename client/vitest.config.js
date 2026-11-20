import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

/*
 * Testes de componente (React no jsdom). Ficam fora do `vite.config.js` para o
 * build de produção não carregar nada do Vitest.
 *
 * A cobertura sai em JSON (formato do Istanbul) e LCOV em `../coverage/client`: o
 * script `coverage:frontend` da raiz junta esse relatório com o do c8, que
 * mede os testes `node:test` de `tests/unit/` sobre os módulos do client.
 * `include` lista todo o `src/`, então arquivo sem teste nenhum entra no
 * relatório com 0% em vez de sumir dele.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.{js,jsx}'],
      setupFiles: ['tests/setup.js'],
      // Digitar letra a letra pesa: com a máquina ocupada um teste honesto
      // estourava os 5 s padrão e, com ele, sumia o relatório de cobertura.
      testTimeout: 30000,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{js,jsx}'],
        // `lcov` é o que o SonarCloud lê (sonar-project.properties). Os
        // caminhos saem relativos à raiz do repositório (`client/src/...`),
        // que é de onde o Sonar os resolve; sem `projectRoot` sairiam
        // `src/...` e a cobertura dos componentes não casaria com arquivo nenhum.
        reporter: ['text-summary', 'json', ['lcov', { projectRoot: '..' }]],
        reportsDirectory: '../coverage/client',
      },
    },
  }),
)
