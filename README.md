# [MODELO] RFC: Request for Comments — Projeto de Portfólio

**Engenharia de Software – Católica SC**

---

# Identificação

- **Título do Projeto:**  
  Schedio Drasis

- **Linha de Projeto (Direction):**  
  Aplicação Web

- **Autor:**  
  Alexandre Sebastian Basso Muller

- **Data da Proposta:**  
13/03/2026

- **Versão:**  
  1.0

---

# 1. Visão do Produto e Impacto (O Problema)

O objetivo desta seção é responder uma pergunta fundamental:

**Este projeto resolve um problema real ou é apenas um exercício técnico?**
O desenvolvimento da aplicação Web (Schedio Drasis) tem como objetivo providenciar uma área onde escritores possam publicar suas histórias ou artigos, de acordo com sua preferência, sendo esses disponíveis ao público ou mantido de maneira privada, neste caso servindo também para desenvolvedores que buscam elaborar protótipos de seus projetos 

---

## 1.1 Contexto e Problema

Descreva claramente o problema que motivou o projeto.

Explique:

- Quem sofre com esse problema
- Em que contexto ele ocorre
- Como esse problema é resolvido atualmente
- Quais são as limitações das soluções atuais

Sempre que possível apresente:

- exemplos reais
- prints de processos atuais
- descrições de fluxos existentes

Atualmente, não se encontram facilmente aplicativos ou plataformas que proporcionem ao escritor plena liberdade sobre sua obra, permitindo também disponibilizá-la ao público de forma interativa. Um gênero conhecido como “interactive fiction” consiste justamente na possibilidade de o público interagir em tempo real com o conteúdo apresentado na tela, podendo alterar o rumo da história.

Além disso, em contextos informativos, como artigos, o leitor poderia especificar ou aprofundar determinadas informações por meio de imagens adicionais ou ser redirecionado para tópicos mais específicos relacionados ao conteúdo apresentado.

Como consequência, essa liberdade de criação e interação também pode beneficiar desenvolvedores e designers de UI/UX, especialmente durante a fase de prototipagem de projetos desenvolvidos em equipe. Nesse cenário, o ambiente de desenvolvimento pode se assemelhar a ferramentas colaborativas como o Figma, permitindo que diversas pessoas trabalhem simultaneamente em um mesmo projeto.

A ideia de uma aplicação voltada à criação de histórias interativas não é inédita. Ela é inspirada em aplicações já existentes, como Storyfall, Squiffy e Netstory, que, embora não sejam amplamente populares ou possuam focos mais específicos, apresentam funcionalidades relevantes para essa área.

Entretanto, a mesclagem e simplificação dessas ferramentas, combinadas com conceitos presentes em aplicações como Figma, Penpot e Adobe XD, constituem um diferencial deste projeto.

O objetivo desta proposta não é substituir nenhuma dessas tecnologias. Pelo contrário, busca-se agregar valor à área de desenvolvimento de projetos pessoais, podendo inclusive servir como uma porta de entrada para o uso dessas ferramentas mais complexas, oferecendo inicialmente uma abordagem mais simples, intuitiva e acessível ao público.

---

## 1.2 Origem da Demanda e Evidências

É necessário demonstrar que existe **interesse real pela solução**.

Apresente pelo menos **uma evidência concreta**.

### Demanda Externa
### Pesquisa com Usuários

Para justificar o impacto do projeto proposto para desenvolvimento, foi realizada uma enquete com diversas perguntas disponibilizadas ao público, com o objetivo de coletar feedback e sugestões dos participantes.

Entre as perguntas presentes no questionário, uma delas foi: “Você costuma utilizar o Figma para outras funções além da criação de protótipos de projetos envolvendo desenvolvimento de software?”. Os resultados indicaram que 85,7% dos participantes responderam “não”, enquanto 14,3% responderam “sim”.

![imagem exeplo](Screenshots/Resultado1)

