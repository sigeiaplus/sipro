/* SIREDE+ — Usuários (tela estrutural) */
(() => {
  'use strict';
  const SIREDE = window.SIREDE;

  SIREDE.modulos.usuarios = {
    render(el) {
      el.innerHTML = SIREDE.ui.telaEstrutural({
        titulo: 'Usuários',
        descricao: 'Gestão de acessos e perfis de usuários.',
        secoes: ['Lista de usuários', 'Perfis e permissões'],
      });
    },
  };
})();
