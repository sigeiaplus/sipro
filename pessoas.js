/* SIPRO+ — Pessoas (cadastro central de Pessoa Física e Pessoa Jurídica)
   Base reutilizável: Usuários, Responsáveis, Profissionais, Alunos e outras entidades apontam para public.pessoas.
   Pessoa e Usuário são coisas diferentes: usuarios = conta de acesso (Supabase Auth); pessoas = cadastro da pessoa.
   Uma pessoa não precisa ter conta.

   O cadastro é global (a tabela não tem rede_id): CPF/CNPJ são únicos no sistema inteiro e cada rede se liga
   à pessoa por tabelas de vínculo (ex.: redes_responsaveis). Quem decide o acesso é o RLS (só administrador);
   o frontend só esconde a tela. Pessoa nunca é apagada: a situação é alterada para Inativa.

   Uso por outros módulos (carregar com SIPRO.router.carregarModulo('pessoas', 'pessoas.js')):
     SIPRO.pessoas.buscar(termo, { tipo, situacao, limite }) -> { dados } | { erro }
     SIPRO.pessoas.nomeDe(p) / SIPRO.pessoas.documentoDe(p) */
(() => {
  'use strict';
  const SIPRO = window.SIPRO;
  const esc = SIPRO.ui.escapar;
  const U = SIPRO.util;

  const TIPOS = [['fisica', 'Pessoa Física'], ['juridica', 'Pessoa Jurídica']];
  const SIGLA = { fisica: 'PF', juridica: 'PJ' };
  const SITUACOES = [['ativa', 'Ativa'], ['inativa', 'Inativa']];
  const SEXOS = [['M', 'Masculino'], ['F', 'Feminino']];
  const COLUNAS = 'id, tipo, cpf, cnpj, nome_completo, razao_social, nome_fantasia, nome_exibicao, data_nascimento, sexo, email, telefone, cep, logradouro, numero, complemento, bairro, municipio_codigo, situacao, created_at, updated_at';
  const COLUNAS_LISTA = 'id, tipo, cpf, cnpj, nome_exibicao, nome_fantasia, email, telefone, situacao';
  const POR_PAGINA = 20;

  const rotulo = (lista, v) => (lista.find((i) => i[0] === v) || [v, v])[1];
  const nomeDe = (p) => p.nome_exibicao || p.nome_completo || p.razao_social || '';
  const documentoDe = (p) => (p.tipo === 'juridica'
    ? (p.cnpj ? 'CNPJ ' + U.mascaraCnpj(p.cnpj) : '')
    : (p.cpf ? 'CPF ' + U.mascaraCpf(p.cpf) : ''));
  const dataBR = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  };
  const dataHoraBR = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function mensagemDeErro(err) {
    const msg = String((err && err.message) || '');
    if (err.code === '42703' || err.code === 'PGRST204' || err.code === 'PGRST200')
      return 'A estrutura de Pessoas no banco está desatualizada. Aplique o SQL de atualização e recarregue a página.';
    if (err.code === '23505') return /cnpj/i.test(msg) ? 'Já existe uma pessoa cadastrada com este CNPJ.' : 'Já existe uma pessoa cadastrada com este CPF.';
    if (err.code === '23514') {
      if (/cnpj/i.test(msg)) return 'CNPJ inválido.';
      if (/cpf/i.test(msg)) return 'CPF inválido.';
      if (/email/i.test(msg)) return 'E-mail inválido.';
      if (/telefone/i.test(msg)) return 'Telefone inválido. Informe DDD e número (10 ou 11 dígitos).';
      if (/cep/i.test(msg)) return 'CEP inválido. Informe os 8 dígitos.';
      if (/tipo_campos/i.test(msg)) return 'Os dados informados não correspondem ao tipo de pessoa selecionado.';
      return 'Algum dado está em formato inválido. Revise os campos.';
    }
    if (err.code === '23503') return 'Município inválido. Selecione novamente.';
    if (err.code === '23502') return 'Preencha os campos obrigatórios.';
    if (err.code === '42501') return 'Você não tem permissão para esta operação.';
    return 'Não foi possível concluir agora. Tente novamente em instantes.';
  }

  /* ---------- Consulta (também usada por outros módulos) ---------- */
  const limparBusca = (t) => String(t || '').replace(/[%,()*\\"_]/g, ' ').replace(/\s+/g, ' ').trim();

  function consultaPessoas(colunas, f, opcoes) {
    let c = SIPRO.db.from('pessoas').select(colunas, opcoes);
    if (f.tipo) c = c.eq('tipo', f.tipo);
    if (f.situacao) c = c.eq('situacao', f.situacao);
    const t = limparBusca(f.busca);
    if (t) {
      const d = U.soDigitos(t);
      const partes = [`nome_exibicao.ilike.%${t}%`, `nome_fantasia.ilike.%${t}%`];
      if (d.length >= 3) partes.push(`cpf.ilike.%${d}%`, `cnpj.ilike.%${d}%`);
      c = c.or(partes.join(','));
    }
    return c.order('nome_exibicao');
  }

  async function buscar(termo, { tipo = '', situacao = 'ativa', limite = 10 } = {}) {
    const { data, error } = await consultaPessoas(COLUNAS_LISTA, { busca: termo, tipo, situacao }).limit(limite);
    return error ? { erro: mensagemDeErro(error) } : { dados: data || [] };
  }

  /** Cadastro completo de uma pessoa pelo id (para Usuários, Responsáveis, Profissionais, Alunos). */
  async function obter(id) {
    const { data, error } = await SIPRO.db.from('pessoas').select(COLUNAS).eq('id', id).maybeSingle();
    return error ? { erro: mensagemDeErro(error) } : { dados: data || null };
  }

  /** Procura pelo CPF (tipo 'fisica') ou CNPJ (tipo 'juridica'). Serve para reaproveitar o cadastro em vez de duplicar. */
  async function porDocumento(tipo, documento) {
    const d = U.soDigitos(documento);
    if (!d) return { dados: null };
    const { data, error } = await SIPRO.db.from('pessoas').select(COLUNAS_LISTA).eq(tipo === 'juridica' ? 'cnpj' : 'cpf', d).maybeSingle();
    return error ? { erro: mensagemDeErro(error) } : { dados: data || null };
  }

  SIPRO.pessoas = { TIPOS, SITUACOES, COLUNAS, nomeDe, documentoDe, buscar, obter, porDocumento };

  /* ---------- Estado da tela ---------- */
  let pagina = null;         // elemento da tela atual; null quando a tela foi fechada
  let filtro = { busca: '', tipo: '', situacao: '' };
  let indicePagina = 0;
  let seq = 0;               // descarta respostas atrasadas da lista
  let timer = null;          // espera ao digitar na pesquisa
  let estados = [];
  let cacheMunicipios = {};
  let cepAtual = '';

  const q = (id) => pagina.querySelector('#' + id);
  const aviso = (texto, tipo) => (texto ? `<div class="aviso ${tipo}" role="${tipo === 'erro' ? 'alert' : 'status'}">${esc(texto)}</div>` : '');
  const opcoes = (lista, atual, vazio) =>
    (vazio ? `<option value="">${esc(vazio)}</option>` : '') +
    lista.map(([v, t]) => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const SEM_EFEITO = 'Nenhuma alteração foi salva. Verifique sua permissão e tente novamente.';

  /* ---------- Lista ---------- */
  function desenharLista(msg, tipoMsg) {
    pagina.innerHTML = `
      <div class="pagina__cab">
        <div><h2>Pessoas</h2><p>Cadastro central de pessoas físicas e jurídicas, usado por todo o sistema.</p></div>
        <button type="button" class="btn btn--sec" id="pe-nova">Nova pessoa</button>
      </div>
      ${aviso(msg, tipoMsg)}
      <form class="filtros" id="pe-filtros" role="search" novalidate>
        <div class="field filtros__busca"><label for="pe-busca">Pesquisar</label>
          <input id="pe-busca" type="search" maxlength="100" autocomplete="off" placeholder="Nome, CPF ou CNPJ" value="${esc(filtro.busca)}"></div>
        <div class="field"><label for="pe-ftipo">Tipo</label>
          <select id="pe-ftipo">${opcoes(TIPOS, filtro.tipo, 'Todos')}</select></div>
        <div class="field"><label for="pe-fsit">Situação</label>
          <select id="pe-fsit">${opcoes(SITUACOES, filtro.situacao, 'Todas')}</select></div>
      </form>
      <div id="pe-resultado" aria-live="polite"></div>`;

    q('pe-nova').addEventListener('click', () => desenharForm(null));
    const refiltrar = () => { indicePagina = 0; carregarLista(false); };
    q('pe-busca').addEventListener('input', (e) => {
      filtro.busca = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(refiltrar, 350);
    });
    q('pe-ftipo').addEventListener('change', (e) => { filtro.tipo = e.target.value; refiltrar(); });
    q('pe-fsit').addEventListener('change', (e) => { filtro.situacao = e.target.value; refiltrar(); });
    q('pe-filtros').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); refiltrar(); });
    carregarLista(true);
  }

  async function carregarLista(inicial) {
    const pg = pagina;
    const minha = ++seq;
    const res = q('pe-resultado');
    if (inicial) res.innerHTML = SIPRO.ui.carregando('Carregando pessoas...');
    else res.setAttribute('aria-busy', 'true');

    const de = indicePagina * POR_PAGINA;
    const { data, error, count } = await consultaPessoas(COLUNAS_LISTA, filtro, { count: 'exact' }).range(de, de + POR_PAGINA - 1);
    if (pagina !== pg || minha !== seq) return;
    res.removeAttribute('aria-busy');

    if (error) {
      if (error.code === 'PGRST103' && indicePagina > 0) { indicePagina = 0; return carregarLista(false); }
      res.innerHTML = aviso(error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST200'
        ? mensagemDeErro(error) : 'Não foi possível carregar as pessoas.', 'erro') +
        '<div><button type="button" class="btn btn--sec" id="pe-retentar">Tentar novamente</button></div>';
      q('pe-retentar').addEventListener('click', () => carregarLista(true));
      return;
    }

    const total = count || 0;
    if (!data || !data.length) {
      const filtrando = !!(limparBusca(filtro.busca) || filtro.tipo || filtro.situacao);
      res.innerHTML = filtrando
        ? '<section class="bloco-vazio"><h3>Nenhuma pessoa encontrada</h3><p>Nenhum cadastro corresponde à pesquisa ou aos filtros.</p>' +
          '<div class="vazio__acao"><button type="button" class="btn btn--sec" id="pe-limpar">Limpar filtros</button></div></section>'
        : '<section class="bloco-vazio"><h3>Nenhuma pessoa cadastrada</h3><p>Use "Nova pessoa" para cadastrar a primeira pessoa física ou jurídica.</p></section>';
      const limpar = res.querySelector('#pe-limpar');
      if (limpar) limpar.addEventListener('click', () => {
        filtro = { busca: '', tipo: '', situacao: '' };
        indicePagina = 0;
        desenharLista();
      });
      return;
    }

    const itens = data.map((p) => {
      const meta = [documentoDe(p), p.tipo === 'juridica' ? p.nome_fantasia : '', p.email, p.telefone ? U.mascaraTelefone(p.telefone) : '']
        .filter(Boolean).join(' · ');
      return `
        <li>
          <a class="rede-item rede-item--link" href="#/pessoas" data-abrir="${esc(p.id)}" aria-label="Abrir ${esc(nomeDe(p))}">
            <div>
              <p class="rede-item__nome">${esc(nomeDe(p))}<span class="badge badge--tipo">${esc(SIGLA[p.tipo] || '')}</span></p>
              <p class="rede-item__meta">${esc(meta || 'Sem dados de contato')}</p>
            </div>
            <div class="rede-item__acoes"><span class="badge badge--${esc(p.situacao)}">${esc(rotulo(SITUACOES, p.situacao))}</span></div>
          </a>
        </li>`;
    }).join('');

    const ate = de + data.length;
    res.innerHTML = `
      <ul class="rede-lista">${itens}</ul>
      <nav class="paginacao" aria-label="Paginação">
        <span>${de + 1}–${ate} de ${total}</span>
        <div class="paginacao__botoes">
          <button type="button" class="btn btn--neutro" id="pe-anterior"${indicePagina === 0 ? ' disabled' : ''}>Anterior</button>
          <button type="button" class="btn btn--neutro" id="pe-proxima"${ate >= total ? ' disabled' : ''}>Próxima</button>
        </div>
      </nav>`;

    res.querySelectorAll('[data-abrir]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); abrirPessoa(a.dataset.abrir); }));
    res.querySelector('#pe-anterior').addEventListener('click', () => { indicePagina = Math.max(0, indicePagina - 1); carregarLista(false); });
    res.querySelector('#pe-proxima').addEventListener('click', () => { indicePagina += 1; carregarLista(false); });
  }

  /* ---------- Visualização ---------- */
  async function abrirPessoa(id, msg, tipoMsg) {
    const pg = pagina;
    pagina.innerHTML = SIPRO.ui.carregando('Carregando cadastro...');
    const { data, error } = await SIPRO.db.from('pessoas').select(COLUNAS).eq('id', id).maybeSingle();
    if (pagina !== pg) return;
    if (error) {
      pagina.innerHTML = aviso(mensagemDeErro(error), 'erro') +
        '<div><button type="button" class="btn btn--sec" id="pe-voltar-erro">Voltar para a lista</button></div>';
      q('pe-voltar-erro').addEventListener('click', () => desenharLista());
      return;
    }
    if (!data) {
      pagina.innerHTML = '<section class="bloco-vazio"><h3>Pessoa não encontrada</h3><p>O cadastro não existe ou você não tem acesso a ele.</p>' +
        '<div class="vazio__acao"><button type="button" class="btn btn--sec" id="pe-voltar-erro">Voltar para a lista</button></div></section>';
      q('pe-voltar-erro').addEventListener('click', () => desenharLista());
      return;
    }
    return mostrarPessoa(data, msg, tipoMsg);
  }

  async function dadosAuxiliares(p) {
    let municipio = null;
    let vinculos = null;
    try {
      if (p.municipio_codigo) {
        const r = await SIPRO.db.from('municipios').select('nome, uf').eq('codigo_ibge', p.municipio_codigo).maybeSingle();
        if (!r.error && r.data) municipio = r.data;
      }
    } catch (_) { /* o endereço aparece sem o nome do município */ }
    try {
      const r = await SIPRO.db.from('redes_responsaveis').select('*', { count: 'exact', head: true }).eq('pessoa_id', p.id);
      if (!r.error) vinculos = r.count;
    } catch (_) { /* vínculos desconhecidos: não afirma nada */ }
    return { municipio, vinculos };
  }

  function enderecoDe(p, municipio) {
    const rua = [p.logradouro, p.numero ? 'nº ' + p.numero : '', p.complemento].filter(Boolean).join(', ');
    const cidade = municipio ? `${municipio.nome}/${municipio.uf}` : '';
    return [rua, p.bairro, cidade, p.cep ? 'CEP ' + U.mascaraCep(p.cep) : ''].filter(Boolean).join(' · ');
  }

  async function mostrarPessoa(p, msg, tipoMsg) {
    const pg = pagina;
    const { municipio, vinculos } = await dadosAuxiliares(p);
    if (pagina !== pg) return;

    const fis = p.tipo === 'fisica';
    const linhas = [
      ['Tipo', rotulo(TIPOS, p.tipo)],
      ...(fis
        ? [['CPF', p.cpf ? U.mascaraCpf(p.cpf) : ''], ['Nome completo', p.nome_completo],
           ['Data de nascimento', dataBR(p.data_nascimento)], ['Sexo', p.sexo ? rotulo(SEXOS, p.sexo) : '']]
        : [['CNPJ', p.cnpj ? U.mascaraCnpj(p.cnpj) : ''], ['Razão social', p.razao_social], ['Nome fantasia', p.nome_fantasia]]),
      [fis ? 'E-mail' : 'E-mail institucional', p.email],
      [fis ? 'Telefone' : 'Telefone institucional', p.telefone ? U.mascaraTelefone(p.telefone) : ''],
      ['Endereço', enderecoDe(p, municipio), true],
      ['Situação cadastral', rotulo(SITUACOES, p.situacao)],
      ['Cadastrada em', dataHoraBR(p.created_at)],
      ['Última alteração', dataHoraBR(p.updated_at)],
    ];
    const ativa = p.situacao === 'ativa';
    const nota = vinculos > 0
      ? `Esta pessoa está vinculada a ${vinculos} cadastro${vinculos > 1 ? 's' : ''} em redes. `
      : '';

    pagina.innerHTML = `
      <a class="voltar" href="#/pessoas" id="pe-voltar">← Todas as pessoas</a>
      <div class="pagina__cab">
        <div><h2>${esc(nomeDe(p))}</h2><p>${esc(rotulo(TIPOS, p.tipo))}${documentoDe(p) ? ' · ' + esc(documentoDe(p)) : ''}</p></div>
        <span class="badge badge--${esc(p.situacao)}">${esc(rotulo(SITUACOES, p.situacao))}</span>
      </div>
      ${aviso(msg, tipoMsg)}
      <section class="painel">
        <dl class="dados">${linhas.map(([k, v, cheio]) =>
          `<div class="dados__item${cheio ? ' dados__item--cheio' : ''}"><dt>${esc(k)}</dt><dd>${v ? esc(v) : '<span class="dados__vazio">Não informado</span>'}</dd></div>`).join('')}</dl>
        <div class="form-acoes">
          <button type="button" class="btn btn--sec" id="pe-editar">Editar dados</button>
          <button type="button" class="btn btn--neutro" id="pe-situacao">${ativa ? 'Inativar' : 'Reativar'}</button>
        </div>
      </section>
      <p class="dica">${esc(nota)}Cadastros de pessoas não são excluídos: para deixar de usar um cadastro, altere a situação para Inativa. Vínculos e histórico ficam preservados.</p>`;

    q('pe-voltar').addEventListener('click', (e) => { e.preventDefault(); desenharLista(); });
    q('pe-editar').addEventListener('click', () => desenharForm(p));
    q('pe-situacao').addEventListener('click', () => alterarSituacao(p));
  }

  async function alterarSituacao(p) {
    const pg = pagina;
    const nova = p.situacao === 'ativa' ? 'inativa' : 'ativa';
    if (nova === 'inativa' && !window.confirm(`Inativar "${nomeDe(p)}"? O cadastro, os vínculos e o histórico são preservados.`)) return;
    q('pe-situacao').disabled = true;
    q('pe-editar').disabled = true;
    const { data, error } = await SIPRO.db.from('pessoas').update({ situacao: nova }).eq('id', p.id).select(COLUNAS);
    if (pagina !== pg) return;
    if (error || !data || !data.length) return mostrarPessoa(p, error ? mensagemDeErro(error) : SEM_EFEITO, 'erro');
    return mostrarPessoa(data[0], nova === 'ativa' ? 'Cadastro reativado.' : 'Cadastro inativado.', 'info');
  }

  /* ---------- Formulário (cadastro e edição) ---------- */
  const campo = (k, rot, html, cheio) =>
    `<div class="field${cheio ? ' field--cheio' : ''}" id="fp-${k}"><label for="pe-${k}">${rot}</label>${html}<p class="field__erro" id="ep-${k}"></p></div>`;
  const entrada = (k, valor, extra) => `<input id="pe-${k}" autocomplete="off" value="${esc(valor || '')}" ${extra || ''}>`;
  const CHAVES_ERRO = ['cpf', 'cnpj', 'nome', 'razao', 'nasc', 'sexo', 'email', 'tel', 'cep', 'uf', 'mun', 'situacao'];

  async function desenharForm(p) {
    const pg = pagina;
    if (!estados.length) {
      pagina.innerHTML = SIPRO.ui.carregando('Preparando formulário...');
      const { data, error } = await SIPRO.db.from('estados').select('uf, nome').order('nome');
      if (pagina !== pg) return;
      if (error) {
        pagina.innerHTML = aviso('Não foi possível carregar os dados do formulário.', 'erro') +
          '<div><button type="button" class="btn btn--sec" id="pe-retentar-form">Tentar novamente</button></div>';
        q('pe-retentar-form').addEventListener('click', () => desenharForm(p));
        return;
      }
      estados = data || [];
    }

    const r = p || {};
    const tipoInicial = p ? p.tipo : 'fisica';
    const ufAtual = r.municipio_codigo ? await ufDoMunicipio(r.municipio_codigo) : '';
    if (pagina !== pg) return;
    const ufs = estados.map((e) => `<option value="${esc(e.uf)}"${e.uf === ufAtual ? ' selected' : ''}>${esc(e.nome)}</option>`).join('');

    pagina.innerHTML = `
      <div class="pagina__cab">
        <div><h2>${p ? 'Editar pessoa' : 'Nova pessoa'}</h2><p>Campos com * são obrigatórios.</p></div>
      </div>
      <form class="painel" id="pe-form" novalidate>
        <div id="pe-aviso"></div>
        <fieldset class="seg"${p ? ' disabled' : ''}>
          <legend>Tipo de pessoa *</legend>
          ${TIPOS.map(([v, t]) => `<label class="seg__op"><input type="radio" name="pe-tipo" value="${v}"${v === tipoInicial ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}
        </fieldset>
        ${p ? '<p class="dica form-dica">O tipo não pode ser alterado depois do cadastro.</p>' : ''}

        <div class="form-grid" id="pe-g-fisica"${tipoInicial === 'fisica' ? '' : ' hidden'}>
          ${campo('cpf', 'CPF *', entrada('cpf', r.cpf ? U.mascaraCpf(r.cpf) : '', 'inputmode="numeric" placeholder="000.000.000-00"'))}
          ${campo('nasc', 'Data de nascimento', `<input id="pe-nasc" type="date" min="1900-01-01" max="${hojeISO()}" value="${esc(r.data_nascimento || '')}">`)}
          ${campo('nome', 'Nome completo *', entrada('nome', r.nome_completo, 'maxlength="200"'), true)}
          ${campo('sexo', 'Sexo', `<select id="pe-sexo">${opcoes(SEXOS, r.sexo, 'Não informado')}</select>`)}
        </div>
        <div class="form-grid" id="pe-g-juridica"${tipoInicial === 'juridica' ? '' : ' hidden'}>
          ${campo('cnpj', 'CNPJ *', entrada('cnpj', r.cnpj ? U.mascaraCnpj(r.cnpj) : '', 'inputmode="numeric" placeholder="00.000.000/0000-00"'), true)}
          ${campo('razao', 'Razão social *', entrada('razao', r.razao_social, 'maxlength="200"'), true)}
          ${campo('fantasia', 'Nome fantasia', entrada('fantasia', r.nome_fantasia, 'maxlength="200"'), true)}
        </div>

        <div class="form-grid">
          ${campo('email', '<span id="pe-rot-email">E-mail</span>', `<input id="pe-email" type="email" autocomplete="off" maxlength="200" value="${esc(r.email || '')}">`)}
          ${campo('tel', '<span id="pe-rot-tel">Telefone</span>', entrada('tel', r.telefone ? U.mascaraTelefone(r.telefone) : '', 'inputmode="tel" placeholder="(00) 00000-0000"'))}
          ${p ? '' : campo('situacao', 'Situação cadastral *', `<select id="pe-situacao">${opcoes(SITUACOES, 'ativa')}</select>`)}
        </div>

        <h4 class="form-secao">Endereço</h4>
        <div class="form-grid">
          ${campo('cep', 'CEP', entrada('cep', r.cep ? U.mascaraCep(r.cep) : '', 'inputmode="numeric" placeholder="00000-000"') + '<p class="field__info" id="ci-cep" role="status" aria-live="polite"></p>')}
          ${campo('logradouro', 'Logradouro', entrada('logradouro', r.logradouro, 'maxlength="200"'), true)}
          ${campo('numero', 'Número', entrada('numero', r.numero, 'maxlength="20"'))}
          ${campo('complemento', 'Complemento', entrada('complemento', r.complemento, 'maxlength="100"'))}
          ${campo('bairro', 'Bairro', entrada('bairro', r.bairro, 'maxlength="100"'), true)}
          ${campo('uf', 'Estado', `<select id="pe-uf"><option value="">Selecione</option>${ufs}</select>`)}
          ${campo('mun', 'Município', '<select id="pe-mun" disabled></select>')}
        </div>

        <div class="form-acoes">
          <button type="submit" class="btn" id="pe-salvar">Salvar</button>
          <button type="button" class="btn btn--neutro" id="pe-cancelar">Cancelar</button>
        </div>
      </form>`;

    const tipoSel = () => (p ? p.tipo : (pagina.querySelector('input[name="pe-tipo"]:checked') || {}).value);
    const ajustarTipo = () => {
      const fis = tipoSel() === 'fisica';
      q('pe-g-fisica').hidden = !fis;
      q('pe-g-juridica').hidden = fis;
      q('pe-rot-email').textContent = fis ? 'E-mail' : 'E-mail institucional';
      q('pe-rot-tel').textContent = fis ? 'Telefone' : 'Telefone institucional';
    };
    ajustarTipo();

    pagina.querySelectorAll('input[name="pe-tipo"]').forEach((i) => i.addEventListener('change', () => {
      ajustarTipo();
      mostrarErros({});
      q(tipoSel() === 'fisica' ? 'pe-cpf' : 'pe-cnpj').focus();
    }));
    q('pe-cpf').addEventListener('input', (e) => { e.target.value = U.mascaraCpf(e.target.value); });
    q('pe-cnpj').addEventListener('input', (e) => { e.target.value = U.mascaraCnpj(e.target.value); });
    q('pe-tel').addEventListener('input', (e) => { e.target.value = U.mascaraTelefone(e.target.value); });
    q('pe-cep').addEventListener('input', (e) => { e.target.value = U.mascaraCep(e.target.value); buscarCep(); });
    q('pe-uf').addEventListener('change', (e) => popularMunicipios(e.target.value, null));
    q('pe-cancelar').addEventListener('click', () => (p ? mostrarPessoa(p) : desenharLista()));
    q('pe-form').addEventListener('submit', (e) => { e.preventDefault(); salvar(p, tipoSel()); });

    cepAtual = '';
    popularMunicipios(ufAtual, r.municipio_codigo);
    q(tipoInicial === 'fisica' ? 'pe-cpf' : 'pe-cnpj').focus();
  }

  async function ufDoMunicipio(codigo) {
    try {
      const r = await SIPRO.db.from('municipios').select('uf').eq('codigo_ibge', codigo).maybeSingle();
      return !r.error && r.data ? r.data.uf : '';
    } catch (_) { return ''; }
  }

  async function popularMunicipios(uf, selecionado) {
    const pg = pagina;
    const sel = q('pe-mun');
    if (!uf) { sel.innerHTML = '<option value="">Selecione o estado primeiro</option>'; sel.disabled = true; return; }
    sel.disabled = true;
    sel.innerHTML = '<option value="">Carregando...</option>';
    if (!cacheMunicipios[uf]) {
      const { data, error } = await SIPRO.db.from('municipios').select('codigo_ibge, nome').eq('uf', uf).order('nome');
      if (pagina !== pg || !q('pe-uf') || q('pe-uf').value !== uf) return;
      if (error) { sel.innerHTML = '<option value="">Não foi possível carregar</option>'; return; }
      cacheMunicipios[uf] = data || [];
    }
    if (!q('pe-uf') || q('pe-uf').value !== uf) return;
    sel.innerHTML = '<option value="">Selecione o município</option>' + cacheMunicipios[uf].map((m) =>
      `<option value="${m.codigo_ibge}"${Number(selecionado) === m.codigo_ibge ? ' selected' : ''}>${esc(m.nome)}</option>`).join('');
    sel.disabled = false;
  }

  /** Busca o endereço pelo CEP (ViaCEP) ao digitar o 8º dígito. Se falhar, o preenchimento manual continua. */
  async function buscarCep() {
    const pg = pagina;
    const cep = U.soDigitos(q('pe-cep').value);
    const info = q('ci-cep');
    cepAtual = cep;
    if (cep.length !== 8) { info.textContent = ''; return; }
    info.textContent = 'Buscando endereço...';
    const aindaValido = () => pagina === pg && q('ci-cep') && cepAtual === cep;

    let dados;
    try {
      const ctl = new AbortController();
      const limite = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctl.signal });
      clearTimeout(limite);
      if (!r.ok) throw new Error('http');
      dados = await r.json();
    } catch (_) {
      if (aindaValido()) info.textContent = 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.';
      return;
    }
    if (!aindaValido()) return;
    if (!dados || dados.erro) { info.textContent = 'CEP não encontrado. Confira o número ou preencha o endereço manualmente.'; return; }

    if (dados.logradouro) q('pe-logradouro').value = String(dados.logradouro).slice(0, 200);
    if (dados.bairro) q('pe-bairro').value = String(dados.bairro).slice(0, 100);
    const uf = String(dados.uf || '');
    const ibge = Number(dados.ibge);
    if (!estados.some((e) => e.uf === uf)) { info.textContent = 'Endereço preenchido em parte. Selecione o estado e o município.'; return; }
    q('pe-uf').value = uf;
    await popularMunicipios(uf, ibge);
    if (!aindaValido()) return;
    ['uf', 'mun'].forEach((k) => { q('fp-' + k).classList.remove('erro'); q('ep-' + k).textContent = ''; });
    info.textContent = q('pe-mun').value === String(ibge)
      ? 'Endereço preenchido. Confira os dados e informe o número.'
      : 'Endereço preenchido, mas o município não foi localizado. Selecione-o manualmente.';
  }

  function mostrarErros(erros) {
    CHAVES_ERRO.forEach((k) => {
      if (!q('fp-' + k)) return;
      q('fp-' + k).classList.toggle('erro', !!erros[k]);
      q('ep-' + k).textContent = erros[k] || '';
    });
    const primeiro = CHAVES_ERRO.find((k) => erros[k]);
    if (primeiro) q('pe-' + primeiro).focus();
  }

  function validar(v) {
    const erros = {};
    const fis = v.tipo === 'fisica';
    const cpf = U.soDigitos(v.cpf);
    const cnpj = U.soDigitos(v.cnpj);
    const tel = U.soDigitos(v.telefone);
    const cep = U.soDigitos(v.cep);
    const email = v.email.trim().toLowerCase();

    if (fis) {
      if (!cpf) erros.cpf = 'Informe o CPF.';
      else if (!U.cpfValido(cpf)) erros.cpf = 'CPF inválido.';
      if (!v.nome.trim()) erros.nome = 'Informe o nome completo.';
      // Com o campo personalizado, data digitada incompleta/inexistente deixa o valor real vazio: não pode ser salva como "sem data".
      if (v.nascTexto && !v.nasc) erros.nasc = 'Data de nascimento inválida ou incompleta. Use dd/mm/aaaa.';
      else if (v.nasc && (v.nasc > hojeISO() || v.nasc < '1900-01-01')) erros.nasc = 'Data de nascimento inválida.';
      if (v.sexo && !SEXOS.some((s) => s[0] === v.sexo)) erros.sexo = 'Selecione uma opção válida.';
    } else {
      if (!cnpj) erros.cnpj = 'Informe o CNPJ.';
      else if (!U.cnpjValido(cnpj)) erros.cnpj = 'CNPJ inválido.';
      if (!v.razao.trim()) erros.razao = 'Informe a razão social.';
    }
    if (email && !U.emailValido(email)) erros.email = 'E-mail inválido.';
    if (tel && !/^\d{10,11}$/.test(tel)) erros.tel = 'Informe o telefone com DDD (10 ou 11 dígitos).';
    if (cep && cep.length !== 8) erros.cep = 'CEP inválido. Informe os 8 dígitos.';
    if (v.uf && !v.municipio) erros.mun = 'Selecione o município.';
    if (v.situacao !== undefined && !SITUACOES.some((s) => s[0] === v.situacao)) erros.situacao = 'Selecione a situação.';

    const texto = (t) => t.trim() || null;
    const comum = {
      email: email || null,
      telefone: tel || null,
      cep: cep || null,
      logradouro: texto(v.logradouro),
      numero: texto(v.numero),
      complemento: texto(v.complemento),
      bairro: texto(v.bairro),
      municipio_codigo: v.municipio ? Number(v.municipio) : null,
    };
    const dados = fis
      ? { cpf, cnpj: null, nome_completo: v.nome.trim(), razao_social: null, nome_fantasia: null,
          data_nascimento: v.nasc || null, sexo: v.sexo || null, ...comum }
      : { cpf: null, cnpj, nome_completo: null, razao_social: v.razao.trim(), nome_fantasia: texto(v.fantasia),
          data_nascimento: null, sexo: null, ...comum };
    return { erros, dados };
  }

  async function salvar(p, tipo) {
    const pg = pagina;
    const campoNasc = q('fp-nasc').querySelector('.cx__texto');
    const { erros, dados } = validar({
      tipo,
      nascTexto: campoNasc ? campoNasc.value : '',
      cpf: q('pe-cpf').value, cnpj: q('pe-cnpj').value,
      nome: q('pe-nome').value, razao: q('pe-razao').value, fantasia: q('pe-fantasia').value,
      nasc: q('pe-nasc').value, sexo: q('pe-sexo').value,
      email: q('pe-email').value, telefone: q('pe-tel').value,
      cep: q('pe-cep').value, logradouro: q('pe-logradouro').value, numero: q('pe-numero').value,
      complemento: q('pe-complemento').value, bairro: q('pe-bairro').value,
      uf: q('pe-uf').value, municipio: q('pe-mun').value,
      situacao: p ? undefined : q('pe-situacao').value,
    });
    q('pe-aviso').innerHTML = '';
    mostrarErros(erros);
    if (Object.keys(erros).length) return;

    const botao = q('pe-salvar');
    botao.disabled = true;
    const falhar = (texto) => {
      if (pagina !== pg || !q('pe-aviso')) return;
      q('pe-aviso').innerHTML = aviso(texto, 'erro');
      botao.disabled = false;
    };

    // Duplicidade: confere antes de gravar (mensagem clara e atalho para o cadastro existente).
    // A garantia final é o índice único do banco; este passo só evita a ida e volta com erro.
    const colDoc = tipo === 'juridica' ? 'cnpj' : 'cpf';
    const dup = await SIPRO.db.from('pessoas').select('id').eq(colDoc, dados[colDoc]).maybeSingle();
    if (pagina !== pg) return;
    if (!dup.error && dup.data && (!p || dup.data.id !== p.id)) {
      const err = { code: '23505', message: colDoc };
      falhar(mensagemDeErro(err));
      await oferecerExistente(err, dados, p, pg);
      return;
    }

    const consulta = p
      ? SIPRO.db.from('pessoas').update(dados).eq('id', p.id)           // tipo e situação não mudam aqui
      : SIPRO.db.from('pessoas').insert({ ...dados, tipo, situacao: q('pe-situacao').value });
    const { data, error } = await consulta.select(COLUNAS);
    if (pagina !== pg) return;

    if (error) {
      falhar(mensagemDeErro(error));
      if (error.code === '23505') await oferecerExistente(error, dados, p, pg);
      return;
    }
    if (!data || !data.length) return falhar(SEM_EFEITO);
    return mostrarPessoa(data[0], p ? 'Dados atualizados.' : 'Pessoa cadastrada.', 'info');
  }

  /** CPF/CNPJ duplicado: mostra um atalho para abrir o cadastro que já existe. */
  async function oferecerExistente(error, dados, p, pg) {
    const col = /cnpj/i.test(String(error.message || '')) ? 'cnpj' : 'cpf';
    const r = await SIPRO.db.from('pessoas').select('id').eq(col, dados[col]).maybeSingle();
    if (pagina !== pg || !q('pe-aviso') || r.error || !r.data || (p && r.data.id === p.id)) return;
    q('pe-aviso').insertAdjacentHTML('beforeend', '<div class="aviso__acao"><button type="button" class="btn btn--sec" id="pe-abrir-existente">Abrir cadastro existente</button></div>');
    q('pe-abrir-existente').addEventListener('click', () => abrirPessoa(r.data.id));
  }

  /* ---------- Módulo ---------- */
  function limpar() {
    clearTimeout(timer);
    seq++;
    pagina = null;
    estados = [];
    cacheMunicipios = {};
    cepAtual = '';
  }

  SIPRO.modulos.pessoas = {
    async render(el) {
      limpar();
      filtro = { busca: '', tipo: '', situacao: '' };
      indicePagina = 0;
      el.innerHTML = `<div class="pagina" id="pe-pagina">${SIPRO.ui.carregando()}</div>`;
      const pg = (pagina = el.querySelector('#pe-pagina'));
      try {
        const { data, error } = await SIPRO.db.rpc('eh_admin');
        if (pagina !== pg) return;
        if (error) { pg.innerHTML = aviso('Não foi possível verificar seu acesso. Recarregue a página.', 'erro'); return; }
        if (data !== true) {
          pg.innerHTML = '<section class="bloco-vazio"><h3>Acesso restrito</h3><p>Esta área é destinada aos administradores do sistema.</p></section>';
          return;
        }
        desenharLista();
      } catch (_) {
        if (pagina === pg) pg.innerHTML = aviso('Não foi possível abrir esta tela agora.', 'erro');
      }
    },
    destruir() { limpar(); },
  };
})();
