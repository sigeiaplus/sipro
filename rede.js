/* SIPRO+ — Gestão da Rede (tela estrutural) */
(() => {
  'use strict';
  const SIPRO = window.SIPRO;

  SIPRO.modulos.rede = {
    render(el) {
      el.innerHTML = SIPRO.ui.telaEstrutural({
        titulo: 'Gestão da Rede',
        descricao: 'Cadastro e acompanhamento das redes de ensino.',
        secoes: ['Lista de redes', 'Dados da rede'],
      });
    },
  };
})();
