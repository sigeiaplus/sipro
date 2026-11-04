/* SIPRO+ — Unidades Escolares (tela estrutural) */
(() => {
  'use strict';
  const SIPRO = window.SIPRO;

  SIPRO.modulos.unidades = {
    render(el) {
      el.innerHTML = SIPRO.ui.telaEstrutural({
        titulo: 'Unidades Escolares',
        descricao: 'Cadastro e acompanhamento das unidades escolares.',
        secoes: ['Lista de unidades', 'Dados da unidade'],
      });
    },
  };
})();