Esse resultado pode indicar que uma grande parcela dos usuários utiliza o Figma exclusivamente para sua proposta principal, ou ainda que parte do público considera a ferramenta complexa de utilizar, o que pode limitar sua aplicação em outros contextos.

Esse cenário também se relaciona com outro questionamento presente na enquete: “Você utilizaria uma nova versão mais simplificada do Figma e totalmente gratuita?”. O resultado obtido foi expressivo, com 100% dos participantes respondendo “sim”.
![imagem exeplo](Screenshots/Resultado2)

Esse resultado pode estar relacionado a mudanças recentes em algumas funcionalidades do Figma, especialmente no setor de prototipagem, que passaram a fazer parte de planos pagos. Essa alteração pode ter dificultado o processo de desenvolvimento para diversos usuários, principalmente aqueles que utilizam a ferramenta para projetos pessoais ou acadêmicos.

A seguir, apresenta-se um exemplo de feedback fornecido por um dos participantes da pesquisa:

- “Muitas das ferramentas disponíveis no Figma não são intuitivas. Demorei muito tempo para conseguir utilizar a plataforma e só consegui melhorar minhas habilidades depois de assistir a vídeos de outras pessoas demonstrando como realizar determinados processos.”

Esse tipo de retorno reforça a percepção de que, embora o Figma seja uma ferramenta poderosa e amplamente utilizada no desenvolvimento de interfaces, sua curva de aprendizado pode representar um obstáculo para novos usuários, especialmente aqueles que estão iniciando na área de design ou prototipagem.

---

## 1.3 Análise de Soluções Existentes (Benchmark)

### 1. Netstory

Link: https://netstory.io

Público-alvo:
Criadores de histórias digitais e leitores interessados em experiências narrativas interativas.

Funcionalidades principais:

- Criação de histórias interativas
- Navegação por escolhas durante a leitura
- Compartilhamento de conteúdo com o público

Limitações:

- Ecossistema limitado de ferramentas de edição
- Baixa flexibilidade para projetos mais complexos
- Falta de recursos voltados para prototipagem ou design de interfaces

![imagem exeplo](Screenshots/Netstory)

### 2. Squiffy

Link: https://squiffystory.com

Público-alvo:
Autores de ficção interativa e desenvolvedores interessados em criar narrativas ramificadas.

Funcionalidades principais:

- Criação de histórias com escolhas e múltiplos finais
- Estrutura baseada em texto e links narrativos
- Exportação de histórias em formato HTML
- Ferramenta gratuita e open source

Limitações:

- Interface pouco intuitiva para iniciantes
- Pouco suporte a elementos visuais e multimídia
- Não possui recursos colaborativos em tempo real---

  ![imagem exeplo](Screenshots/Squiffy)

### 3. Figma

Link: https://www.figma.com

Público-alvo:
Designers UI/UX, desenvolvedores e equipes de produto.

Funcionalidades principais:

- Design de interfaces digitais
- Prototipagem interativa
- Colaboração em tempo real
- Compartilhamento e feedback de projetos

Limitações:

- Não voltado para criação narrativa
- Algumas funcionalidades importantes são pagas
- Curva de aprendizado relativamente elevada para iniciantes

  ![imagem exeplo](Screenshots/figma)

### Comparação
| Solução   | Pontos Fortes                            | Limitações                                  |
| --------- | ---------------------------------------- | ------------------------------------------- |
| Squiffy   | Open source e exportação em HTML         | Interface complexa e pouco intuitiva        |
| Netstory  | Experiência narrativa interativa         | Pouca flexibilidade e ferramentas limitadas |
| Figma     | Colaboração em tempo real e prototipagem | Não voltado para narrativa                  |

### Diferencial do Projeto

A criação desta nova plataforma busca preencher lacunas identificadas nas soluções analisadas.

Atualmente, as ferramentas disponíveis se dividem em dois grupos principais: plataformas focadas na criação de histórias interativas e ferramentas voltadas para design e prototipagem colaborativa. No entanto, não existe uma solução que combine de forma simples e intuitiva essas duas abordagens.

