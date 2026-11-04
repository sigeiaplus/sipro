/* SIPRO+ — Inicialização geral: troca entre login e ambiente administrativo,
   cabeçalho, menu móvel, logout e utilitários compartilhados (SIPRO.ui).
   O código de cada tela fica no arquivo do seu módulo. */
(() => {
  'use strict';
  const SIPRO = (window.SIPRO = window.SIPRO || { modulos: {} });
  const $ = (id) => document.getElementById(id);

  /* ---------- Utilitários compartilhados ---------- */
  const escapar = (t) => String(t).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Layout padrão das telas estruturais (módulos ainda sem funcionalidades). */
  function telaEstrutural({ titulo, descricao, secoes }) {
    return `
      <div class="pagina">
        <div class="pagina__cab">
          <div><h2>${escapar(titulo)}</h2><p>${escapar(descricao)}</p></div>
          <span class="selo">Tela estrutural</span>
        </div>
        <div class="grade grade--2">
          ${secoes.map((s) => `
            <section class="bloco-vazio">
              <h3>${escapar(s)}</h3>
              <p>Em desenvolvimento.</p>
            </section>`).join('')}
        </div>
      </div>`;
  }

  const raiz = $('view-app');
  function fecharMenu() {
    raiz.classList.remove('menu-aberto');
    $('scrim').hidden = true;
    $('btn-menu').setAttribute('aria-expanded', 'false');
  }
  function abrirMenu() {
    raiz.classList.add('menu-aberto');
    $('scrim').hidden = false;
    $('btn-menu').setAttribute('aria-expanded', 'true');
  }

  SIPRO.ui = { escapar, telaEstrutural, fecharMenu };

  /* ---------- Troca de telas ---------- */
  let usuarioAtual = null;

  function mostrar(qual) {
    $('splash').hidden = true;
    $('view-login').hidden = qual !== 'login';
    $('view-app').hidden = qual !== 'app';
  }

  let carregandoId = null;

  async function entrarNoApp(sessao) {
    const id = sessao.user.id;
    if ((usuarioAtual && usuarioAtual.id === id) || carregandoId === id) return; // renovação de sessão ou busca em andamento
    carregandoId = id;
    const cadastro = await SIPRO.auth.cadastro(); // nome vem de public.usuarios
    if (carregandoId !== id) return; // saiu enquanto carregava
    carregandoId = null;

    const u = { id, nome: cadastro ? cadastro.nome : '' };
    usuarioAtual = u;
    // Sem nome cadastrado: não mostra nome (nunca usa o CPF no lugar) e o avatar fica neutro.
    $('topo-nome').textContent = u.nome;
    $('topo-avatar').innerHTML = u.nome
      ? escapar(u.nome.charAt(0).toUpperCase())
      : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.6 3.5-5.5 7-5.5s6.4 1.9 7 5.5"/></svg>';
    mostrar('app');
    SIPRO.router.ativar({ usuario: u });
  }

  function irParaLogin() {
    usuarioAtual = null;
    carregandoId = null;
    SIPRO.router.desativar();
    fecharMenu();
    SIPRO.login.resetar();
    mostrar('login');
  }

  /* ---------- Eventos do ambiente administrativo ---------- */
  $('btn-menu').addEventListener('click', () => (raiz.classList.contains('menu-aberto') ? fecharMenu() : abrirMenu()));
  $('scrim').addEventListener('click', fecharMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenu(); });

  $('btn-sair').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    await SIPRO.auth.sair(); // a mudança de sessão leva de volta ao login
    e.currentTarget.disabled = false;
  });

  /* ---------- Início ---------- */
  async function iniciar() {
    if (!SIPRO.auth.disponivel()) { irParaLogin(); return; }
    SIPRO.auth.aoMudar((_evento, sessao) => (sessao ? entrarNoApp(sessao) : irParaLogin()));
    const sessao = await SIPRO.auth.sessao(); // recupera a sessão salva ao atualizar a página
    if (sessao) entrarNoApp(sessao); else irParaLogin();
  }
  iniciar();
})();
