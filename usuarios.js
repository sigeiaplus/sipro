/* SIPRO+ — Usuários (tela estrutural) */
(() => {
  'use strict';
  const SIPRO = window.SIPRO;

  SIPRO.modulos.usuarios = {
    render(el) {
      el.innerHTML = SIPRO.ui.telaEstrutural({
        titulo: 'Usuários',
        descricao: 'Gestão de acessos e perfis de usuários.',
        secoes: ['Lista de usuários', 'Perfis e permissões'],
      });
    },
  };
})();
