/* SIREDE+ — Configurações (tela estrutural) */
(() => {
  'use strict';
  const SIREDE = window.SIREDE;

  SIREDE.modulos.configuracoes = {
    render(el) {
      el.innerHTML = SIREDE.ui.telaEstrutural({
        titulo: 'Configurações',
        descricao: 'Preferências gerais do sistema.',
        secoes: ['Dados da instituição', 'Preferências'],
      });
    },
  };
})();
