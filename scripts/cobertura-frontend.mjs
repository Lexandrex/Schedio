/*
 * Cobertura do frontend (`client/src`): junta os dois runners de teste.
 *
 * O client é testado por dois caminhos, e nenhum deles sozinho mede tudo:
 * - `node:test` (`tests/unit/`), sob o c8: os módulos puros do canvas, da API
 *   e das tags, sem navegador;
 * - Vitest + jsdom (`client/tests/`): componentes e páginas React. O JSX
 *   precisa da transformação do Vite, que o c8 não sabe fazer — por isso o
 *   Vitest mede a própria cobertura.
 *
 * Escolhemos combinar os dois em vez de usar só o relatório do Vitest: assim
 * os testes de `tests/unit/` continuam contando para o frontend, como sempre
 * contaram. Mas os dois contam "linha" de jeitos diferentes — o c8 conta toda
 * linha do arquivo, inclusive comentário e linha em branco; o Vitest lê a AST
 * e conta só linha com código executável. Somar os relatórios crus misturaria
 * as duas réguas. Então a régua é uma só, a do Vitest:
 *
 *   - o Vitest define QUAIS linhas existem (o denominador), em todo o `src/`,
 *     inclusive arquivo que nenhum teste importa (entra com 0%);
 *   - uma linha conta como coberta se o Vitest OU o node:test passou por ela
 *     (o c8 só acrescenta acertos, nunca linhas novas).
 *
 * Uso: node scripts/cobertura-frontend.mjs [meta-de-linhas, padrão 25]
 * Sai com código 1 se a meta não for atingida. O relatório HTML fica em
 * coverage/frontend/index.html.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import libCoverage from 'istanbul-lib-coverage'
import libReport from 'istanbul-lib-report'
import reports from 'istanbul-reports'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT_SRC = path.join(RAIZ, 'client', 'src') + path.sep
const META = Number(process.argv[2] ?? 25)

const VITEST = {
  nome: 'Vitest',
  arquivo: 'coverage/client/coverage-final.json',
  comando: 'npm --prefix client run test:coverage',
}
const NODE_TEST = {
  nome: 'node:test (c8)',
  arquivo: 'coverage/frontend-node/coverage-final.json',
  comando: 'npm run test:coverage',
}

/** O c8 e o Vitest escrevem o caminho de jeitos diferentes (barra, letra do drive). */
function normalizar(arquivo) {
  const absoluto = path.resolve(arquivo)
  return process.platform === 'win32' ? absoluto[0].toUpperCase() + absoluto.slice(1) : absoluto
}

function carregar({ nome, arquivo, comando }) {
  const caminho = path.join(RAIZ, arquivo)
  if (!fs.existsSync(caminho)) {
    console.error(`Falta o relatório do ${nome} (${arquivo}). Rode antes: ${comando}`)
    process.exit(1)
  }

  const bruto = JSON.parse(fs.readFileSync(caminho, 'utf8'))
  const mapa = libCoverage.createCoverageMap({})
  for (const dados of Object.values(bruto)) {
    const arquivoFonte = normalizar(dados.path)
    if (!arquivoFonte.startsWith(CLIENT_SRC)) continue
    mapa.addFileCoverage({ ...dados, path: arquivoFonte })
  }
  return mapa
}

/**
 * Soma ao arquivo do Vitest os acertos que o c8 viu: cada comando cuja linha
 * inicial o node:test executou conta como executado; cada função declarada
 * numa linha em que o c8 viu uma função chamada, idem.
 */
function somarAcertos(doVitest, doC8) {
  const dados = structuredClone(doVitest.toJSON())
  const linhasC8 = doC8.getLineCoverage()
  for (const [id, comando] of Object.entries(dados.statementMap)) {
    dados.s[id] += linhasC8[comando.start.line] ?? 0
  }

  const funcoesC8 = new Map()
  for (const [id, funcao] of Object.entries(doC8.fnMap)) {
    const linha = funcao.decl.start.line
    funcoesC8.set(linha, (funcoesC8.get(linha) ?? 0) + doC8.f[id])
  }
  for (const [id, funcao] of Object.entries(dados.fnMap)) {
    dados.f[id] += funcoesC8.get(funcao.decl.start.line) ?? 0
  }
  return dados
}

const linhas = (mapa) => {
  const { covered, total, pct } = mapa.getCoverageSummary().lines
  return `${pct}% (${covered}/${total})`
}

const vitest = carregar(VITEST)
const nodeTest = carregar(NODE_TEST)

const combinado = libCoverage.createCoverageMap({})
for (const arquivo of vitest.files()) {
  const doVitest = vitest.fileCoverageFor(arquivo)
  combinado.addFileCoverage(
    nodeTest.data[arquivo] ? somarAcertos(doVitest, nodeTest.fileCoverageFor(arquivo)) : doVitest,
  )
}
for (const arquivo of nodeTest.files()) {
  if (!vitest.data[arquivo]) console.warn(`Aviso: ${arquivo} só aparece no relatório do c8 e ficou de fora.`)
}

const contexto = libReport.createContext({
  dir: path.join(RAIZ, 'coverage', 'frontend'),
  coverageMap: combinado,
  defaultSummarizer: 'nested',
})
for (const formato of ['text-summary', 'html', 'lcovonly']) {
  reports.create(formato).execute(contexto)
}

console.log(`Linhas do frontend só com o Vitest:        ${linhas(vitest)}`)
console.log(`Linhas do frontend com Vitest + node:test: ${linhas(combinado)}`)

const pct = combinado.getCoverageSummary().lines.pct
if (pct < META) {
  console.error(`ERRO: cobertura de linhas do frontend (${pct}%) abaixo da meta de ${META}%.`)
  process.exit(1)
}
console.log(`Meta de ${META}% de linhas no frontend atingida.`)
