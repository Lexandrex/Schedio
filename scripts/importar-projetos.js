#!/usr/bin/env node
/**
 * Copia projetos do banco de desenvolvimento (o do `.env`) para outra instância
 * do Schedio Drasis, normalmente a de produção.
 *
 *   npm run projetos:importar -- https://schedio-drasis.azurewebsites.net
 *
 * Lê o banco local direto, mas escreve no destino só pela API, como o editor
 * faria: login, criar projeto, enviar imagens, gravar conteúdo, capa e status.
 * Assim valem as mesmas validações e o dono é quem fez login. O banco de
 * produção continua fechado para fora do Azure.
 *
 * As imagens são baixadas e enviadas de novo: em produção elas ganham cópia
 * própria na pasta de produção do Cloudinary, e apagar um projeto de um lado não
 * apaga o arquivo do outro. Curtidas, salvos e denúncias não vêm junto, porque
 * pertencem às contas de desenvolvimento.
 */
require('dotenv').config();

const readline = require('node:readline');
const { pool } = require('../db');

const destino = (process.argv[2] || '').replace(/\/+$/, '');

// Um leitor só para o programa inteiro: as linhas ficam numa fila e nenhuma se
// perde se chegarem antes da pergunta (colar várias de uma vez, ou um pipe).
let leitor;
let linhas;
let ocultando = false;

/** Pergunta no terminal; com `oculto`, não mostra o que é digitado (senha). */
async function perguntar(texto, { oculto = false } = {}) {
  if (!leitor) {
    leitor = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    const escrever = leitor._writeToOutput.bind(leitor);
    leitor._writeToOutput = (s) => { if (!ocultando) escrever(s); };
    linhas = leitor[Symbol.asyncIterator]();
  }
  leitor.setPrompt(texto);
  leitor.prompt();
  ocultando = oculto && Boolean(process.stdin.isTTY);
  const { value = '' } = await linhas.next();
  if (ocultando) {
    ocultando = false;
    process.stdout.write('\n');
  }
  return value.trim();
}

async function api(caminho, { token, method = 'GET', json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  const resposta = await fetch(`${destino}${caminho}`, {
    method,
    headers,
    body: json ? JSON.stringify(json) : form,
  });
  const corpo = resposta.status === 204 ? null : await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(`${method} ${caminho}: ${resposta.status} ${corpo?.message || resposta.statusText}`);
  }
  return corpo;
}

/** Baixa a imagem da URL pública e envia ao destino no mesmo formato de upload do editor. */
async function reenviarImagem(url, caminho, token) {
  const baixada = await fetch(url);
  if (!baixada.ok) throw new Error(`não foi possível baixar ${url}: ${baixada.status}`);
  const tipo = baixada.headers.get('content-type') || 'image/png';
  const form = new FormData();
  form.append('imagem', new Blob([await baixada.arrayBuffer()], { type: tipo }), `imagem.${tipo.split('/')[1] || 'png'}`);
  return api(caminho, { token, method: 'POST', form });
}

/** Todos os objetos de imagem do documento do editor, em qualquer profundidade. */
function imagensDoConteudo(no, achadas = []) {
  if (Array.isArray(no)) no.forEach((item) => imagensDoConteudo(item, achadas));
  else if (no && typeof no === 'object') {
    if (typeof no.src === 'string' && 'imageId' in no) achadas.push(no);
    Object.values(no).forEach((valor) => imagensDoConteudo(valor, achadas));
  }
  return achadas;
}

async function importar(projeto, token) {
  const { project: novo } = await api('/api/projects', {
    token, method: 'POST',
    json: { titulo: projeto.titulo, descricao: projeto.descricao, categoria: projeto.categoria },
  });

  // Mesma imagem usada duas vezes no canvas sobe uma vez só.
  const conteudo = structuredClone(projeto.conteudo);
  const novas = new Map();
  for (const elemento of imagensDoConteudo(conteudo)) {
    if (!novas.has(elemento.src)) {
      const { image } = await reenviarImagem(elemento.src, `/api/projects/${novo.id}/imagens`, token);
      novas.set(elemento.src, image);
    }
    const image = novas.get(elemento.src);
    elemento.src = image.url;
    elemento.imageId = image.id;
  }
  await api(`/api/projects/${novo.id}/conteudo`, { token, method: 'PUT', json: { conteudo } });

  if (projeto.capa) {
    await reenviarImagem(projeto.capa, `/api/projects/${novo.id}/capa`, token);
  }
  if (projeto.status === 'publicado') {
    await api(`/api/projects/${novo.id}/status`, { token, method: 'PATCH', json: { status: 'publicado' } });
  }
  return { id: novo.id, imagens: novas.size };
}

async function main() {
  if (!/^https?:\/\//.test(destino)) {
    throw new Error('Informe o endereço de destino: npm run projetos:importar -- https://schedio-drasis.azurewebsites.net');
  }

  const origem = await perguntar('E-mail da sua conta no banco de DESENVOLVIMENTO: ');
  const { rows: projetos } = await pool.query(
    `SELECT p.id, p.titulo, p.descricao, p.categoria, p.capa, p.status, p.conteudo
     FROM projetos p JOIN users u ON u.id = p.usuario_id
     WHERE u.email = $1 ORDER BY p.criado`,
    [origem.toLowerCase()],
  );
  if (!projetos.length) throw new Error('Nenhum projeto dessa conta no banco de desenvolvimento.');

  console.log('\nProjetos encontrados:');
  projetos.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.titulo} (${p.status}, ${imagensDoConteudo(p.conteudo).length} imagens${p.capa ? ', com capa' : ''})`);
  });
  const escolha = await perguntar('\nQuais importar? Números separados por vírgula, ou "todos": ');
  const escolhidos = escolha.toLowerCase() === 'todos'
    ? projetos
    : escolha.split(',').map((n) => projetos[Number(n.trim()) - 1]).filter(Boolean);
  if (!escolhidos.length) throw new Error('Nenhum projeto escolhido.');

  console.log(`\nLogin em ${destino} (a conta precisa já existir e estar verificada lá):`);
  const email = await perguntar('E-mail: ');
  const senha = await perguntar('Senha: ', { oculto: true });
  const { token } = await api('/api/auth/login', { method: 'POST', json: { email, password: senha } });

  // Título repetido no destino é tratado como já importado: rodar de novo não duplica.
  const { projects: existentes } = await api('/api/projects/mine', { token });
  const titulos = new Set(existentes.map((p) => p.titulo));

  let falhas = 0;
  for (const projeto of escolhidos) {
    if (titulos.has(projeto.titulo)) {
      console.log(`- ${projeto.titulo}: já existe no destino, pulado`);
      continue;
    }
    try {
      const { imagens } = await importar(projeto, token);
      console.log(`✓ ${projeto.titulo}: ${imagens} imagens, ${projeto.status}`);
    } catch (error) {
      falhas += 1;
      console.error(`✗ ${projeto.titulo}: ${error.message}`);
    }
  }
  if (falhas) {
    console.error(`\n${falhas} projeto(s) falharam. Apague no site a cópia incompleta (fica privada) e rode de novo.`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    leitor?.close();
    return pool.end();
  });
