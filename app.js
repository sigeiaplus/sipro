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

  function entrarNoApp(sessao) {
    const u = SIPRO.auth.usuario(sessao.user);
    if (usuarioAtual && usuarioAtual.id === u.id) return; // renovação de sessão: nada a refazer
    usuarioAtual = u;
    const rotulo = u.nome || u.cpfMascarado || 'Usuário';
    $('topo-nome').textContent = rotulo;
    $('topo-avatar').textContent = rotulo.trim().charAt(0).toUpperCase();
    mostrar('app');
    SIPRO.router.ativar({ usuario: u });
  }

  function irParaLogin() {
    usuarioAtual = null;
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
