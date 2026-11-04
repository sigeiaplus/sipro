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
  const rotaDoHash = () => {
    const id = location.hash.replace(/^#\//, '');
    return ROTAS.find((r) => r.id === id) || ROTAS[0];
  };

  function desenharMenu() {
    document.getElementById('menu').innerHTML = ROTAS.map((r) =>
      `<a class="menu__item" href="#/${r.id}" data-rota="${r.id}">${icone(r.icone)}<span>${r.rotulo}</span></a>`
    ).join('');
  }

  function carregar(rota) {
    if (SIPRO.modulos[rota.id]) return Promise.resolve(SIPRO.modulos[rota.id]);
    return new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = rota.arquivo;
      s.onload = () => (SIPRO.modulos[rota.id] ? ok(SIPRO.modulos[rota.id]) : falha(new Error('módulo não registrado')));
      s.onerror = () => { s.remove(); falha(new Error('arquivo não carregou')); };
      document.head.appendChild(s);
    });
  }

  async function navegar() {
    if (!ativo) return;
    const rota = rotaDoHash();
    const minha = ++sequencia;

    document.querySelectorAll('#menu .menu__item').forEach((a) => {
      if (a.dataset.rota === rota.id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.getElementById('topo-titulo').textContent = rota.rotulo;
    document.title = `${rota.rotulo} | SIPRO+`;
    if (SIPRO.ui) SIPRO.ui.fecharMenu();

    const el = conteudo();
    if (moduloAtual && moduloAtual.destruir) moduloAtual.destruir();
    moduloAtual = null;
    el.innerHTML = '<p class="carregando-modulo" role="status">Carregando...</p>';

    try {
      const modulo = await carregar(rota);
      if (minha !== sequencia || !ativo) return;
      moduloAtual = modulo;
      el.innerHTML = '';
      modulo.render(el, contexto);
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
    if (!ROTAS.some((r) => `#/${r.id}` === location.hash))
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

  SIPRO.router = { ROTAS, ativar, desativar };
})();