O projeto proposto pretende unir essas funcionalidades em uma única plataforma, permitindo que usuários criem histórias interativas, artigos dinâmicos ou estruturas narrativas complexas, utilizando um ambiente visual semelhante ao de ferramentas de design colaborativo.

O nicho específico atendido pelo projeto inclui escritores, criadores de conteúdo digital, designers e equipes de desenvolvimento que desejam estruturar narrativas interativas ou fluxos de informação de forma visual e colaborativa.

---

## 1.4 Público-Alvo

O sistema será voltado principalmente para usuários interessados em criação de conteúdo interativo e colaboração em projetos narrativos ou de design.

### Os principais usuários do sistema incluem:

- escritores e autores de ficção interativa
- estudantes e criadores de conteúdo digital
- designers de UI/UX
- desenvolvedores que desejam prototipar fluxos narrativos ou experiências interativas

### Contexto de uso

A plataforma poderá ser utilizada em diferentes contextos, como:

- criação de histórias interativas
- desenvolvimento de protótipos narrativos para jogos
- organização de ideias e fluxos de informação
- produção de conteúdo educacional ou informativo com navegação interativa

O sistema será projetado para atender tanto usuários iniciantes quanto usuários intermediários, priorizando uma interface simples e intuitiva. Dessa forma, não será necessário conhecimento avançado em programação para utilizar a plataforma.

---

## 1.5 Objetivos do Projeto

### Objetivo Geral

Desenvolver uma plataforma digital que permita a criação, organização e publicação de histórias e conteúdos interativos, oferecendo um ambiente colaborativo inspirado em ferramentas de design visual.

---

### Objetivos Específicos

- Desenvolver um editor visual baseado em nós para criação de narrativas interativas
- Permitir colaboração em tempo real entre múltiplos usuários
- Criar um sistema de navegação interativa para os leitores
- Disponibilizar uma interface simples e acessível para usuários iniciantes
- Permitir a privatização de Prototipazem 

---

## 1.6 Métricas de Sucesso (KPIs)

- Tempo médio de carregamento inferior a 2 segundos
- Suporte a pelo menos 100 usuários simultâneos na plataforma
- Separação precisa de desenvolvedor para telespectador 
- Nível de satisfação dos usuários superior a 80% em avaliações da plataforma
- feedback positivo de 80% dos usuários referentes ao desenvolvimento  

---

# 2. Engenharia de Requisitos

## 2.1 Personas

###  Ana — Escritora

- **Contexto:** Ana é uma estudante de lestras que gosta de escrever histórias interativas e artigos
- **Objetivos:**
  - Criar histórias com múltiplos caminhos
  - Publicar conteúdo  
- **Dificuldades:**
  - Ferramentas complexas
  - Opções não dinamicas
  - Dificuldade em organizar narrativa  

---

###  Lucas — Designer

- **Contexto:** Lucas faz parte de uma equipe do setor de UI/UX de uma empresa
- **Objetivos:**
  - Criar protótipos  
  - Colaborar com equipe  
- **Dificuldades:**
  - Curva de aprendizado  
  - Limitações de plano gratuito  

---

###  Rafael — Leitor

- **Contexto:** Consumidor de histórias criadas pelos amigos 
- **Objetivos:**
  - Explorar histórias interativas
  - Incentivar a criação de novos conteudos 
- **Dificuldades:**
  - Poucas plataformas  
  - Conteúdo desorganizado

###  Gabriel — Estudante

- **Contexto:** Devo criar uma apresentação sobre determinado assunto da faculdade utilizando uma nova ferramenta de elaboração de slides
- **Objetivos:**
  - Elaborar uma apresentação em equipe
  - Explorar novas ferramentas
- **Dificuldades:**
  - Poucas plataformas  
  - Opções tradicionais pouco intuitivas 



---

## 2.2 Casos de Uso Principais

