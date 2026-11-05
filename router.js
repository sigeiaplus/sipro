/* SIPRO+ — Navegação entre telas (sem recarregar a página)
   Cada item do menu carrega, sob demanda, o arquivo JS do seu módulo.
   Cada módulo se registra com: SIPRO.modulos.<id> = { render(el, ctx), destruir?() } */
(() => {
  'use strict';
  const SIPRO = (window.SIPRO = window.SIPRO || { modulos: {} });

  const icone = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

  const ROTAS = [
    { id: 'dashboard', rotulo: 'Dashboard', arquivo: 'dashboard.js',
      icone: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>' },
    { id: 'rede', rotulo: 'Gestão da Rede', arquivo: 'rede.js',
      icone: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5l-5.5 5.5M12 11.5l5.5 5.5"/>' },
    // Ambiente da rede: acessado por #/rede/<id>/<seção>, nunca por #/rede-ambiente
    { id: 'rede-ambiente', rotulo: 'Gestão da Rede', arquivo: 'rede-ambiente.js', pai: 'rede', oculta: true, aninhada: true, icone: '' },
    { id: 'pessoas', rotulo: 'Pessoas', arquivo: 'pessoas.js',
      icone: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16c.5-1.8 1.9-2.6 3.5-2.6s3 .8 3.5 2.6M15 10h3M15 14h3"/>' },
    { id: 'unidades', rotulo: 'Unidades Escolares', arquivo: 'unidades.js',
      icone: '<path d="M3 21h18M5 21V9l7-5 7 5v12M10 21v-6h4v6"/>' },
    { id: 'usuarios', rotulo: 'Usuários', arquivo: 'usuarios.js',
      icone: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .6 3.3 2.3 3.5 5.2"/>' },
    { id: 'configuracoes', rotulo: 'Configurações', arquivo: 'configuracoes.js',
      icone: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>' },
  ];

  let ativo = false;
  let contexto = null;
  let moduloAtual = null;
  let sequencia = 0;

  const conteudo = () => document.getElementById('conteudo');
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /** Lê o hash. Formatos: #/<rota> e #/rede/<id da rede>[/<seção>].
      Retorna { rota, params } ou null quando o hash não é válido. */
  function analisarHash() {
    const partes = location.hash.replace(/^#\//, '').split('/').filter(Boolean);
    if (partes[0] === 'rede' && partes.length >= 2) {
      if (partes.length > 3 || !UUID.test(partes[1])) return null;
      return {
        rota: ROTAS.find((r) => r.id === 'rede-ambiente'),
        params: { redeId: partes[1].toLowerCase(), secao: partes[2] || 'visao-geral' },
      };
    }
    if (partes.length !== 1) return null;
    const rota = ROTAS.find((r) => r.id === partes[0] && !r.aninhada);
    return rota ? { rota, params: {} } : null;
  }

  function desenharMenu() {
    document.getElementById('menu').innerHTML = ROTAS.filter((r) => !r.oculta).map((r) =>
      `<a class="menu__item" href="#/${r.id}" data-rota="${r.id}">${icone(r.icone)}<span>${r.rotulo}</span></a>`
    ).join('');
  }

  /** Carrega, sob demanda, o arquivo que registra o módulo `chave`.
      Usado pelo roteador e pelas seções internas da rede. */
  const emCarga = {};
  function carregarModulo(chave, arquivo) {
    if (SIPRO.modulos[chave]) return Promise.resolve(SIPRO.modulos[chave]);
    if (emCarga[arquivo]) return emCarga[arquivo].then(() => (SIPRO.modulos[chave] || Promise.reject(new Error('módulo não registrado'))));
    emCarga[arquivo] = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = arquivo;
      s.onload = () => ok();
      s.onerror = () => { s.remove(); falha(new Error('arquivo não carregou')); };
      document.head.appendChild(s);
    });
    emCarga[arquivo].catch(() => { delete emCarga[arquivo]; });
    return emCarga[arquivo].then(() => (SIPRO.modulos[chave] || Promise.reject(new Error('módulo não registrado'))));
  }

  async function navegar() {
    if (!ativo) return;
    const alvo = analisarHash() || { rota: ROTAS[0], params: {} };
    const rota = alvo.rota;
    const minha = ++sequencia;

    document.querySelectorAll('#menu .menu__item').forEach((a) => {
      if (a.dataset.rota === (rota.pai || rota.id)) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.getElementById('topo-titulo').textContent = (ROTAS.find((r) => r.id === rota.pai) || rota).rotulo;
    document.title = `${rota.rotulo} | SIPRO+`;
    if (SIPRO.ui) SIPRO.ui.fecharMenu();

    // Mesmo módulo e só mudou a seção/parâmetro: o módulo atualiza sem recarregar tudo.
    if (moduloAtual && moduloAtual === SIPRO.modulos[rota.id] && moduloAtual.atualizar && moduloAtual.atualizar(alvo.params)) return;

    const el = conteudo();
    if (moduloAtual && moduloAtual.destruir) moduloAtual.destruir();
    moduloAtual = null;
    el.innerHTML = SIPRO.ui.carregando();

    try {
      const modulo = await carregarModulo(rota.id, rota.arquivo);
      if (minha !== sequencia || !ativo) return;
      moduloAtual = modulo;
      el.innerHTML = '';
      modulo.render(el, { ...contexto, params: alvo.params });
      window.scrollTo(0, 0);
    } catch (_) {
      if (minha !== sequencia) return;
      el.innerHTML = '<div class="vazio"><p>Não foi possível abrir esta tela.</p><button type="button" class="btn btn--sec" id="btn-retentar">Tentar novamente</button></div>';
      document.getElementById('btn-retentar').addEventListener('click', navegar);
    }
  }

  window.addEventListener('hashchange', navegar);

  function ativar(ctx) {
    contexto = ctx;
    ativo = true;
    desenharMenu();
    if (!analisarHash())
      history.replaceState(null, '', `${location.pathname}${location.search}#/${ROTAS[0].id}`);
    navegar();
  }

  function desativar() {
    ativo = false;
    sequencia++;
    if (moduloAtual && moduloAtual.destruir) moduloAtual.destruir();
    moduloAtual = null;
    conteudo().innerHTML = '';
    history.replaceState(null, '', location.pathname + location.search);
    document.title = 'Entrar | SIPRO+';
  }

  SIPRO.router = { ROTAS, ativar, desativar, carregarModulo };
})();
