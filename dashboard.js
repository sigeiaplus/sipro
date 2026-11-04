/* SIPRO+ — Dashboard principal */
(() => {
  'use strict';
  const SIPRO = window.SIPRO;
  const esc = SIPRO.ui.escapar;

  // Valores ilustrativos: serão substituídos por dados reais quando os módulos existirem.
  const INDICADORES = [
    { rotulo: 'Redes de ensino', valor: '8', nota: 'Cadastradas' },
    { rotulo: 'Unidades escolares', valor: '124', nota: 'Em funcionamento' },
    { rotulo: 'Usuários ativos', valor: '36', nota: 'Últimos 30 dias' },
    { rotulo: 'Pendências', valor: '5', nota: 'Aguardando análise' },
  ];

  function saudacao() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }
  function dataAtual() {
    const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  SIPRO.modulos.dashboard = {
    render(el, ctx) {
      const u = ctx.usuario;
      const primeiroNome = u.nome.split(/\s+/)[0];
      const ident = [u.nome, u.cpfMascarado && `CPF ${u.cpfMascarado}`].filter(Boolean).join(' · ');

      el.innerHTML = `
        <div class="pagina">
          <section class="boas-vindas">
            <p class="boas-vindas__data">${esc(dataAtual())}</p>
            <h2>${saudacao()}${primeiroNome ? ', ' + esc(primeiroNome) : ''}!</h2>
            <p>Você está no ambiente administrativo do SIPRO+. Use o menu para acessar os módulos.</p>
            ${ident ? `<p class="boas-vindas__ident">Conectado como ${esc(ident)}</p>` : ''}
          </section>

          <div class="pagina__cab pagina__cab--sec">
            <h3>Indicadores</h3><span class="selo">Dados ilustrativos</span>
          </div>
          <div class="grade grade--4">
            ${INDICADORES.map((i) => `
              <article class="indicador">
                <p class="indicador__rotulo">${esc(i.rotulo)}</p>
                <p class="indicador__valor">${esc(i.valor)}</p>
                <p class="indicador__nota">${esc(i.nota)}</p>
              </article>`).join('')}
          </div>

          <section class="bloco-vazio bloco-vazio--grande">
            <h3>Informações administrativas</h3>
            <p>Avisos, atividades recentes e atalhos aparecerão aqui.</p>
          </section>
        </div>`;
    },
  };
})();
