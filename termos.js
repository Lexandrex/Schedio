/*
 * Termos de Uso e Política de Privacidade — fonte única do texto e da versão.
 *
 * O cadastro só é aceito com `termsVersion` igual a `TERMOS.versao`, e é essa
 * versão que fica gravada em `users.termos_versao`. Ao mudar o texto, suba a
 * versão: quem aceitou a anterior continua com ela registrada, e é isso que
 * permite saber exatamente o que cada pessoa aceitou.
 *
 * O frontend não tem cópia do texto: ele lê `GET /api/termos`.
 */

const TERMOS = {
  versao: '1.0',
  vigenciaDesde: '2026-10-11',
  titulo: 'Termos de Uso e Política de Privacidade',
  secoes: [
    {
      titulo: '1. Aceitação e objeto',
      paragrafos: [
        'Estes Termos regulam o uso do Schedio Drasis ("Plataforma"), serviço web para criação, prototipagem e leitura de histórias interativas. Ao criar uma conta, você declara ter lido, compreendido e aceitado integralmente estes Termos e a Política de Privacidade neles contida.',
        'Se não concordar com qualquer cláusula, não crie a conta nem utilize a Plataforma.',
        'A Plataforma é desenvolvida como projeto acadêmico de Engenharia de Software e é oferecida gratuitamente.',
      ],
    },
    {
      titulo: '2. Cadastro e conta',
      paragrafos: [
        'Para se cadastrar você deve ter pelo menos 18 anos ou, se adolescente, contar com o consentimento e a supervisão de pai, mãe ou responsável legal, que passa a responder pelo uso da conta.',
        'Você se compromete a informar um e-mail válido e de sua titularidade, a manter a senha em sigilo e a não compartilhar o acesso. Toda atividade realizada com suas credenciais é de sua responsabilidade.',
        'Comunique imediatamente qualquer uso não autorizado da sua conta e utilize a recuperação de senha sempre que suspeitar de acesso indevido.',
      ],
    },
    {
      titulo: '3. Dados pessoais tratados',
      paragrafos: [
        'Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD), a Plataforma trata apenas os dados que você fornece e os necessários ao funcionamento do serviço: e-mail; senha, armazenada exclusivamente em forma de hash irreversível; nome de usuário, descrição e cor de perfil; projetos, textos, imagens e demais conteúdos que você criar ou enviar; e o registro da data e da versão destes Termos que você aceitou.',
        'Esses dados são usados para: criar e autenticar sua conta; confirmar seu e-mail e permitir a recuperação de senha; salvar e exibir seus projetos; apresentar seu perfil público de criador; e comprovar o seu aceite destes Termos.',
        'As bases legais são a execução do contrato formado por estes Termos (art. 7º, V, da LGPD), o cumprimento de obrigação legal (art. 7º, II) e o exercício regular de direitos (art. 7º, VI), inclusive para guarda do registro de aceite.',
        'A Plataforma não vende, aluga nem cede seus dados para fins publicitários.',
      ],
    },
    {
      titulo: '4. Compartilhamento e armazenamento',
      paragrafos: [
        'Para operar, a Plataforma utiliza prestadores de serviço que atuam como operadores de dados: serviço de envio de e-mails (códigos de verificação e recuperação de senha) e serviço de armazenamento de imagens em nuvem (Cloudinary). Esses prestadores podem processar dados fora do Brasil, observadas as salvaguardas da LGPD.',
        'Dados também poderão ser fornecidos a autoridades mediante ordem judicial ou requisição legal.',
        'São adotadas medidas técnicas razoáveis de segurança, como hash de senhas e acesso autenticado. Nenhum sistema, porém, é totalmente imune a falhas ou ataques, e a Plataforma não garante segurança absoluta.',
      ],
    },
    {
      titulo: '5. Seus direitos como titular',
      paragrafos: [
        'Você pode, a qualquer momento, confirmar a existência de tratamento, acessar e corrigir seus dados, solicitar informações sobre compartilhamento e pedir a eliminação dos seus dados, nos termos do art. 18 da LGPD.',
        'Os dados de perfil podem ser corrigidos na própria página da conta. A exclusão da conta, também disponível nessa página, apaga seu cadastro, seus projetos e as imagens enviadas.',
        'Registros cuja guarda seja exigida por lei ou necessária ao exercício de direitos poderão ser mantidos pelo prazo legal, mesmo após a exclusão da conta.',
      ],
    },
    {
      titulo: '6. Seu conteúdo e licença de uso',
      paragrafos: [
        'Você mantém a autoria e os direitos sobre o conteúdo que cria. Ao enviá-lo, concede à Plataforma licença gratuita, não exclusiva e revogável com a exclusão do conteúdo, apenas para armazená-lo, processá-lo e exibi-lo conforme as opções que você escolher.',
        'Projetos privados ficam visíveis somente a você. Ao publicar um projeto, você autoriza que título, capa, descrição, tags, seu nome de usuário e todo o conteúdo do projeto sejam exibidos a outros usuários da Plataforma.',
        'Você declara ser titular, ou ter autorização dos titulares, de todos os direitos sobre textos, imagens, marcas e demais materiais que enviar, inclusive direitos autorais (Lei nº 9.610/1998) e direitos de imagem de pessoas retratadas.',
      ],
    },
    {
      titulo: '7. Condutas proibidas',
      paragrafos: [
        'É proibido publicar ou enviar conteúdo que: seja ilegal; viole direitos autorais, marcas ou outros direitos de terceiros; contenha imagem de pessoa sem a autorização dela; envolva nudez ou ato sexual sem consentimento de quem aparece; envolva exploração ou sexualização de crianças e adolescentes; promova ódio, discriminação, violência, assédio ou ameaças; exponha dados pessoais de terceiros (como endereço, documentos, telefone ou dados sensíveis) sem base legal; ou contenha código malicioso, spam ou tentativa de fraude.',
        'Também é proibido tentar acessar contas ou dados de outras pessoas, contornar mecanismos de segurança, sobrecarregar intencionalmente o serviço ou coletar dados da Plataforma de forma automatizada.',
      ],
    },
    {
      titulo: '8. Responsabilidade pelo conteúdo publicado',
      paragrafos: [
        'A Plataforma atua como provedora de aplicação de internet e não exerce controle editorial prévio sobre o conteúdo criado pelos usuários. Nos termos do art. 19 da Lei nº 12.965/2014 (Marco Civil da Internet), a Plataforma não se responsabiliza pelo conteúdo publicado por usuários, inclusive pela publicação ou utilização de imagens indevidas, ofensivas, ilícitas ou que violem direitos de terceiros.',
        'O usuário que publicar ou enviar conteúdo é o único e exclusivo responsável por ele, respondendo civil e criminalmente por eventuais danos, e se compromete a manter a Plataforma e seus desenvolvedores isentos de qualquer reclamação, ação judicial, indenização ou despesa decorrente do seu conteúdo ou da violação destes Termos.',
        'A Plataforma não se responsabiliza por opiniões, informações ou dados contidos em projetos de outros usuários, nem pela veracidade ou adequação desse material.',
      ],
    },
    {
      titulo: '9. Propagação de dados e conteúdo',
      paragrafos: [
        'Conteúdo publicado fica acessível a outros usuários, que podem visualizá-lo, capturar telas ou reproduzi-lo por meios fora do controle da Plataforma. A Plataforma não se responsabiliza pela cópia, compartilhamento, divulgação ou propagação, por terceiros, de dados, imagens ou conteúdos que você tenha tornado públicos, nem pela permanência dessas cópias após a exclusão do original.',
        'Também não se responsabiliza por dados pessoais, próprios ou de terceiros, que você decidir incluir em seus projetos. Recomendamos que você não publique dados pessoais sensíveis, documentos, senhas ou informações de contato.',
        'Tornar um projeto privado ou excluí-lo remove-o da Plataforma, mas não alcança cópias já feitas por terceiros.',
      ],
    },
    {
      titulo: '10. Denúncias, remoção e suspensão',
      paragrafos: [
        'A Plataforma pode, a seu critério e sem aviso prévio, remover ou tornar privado qualquer conteúdo que viole estes Termos ou a lei, bem como suspender ou encerrar contas envolvidas, sem que isso gere direito a indenização.',
        'Conteúdo será removido mediante ordem judicial específica e, no caso de imagens de nudez ou atos sexuais divulgados sem consentimento, mediante notificação da pessoa retratada ou de seu representante legal (art. 21 do Marco Civil da Internet).',
        'A remoção de conteúdo pela Plataforma não transfere a ela a responsabilidade pelo que foi publicado.',
      ],
    },
    {
      titulo: '11. Disponibilidade do serviço',
      paragrafos: [
        'A Plataforma é fornecida "no estado em que se encontra", sem garantia de funcionamento ininterrupto, livre de erros ou adequado a uma finalidade específica. Funcionalidades podem ser alteradas, suspensas ou descontinuadas a qualquer momento.',
        'Não há garantia de preservação permanente dos projetos. Recomendamos manter cópias próprias do conteúdo importante. Na máxima extensão permitida pela lei, a Plataforma não responde por perda de dados, lucros cessantes ou danos indiretos decorrentes do uso ou da impossibilidade de uso do serviço.',
      ],
    },
    {
      titulo: '12. Propriedade intelectual da Plataforma',
      paragrafos: [
        'O nome Schedio Drasis, a identidade visual, o código, a interface e a biblioteca de ícones da Plataforma pertencem aos seus desenvolvedores. Os ícones podem ser usados dentro dos seus projetos na Plataforma, mas não podem ser extraídos para outros fins sem autorização.',
      ],
    },
    {
      titulo: '13. Encerramento da conta',
      paragrafos: [
        'Você pode excluir sua conta a qualquer momento pela página da conta, o que é definitivo e não pode ser desfeito. As obrigações e isenções destes Termos referentes ao período em que a conta esteve ativa continuam válidas após o encerramento.',
      ],
    },
    {
      titulo: '14. Alterações destes Termos',
      paragrafos: [
        'Estes Termos podem ser atualizados. Cada versão é identificada por um número, e a Plataforma registra a data e a versão aceitas por você. Alterações relevantes serão comunicadas e poderão exigir novo aceite para continuar usando o serviço.',
      ],
    },
    {
      titulo: '15. Lei aplicável e foro',
      paragrafos: [
        'Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do domicílio do usuário para dirimir eventuais controvérsias, conforme o Código de Defesa do Consumidor.',
        'Se alguma cláusula for considerada inválida, as demais continuam em pleno vigor.',
      ],
    },
  ],
};

module.exports = { TERMOS };