Liste os principais fluxos do sistema.

Exemplo:

- criar conta
- registrar dados
- consultar informações
- gerar relatórios

Sempre que possível inclua **diagramas de caso de uso**.

---

# 2.3 Requisitos Funcionais (RF)
# Usuário
Requisitos relacionados à criação e gerenciamento de contas de usuário.
| ID    | Requisito                                                                           |
| ----- | ----------------------------------------------------------------------------------- |
| RF-01 | O sistema deve permitir a **criação de usuário**                                    |
| RF-02 | O sistema deve permitir **login de usuário**                                        |
| RF-03 | O sistema deve permitir **recuperação de senha por e-mail**                         |
| RF-04 | O sistema deve permitir **edição do e-mail da conta**                               |
| RF-05 | O sistema deve permitir **escolher a categoria da sessão (Editor / Telespectador)** |
| RF-06 | O sistema deve permitir **trocar a categoria durante a sessão**                     |

## Navegação de Projetos
Requisitos relacionados à exploração e descoberta de projetos.
| ID    | Requisito                                                     |
| ----- | ------------------------------------------------------------- |
| RF-07 | O sistema deve permitir **navegar entre projetos**            |
| RF-08 | O sistema deve permitir **filtrar projetos**                  |
| RF-09 | O sistema deve permitir **visualizar projetos publicados**    |
| RF-10 | O sistema deve permitir **buscar projetos por palavra-chave** |

# Editor
## Gerenciamento de Projeto
| ID    | Requisito                                                                       |
| ----- | ------------------------------------------------------------------------------- |
| RF-11 | O sistema deve permitir **criar projetos**                                      |
| RF-12 | O sistema deve permitir **editar projetos existentes**                          |
| RF-13 | O sistema deve permitir **salvar projetos manualmente**                         |
| RF-14 | O sistema deve realizar **salvamento automático a cada 10 segundos**            |
| RF-15 | O sistema deve permitir **publicar projetos**                                   |
| RF-16 | O sistema deve permitir **privatizar projetos**                                 |
| RF-17 | O sistema deve permitir **excluir projetos**                                    |
| RF-18 | O sistema deve permitir **gerar links de visualização, colaboração ou preview** |

## Ferramentas de Edição
| ID    | Requisito                                                                |
| ----- | ------------------------------------------------------------------------ |
| RF-19 | O sistema deve permitir **criação e edição de formas**                   |
| RF-20 | O sistema deve permitir **desenhar utilizando a ferramenta pincel**      |
| RF-21 | O sistema deve permitir **selecionar múltiplos objetos simultaneamente** |
| RF-22 | O sistema deve permitir **alterar cores de elementos gráficos**          |
| RF-23 | O sistema deve permitir **inserção e edição de texto**                   |
| RF-24 | O sistema deve permitir **adição de imagens ao projeto**                 |
| RF-25 | O sistema deve permitir **edição de imagens inseridas**                  |

## Estrutura e Navegação
| ID    | Requisito                                                              |
| ----- | ---------------------------------------------------------------------- |
| RF-26 | O sistema deve permitir **criação de telas dentro do projeto**         |
| RF-27 | O sistema deve permitir **edição de telas**                            |
| RF-28 | O sistema deve permitir **navegação entre telas**                      |
| RF-29 | O sistema deve permitir **visualização do mapa estrutural do projeto** |
| RF-30 | O sistema deve permitir **zoom no mapa do projeto**                    |
| RF-31 | O sistema deve permitir **alterar cor do mapa**                        |

## prototipagem 
| ID    | Requisito                                                                              |
| ----- | -------------------------------------------------------------------------------------- |
| RF-32 | O sistema deve permitir **criar transições entre telas**                               |
| RF-33 | O sistema deve permitir **navegação entre telas utilizando a ferramenta de protótipo** |
| RF-34 | O sistema deve permitir **simular navegação interativa do projeto**                    |

