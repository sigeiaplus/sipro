/* SIPRO+ — Configurações (tela estrutural) */
(() => {
  'use strict';
  const SIPRO = window.SIPRO;

  SIPRO.modulos.configuracoes = {
    render(el) {
      el.innerHTML = SIPRO.ui.telaEstrutural({
        titulo: 'Configurações',
        descricao: 'Preferências gerais do sistema.',
        secoes: ['Dados da instituição', 'Preferências'],
      });
    },
  };
})();
