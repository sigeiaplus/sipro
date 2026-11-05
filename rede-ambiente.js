/* SIREDE+ — Ambiente da rede (#/rede/<id da rede>/<seção>)
   A rede é o centro do ambiente administrativo: este módulo identifica a rede pelo ID no banco,
   mostra o cabeçalho e a navegação interna e abre cada seção.
   Todas as consultas das seções são filtradas pelo ID da rede; quem decide o acesso é o RLS do Supabase.
   Seções ainda não implementadas mostram apenas "Em desenvolvimento" (sem dados inventados). */
(() => {
  'use strict';
  const SIREDE = window.SIREDE;
  const esc = SIREDE.ui.escapar;

  /* Seções: com `modulo` + `arquivo` = módulo próprio; sem eles = seção interna deste arquivo. */
  const SECOES = [
    { id: 'visao-geral', rotulo: 'Visão Geral', interna: 'visao' },
    { id: 'dados', rotulo: 'Dados da Rede', modulo: 'rede-dados', arquivo: 'rede.js' },
    { id: 'area', rotulo: 'Área de Atuação', modulo: 'rede-area', arquivo: 'rede-area.js' },
    { id: 'centrais', rotulo: 'Centrais Administrativas', modulo: 'rede-centrais', arquivo: 'rede-centrais.js' },
    { id: 'escolas', rotulo: 'Escolas' },
    { id: 'alunos', rotulo: 'Alunos' },
    { id: 'profissionais', rotulo: 'Profissionais' },
    { id: 'responsaveis', rotulo: 'Responsáveis' },
    { id: 'historico', rotulo: 'Histórico' },
    { id: 'configuracoes', rotulo: 'Configurações', modulo: 'rede-config', arquivo: 'rede.js' },
  ];

  /* Indicadores da Visão Geral. Sem `tabela`, o dado ainda não existe no sistema:
     mostra "Ainda não disponível" (nunca zero ou número inventado). */
  const INDICADORES = [
    { id: 'escolas', rotulo: 'Escolas', secao: 'escolas' },
    { id: 'alunos', rotulo: 'Alunos', secao: 'alunos' },
    { id: 'profissionais', rotulo: 'Profissionais', secao: 'profissionais' },
    { id: 'centrais', rotulo: 'Centrais administrativas', secao: 'centrais', tabela: 'redes_centrais' },
    { id: 'areas', rotulo: 'Áreas de atuação', secao: 'area', tabela: 'redes_areas_atuacao' },
    { id: 'responsaveis', rotulo: 'Responsáveis', secao: 'responsaveis', tabela: 'redes_responsaveis' },
  ];

  let pagina = null;     // raiz do ambiente; null quando a tela foi fechada
  let rede = null;       // rede aberta (linha de public.redes)
  let modSecao = null;   // módulo da seção aberta
  let seqSecao = 0;
  let secaoAtual = null;

  const hrefSecao = (secao) => `#/rede/${rede.id}/${secao}`;
  const q = (id) => pagina.querySelector('#' + id);
  const aviso = (texto, tipo) => `<div class="aviso ${tipo}" role="${tipo === 'erro' ? 'alert' : 'status'}">${esc(texto)}</div>`;

  /* Contexto entregue às seções. `rede` sempre devolve a rede atual. */
  const amb = {
    get rede() { return rede; },
    aoSalvar(nova) { // seção salvou alteração na rede: atualiza o cabeçalho
      rede = { ...rede, ...nova };
      SIREDE.estado.redeId = rede.id;
      if (pagina) desenharCabecalho();
    },
  };

  /* ---------- Seções internas ---------- */
  async function contar(tabela, redeId) {
    const { count, error } = await SIREDE.db.from(tabela).select('*', { count: 'exact', head: true }).eq('rede_id', redeId);
    return error ? null : count;
  }

  const secaoVisaoGeral = {
    render(el) {
      const redeId = rede.id;
      el.innerHTML = `<div class="indicadores">${INDICADORES.map((i) => `
        <a class="indicador" id="ind-${i.id}" href="${esc(hrefSecao(i.secao))}">
          <span class="indicador__rotulo">${esc(i.rotulo)}</span>
          <span class="indicador__valor indicador__valor--vazio">${i.tabela ? '…' : '—'}</span>
          <span class="indicador__nota">${i.tabela ? 'Carregando' : 'Ainda não disponível'}</span>
        </a>`).join('')}</div>`;

      const comDados = INDICADORES.filter((i) => i.tabela);
      Promise.all(comDados.map((i) => contar(i.tabela, redeId))).then((totais) => {
        if (!el.isConnected || !rede || rede.id !== redeId) return;
        comDados.forEach((i, n) => {
          const card = el.querySelector('#ind-' + i.id);
          if (!card) return;
          const total = totais[n];
          const valor = card.querySelector('.indicador__valor');
          const nota = card.querySelector('.indicador__nota');
          if (total === null) { valor.textContent = '—'; nota.textContent = 'Não foi possível carregar'; return; }
          valor.textContent = String(total);
          valor.classList.toggle('indicador__valor--vazio', total === 0);
          nota.textContent = total === 0 ? 'Nenhum registro cadastrado' : 'Ver detalhes';
        });
      });
    },
  };

  const secaoEmDesenvolvimento = (rotulo) => ({
    render(el) {
      el.innerHTML = `<section class="bloco-vazio"><h3>${esc(rotulo)}</h3><p>Em desenvolvimento. Esta seção ainda não foi implementada.</p></section>`;
    },
  });

  function moduloDaSecao(def) {
    if (def.modulo) return SIREDE.router.carregarModulo(def.modulo, def.arquivo);
    if (def.interna === 'visao') return Promise.resolve(secaoVisaoGeral);
    return Promise.resolve(secaoEmDesenvolvimento(def.rotulo));
  }

  /* ---------- Painel da rede ---------- */
  function desenharCabecalho() {
    const { TIPOS, SITUACOES, rotulo } = SIREDE.rede;
    q('rede-cab').innerHTML = `
      <div><h2>${esc(rede.nome)}</h2><p>${esc(rotulo(TIPOS, rede.tipo))}</p></div>
      <span class="badge badge--${esc(rede.situacao)}">${esc(rotulo(SITUACOES, rede.situacao))}</span>`;
  }

  function desenharPainel() {
    pagina.innerHTML = `
      <a class="voltar" href="#/rede">← Todas as redes</a>
      <div class="pagina__cab" id="rede-cab"></div>
      <div class="rede-amb">
        <nav class="rede-nav" aria-label="Seções da rede">${SECOES.map((s) =>
          `<a class="rede-nav__item" href="${esc(hrefSecao(s.id))}" data-secao="${s.id}">${esc(s.rotulo)}</a>`).join('')}</nav>
        <div class="rede-amb__corpo">
          <h3 class="rede-secao__titulo" id="rede-secao-titulo"></h3>
          <div id="rede-secao"></div>
        </div>
      </div>`;
    desenharCabecalho();
  }

  async function abrirSecao(id) {
    const def = SECOES.find((s) => s.id === id) || SECOES[0];
    if (def.id !== id) history.replaceState(null, '', hrefSecao(def.id)); // seção desconhecida na URL
    secaoAtual = def.id;
    const minha = ++seqSecao;

    pagina.querySelectorAll('.rede-nav__item').forEach((a) => {
      if (a.dataset.secao === def.id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    q('rede-secao-titulo').textContent = def.rotulo;
    document.title = `${def.rotulo} · ${rede.nome} | SIREDE+`;

    if (modSecao && modSecao.destruir) modSecao.destruir();
    modSecao = null;
    const alvo = document.createElement('div'); // elemento novo a cada abertura: respostas atrasadas de seções anteriores são descartadas
    alvo.innerHTML = SIREDE.ui.carregando();
    q('rede-secao').replaceChildren(alvo);

    try {
      const modulo = await moduloDaSecao(def);
      if (minha !== seqSecao || !pagina) return;
      alvo.innerHTML = '';
      modSecao = modulo;
      modulo.render(alvo, amb);
    } catch (_) {
      if (minha !== seqSecao || !pagina) return;
      alvo.innerHTML = '<div class="vazio"><p>Não foi possível abrir esta seção.</p><button type="button" class="btn btn--sec" id="rede-secao-retentar">Tentar novamente</button></div>';
      alvo.querySelector('#rede-secao-retentar').addEventListener('click', () => abrirSecao(def.id));
    }
  }

  /* ---------- Módulo ---------- */
  function voltar() {
    return '<div><a class="btn btn--sec" href="#/rede">Voltar para as redes</a></div>';
  }

  SIREDE.modulos['rede-ambiente'] = {
    async render(el, ctx) {
      const { redeId, secao } = ctx.params;
      rede = null; modSecao = null; secaoAtual = null;
      el.innerHTML = `<div class="pagina" id="rede-ambiente-pagina">${SIREDE.ui.carregando()}</div>`;
      const pag = (pagina = el.querySelector('#rede-ambiente-pagina'));
      try {
        // rede.js traz os rótulos compartilhados (tipos e situações) e as seções Dados e Configurações
        await SIREDE.router.carregarModulo('rede', 'rede.js');
        if (pagina !== pag) return;

        const acesso = await SIREDE.db.rpc('eh_admin');
        if (pagina !== pag) return;
        if (acesso.error) { pag.innerHTML = aviso('Não foi possível verificar seu acesso. Recarregue a página.', 'erro'); return; }
        if (acesso.data !== true) {
          pag.innerHTML = '<section class="bloco-vazio"><h3>Acesso restrito</h3><p>Esta área é destinada aos administradores do sistema.</p></section>';
          return;
        }

        // A rede é identificada pelo ID no banco. Se o RLS não liberar, a consulta volta vazia.
        const { data, error } = await SIREDE.db.from('redes').select(SIREDE.rede.COLUNAS).eq('id', redeId).maybeSingle();
        if (pagina !== pag) return;
        if (error) {
          pag.innerHTML = aviso('Não foi possível carregar a rede.', 'erro') +
            '<div><button type="button" class="btn btn--sec" id="rede-retentar">Tentar novamente</button></div>' + voltar();
          q('rede-retentar').addEventListener('click', () => SIREDE.modulos['rede-ambiente'].render(el, ctx));
          return;
        }
        if (!data) {
          pag.innerHTML = '<section class="bloco-vazio"><h3>Rede não encontrada</h3><p>Ela não existe ou você não tem acesso a ela.</p></section>' + voltar();
          return;
        }

        rede = data;
        SIREDE.estado.redeId = rede.id;
        desenharPainel();
        await abrirSecao(secao);
      } catch (_) {
        if (pagina === pag) pag.innerHTML = aviso('Não foi possível abrir esta tela agora.', 'erro') + voltar();
      }
    },

    /* Troca de seção dentro da mesma rede, sem recarregar a rede. */
    atualizar(params) {
      if (!pagina || !rede || params.redeId !== rede.id || !pagina.querySelector('#rede-secao')) return false;
      if (params.secao !== secaoAtual) abrirSecao(params.secao);
      return true;
    },

    destruir() {
      seqSecao++;
      if (modSecao && modSecao.destruir) modSecao.destruir();
      modSecao = null; pagina = null; rede = null; secaoAtual = null;
    },
  };
})();