# Telespectador
| ID    | Requisito                                                          |
| ----- | ------------------------------------------------------------------ |
| RF-35 | O sistema deve permitir **visualizar projetos publicados**         |
| RF-36 | O sistema deve permitir **comentar em projetos**                   |
| RF-37 | O sistema deve permitir **favoritar projetos**                     |
| RF-38 | O sistema deve permitir **dar like em projetos**                   |
| RF-39 | O sistema deve permitir **reportar projetos**                      |
| RF-40 | O sistema deve permitir **salvar projetos para leitura posterior** |
| RF-41 | O sistema deve permitir **compartilhar projetos**                  |

## 2.4 Requisitos Não Funcionais (RNF)
| ID     | Requisito                                                            |
| ------ | ------------------------------------------------------------------   |
| RNF-01 | O sistema deve possuir **tempo de resposta inferior a 2 segundos**   |
| RNF-02 | O sistema deve suportar **no mínimo 100 usuários simultâneos**       |
| RNF-03 | Senhas devem ser **armazenadas com criptografia segura**             |
| RNF-04 | O sistema deve possuir **controle de acesso baseado em permissões**  |
| RNF-05 | O sistema deve funcionar nos **principais navegadores modernos**     |
| RNF-06 | O sistema deve ser **responsivel com dispositivos desktop e mobile** |

---

## 2.5 Regras de Negócio

Exemplos:

- apenas usuários autenticados podem acessar determinados recursos
- determinadas operações exigem validação adicional

---

## 2.6 Fora do Escopo

Liste explicitamente **o que o sistema não fará**.

Isso ajuda a evitar crescimento descontrolado do projeto.

---

# 3. Fluxos e Comportamento do Sistema

Esta seção demonstra **como o sistema funciona**.

Use diagramas sempre que possível.

---

## 3.1 Fluxo Principal do Usuário

Apresente o fluxo principal do sistema.

Utilize:

- fluxogramas
- diagramas de atividades
- diagramas de sequência

Inclua **imagens dos diagramas**.

---

## 3.2 Fluxos Alternativos

Descreva cenários como:

- erros
- cancelamentos
- exceções

---

# 4. Mockups e Experiência do Usuário (UX)

Esta seção apresenta **a visualização inicial do produto antes da implementação**.

Mockups ajudam a validar:

- fluxo de navegação
- organização da interface
- interações do usuário
- clareza da experiência

Ferramentas sugeridas:

- Figma
- Excalidraw
- Balsamiq
- Whimsical
- protótipos desenhados à mão

---

## 4.1 Fluxo de Navegação

Apresente um diagrama mostrando como o usuário navega entre telas.

Exemplo:

Login → Dashboard → Cadastro → Relatório

Inclua **imagem do fluxo de navegação**.

---

## 4.2 Wireframes ou Mockups das Telas

Apresente os principais mockups do sistema.

Inclua pelo menos:

- tela inicial
- fluxo principal
- tela de entrada de dados
- tela de resultado ou visualização

Para cada tela inclua:

- imagem
- breve descrição da funcionalidade
- ações principais do usuário

Sempre que possível:

- inclua **links para protótipo navegável**
- inclua **prints das telas**

---

## 4.3 Fluxo de Interação do Usuário

Demonstre passo a passo um fluxo importante.

Exemplo:

1. usuário acessa o sistema  
2. cria conta  
3. registra dados  
4. visualiza resultados  

Inclua **sequência de telas ou fluxo visual**.

---

## 4.4 Feedback Inicial de Usuários (Opcional)

Se possível, inclua:

- comentários de usuários
- sugestões de melhoria
- validação inicial do mockup

---

# 5. Arquitetura do Sistema

Esta seção demonstra **como o sistema será construído**.

---

## 5.1 Diagrama C4

Apresente três níveis.
## 1. Nível 1: Diagrama de Contexto
É a **visão macro** do sistema. O foco aqui não é a tecnologia, mas sim como o software se encaixa no ecossistema e no mundo real.

