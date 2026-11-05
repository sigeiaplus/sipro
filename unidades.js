/* SIREDE+ — Unidades Escolares (tela estrutural) */
(() => {
  'use strict';
  const SIREDE = window.SIREDE;

  SIREDE.modulos.unidades = {
    render(el) {
      el.innerHTML = SIREDE.ui.telaEstrutural({
        titulo: 'Unidades Escolares',
        descricao: 'Cadastro e acompanhamento das unidades escolares.',
        secoes: ['Lista de unidades', 'Dados da unidade'],
      });
    },
  };
})();