* **Objetivo:** Mostrar o sistema como uma "caixa preta" e suas interações básicas com o ambiente externo.
* **O que incluir:**
    * **Atores:** Diferentes perfis de usuários (Ex: Cliente, Administrador, Operador).
    * **Sistemas Externos:** Softwares legados, serviços de terceiros ou provedores de identidade.
    * **Fluxo de Valor:** Como a informação entra, circula e sai do sistema principal.

---

## 2. Nível 2: Diagrama de Containers
Neste estágio, damos o primeiro **"zoom"**. Decompomos o sistema em suas unidades de execução independentes (containers).

* **Objetivo:** Apresentar a arquitetura de alto nível e as decisões tecnológicas fundamentais.
* **O que incluir:**
    * **Aplicações Web/Mobile:** Interfaces de usuário (Ex: SPA em React, App Android/iOS).
    * **Serviços de Backend:** Unidades lógicas de processamento (Ex: API Gateway, Microserviços em Node.js ou Go).
    * **Armazenamento:** Persistência de dados (Ex: PostgreSQL, MongoDB, Redis).
    * **Protocolos:** Como os containers se comunicam (Ex: JSON/HTTPS, gRPC, RabbitMQ).

---

## 3. Nível 3: Diagrama de Componentes
O foco agora é o que acontece **dentro de um único container** (como uma API específica ou um serviço de backend).

* **Objetivo:** Identificar as responsabilidades internas, padrões de código e a organização lógica.
* **O que incluir:**
    * **Estrutura Interna:** Organização das camadas (Ex: Controladores, Serviços, Repositórios e Clientes de API).
    * **Lógica de Negócio:** Componentes que encapsulam as regras específicas do domínio.
    * **Interações:** Como os componentes internos se orquestram para processar e responder a uma requisição.
---

## 5.2 Modelo de Dados

Apresente:

- DER (diagrama entidade relacionamento)
- esquema relacional
- modelo de documentos (NoSQL)

Inclua **diagramas do modelo de dados**.

---

## 5.3 Principais Componentes

Descreva os principais módulos do sistema.

Exemplo:

- API
- sistema de autenticação
- módulo de processamento
- camada de persistência

---

## 5.4 Stack Tecnológica

Liste as tecnologias utilizadas.

Para cada tecnologia explique **por que ela foi escolhida**.

Exemplo:

Node.js  
Escolhido pela capacidade de lidar com alto volume de requisições I/O.

---

# 6. Segurança e Privacidade

Inclua preocupações básicas de segurança.

Exemplos:

- proteção contra OWASP Top 10
- autenticação e autorização
- criptografia de dados sensíveis

---

## 6.1 Privacidade e LGPD

Explique:

- quais dados serão coletados
- como serão armazenados
- como o usuário poderá solicitar remoção de dados

---

# 7. Planejamento do Projeto

Defina os principais marcos de desenvolvimento.

| Marco | Descrição | Prazo |
|---|---|---|
| M1 | Setup do ambiente e prova de conceito | Semana X |
| M2 | MVP funcional | Semana Y |
| M3 | Testes e melhorias | Semana Z |

---

# 8. Referências

Inclua:

- artigos
- documentação técnica
- ferramentas utilizadas
- repositórios

---

# 9. Apêndices

Podem incluir:

- mockups adicionais
- resultados de pesquisa
- entrevistas com usuários
- diagramas complementares
- links para protótipos ou repositórios

Sempre que possível inclua **imagens, protótipos ou referências visuais**.

---

# 10. Parecer do Comitê de Avaliação

(A ser preenchido pelos professores)

**Avaliador 1:** __________________________  
**Status:** [ ] Aprovado  [ ] Ajustar

Observações:

---

**Avaliador 2:** __________________________  
**Status:** [ ] Aprovado  [ ] Ajustar

Observações:

---

**Avaliador 3:** __________________________  
**Status:** [ ] Aprovado  [ ] Ajustar

Observações:
