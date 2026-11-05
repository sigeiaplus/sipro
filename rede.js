/* SIPRO+ — Gestão da Rede
   Registra três módulos:
   - rede         : listagem das redes; clicar em uma rede abre o ambiente dela (#/rede/<id>)
   - rede-dados   : seção Dados da Rede (consulta e edição dos dados cadastrais)
   - rede-config  : seção Configurações (situação da rede)
   A permissão real vem do RLS; o frontend só esconde telas de quem não é administrador. */
(() => {
  'use strict';
  const SIPRO = window.SIPRO;
  const esc = SIPRO.ui.escapar;

  const TIPOS = [['estadual', 'Estadual'], ['municipal', 'Municipal'], ['federal', 'Federal'], ['privada', 'Privada'], ['outra', 'Outra']];
  const SITUACOES = [['ativa', 'Ativa'], ['inativa', 'Inativa'], ['suspensa', 'Suspensa']];
  const COLUNAS = 'id, nome, nome_institucional, tipo, cnpj, situacao, email_institucional, telefone_institucional';
  const rotulo = (lista, v) => (lista.find((i) => i[0] === v) || [v, v])[1];

  /* ---------- Validação e máscaras ---------- */
  const soDigitos = (t) => String(t || '').replace(/\D/g, '');

  function cnpjValido(c) {
    if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
    const digito = (n) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(c[i]) * pesos[i];
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    return digito(12) === Number(c[12]) && digito(13) === Number(c[13]);
  }
  const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

  function mascaraCnpj(t) {
    const d = soDigitos(t).slice(0, 14);
    let r = d.slice(0, 2);
    if (d.length > 2) r += '.' + d.slice(2, 5);
    if (d.length > 5) r += '.' + d.slice(5, 8);
    if (d.length > 8) r += '/' + d.slice(8, 12);
    if (d.length > 12) r += '-' + d.slice(12);
    return r;
  }
  function mascaraTelefone(t) {
    const d = soDigitos(t).slice(0, 11);
    if (d.length <= 2) return d;
    const corte = d.length === 11 ? 5 : 4;
    const resto = d.slice(2);
    return `(${d.slice(0, 2)}) ` + (resto.length <= corte ? resto : `${resto.slice(0, corte)}-${resto.slice(corte)}`);
  }

  function validar(v) {
    const erros = {};
    const nome = v.nome.trim();
    if (!nome) erros.nome = 'Informe o nome da rede.';
    if (!TIPOS.some((t) => t[0] === v.tipo)) erros.tipo = 'Selecione o tipo da rede.';
    if (!SITUACOES.some((s) => s[0] === v.situacao)) erros.situacao = 'Selecione a situação.';
    const cnpj = soDigitos(v.cnpj);
    if (cnpj && !cnpjValido(cnpj)) erros.cnpj = 'CNPJ inválido.';
    const email = v.email.trim();
    if (email && !emailValido(email)) erros.email = 'E-mail inválido.';
    const tel = soDigitos(v.telefone);
    if (tel && !/^\d{10,11}$/.test(tel)) erros.telefone = 'Informe o telefone com DDD (10 ou 11 dígitos).';
    return {
      erros,
      dados: {
        nome,
        nome_institucional: v.nomeInst.trim() || null,
        tipo: v.tipo,
        cnpj: cnpj || null,
        situacao: v.situacao,
        email_institucional: email || null,
        telefone_institucional: tel || null,
      },
    };
  }

  function mensagemDeErro(err) {
    if (err.code === '23505') return 'Já existe uma rede cadastrada com este CNPJ.';
    if (err.code === '23514') return 'Algum dado está em formato inválido. Revise os campos.';
    if (err.code === '42501') return 'Você não tem permissão para esta operação.';
    return 'Não foi possível concluir agora. Tente novamente em instantes.';
  }

  SIPRO.rede = { TIPOS, SITUACOES, COLUNAS, rotulo }; // compartilhado com o ambiente da rede

  const aviso = (texto, tipo) => (texto ? `<div class="aviso ${tipo}" role="${tipo === 'erro' ? 'alert' : 'status'}">${esc(texto)}</div>` : '');
  const opcoes = (lista, atual) =>
    '<option value="">Selecione</option>' +
    lista.map(([v, t]) => `<option value="${v}"${v === atual ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const campo = (k, rot, html, cheio) =>
    `<div class="field${cheio ? ' field--cheio' : ''}" id="f-${k}"><label for="rd-${k}">${rot}</label>${html}<p class="field__erro" id="e-${k}"></p></div>`;

  /* ---------- Formulário de dados cadastrais (cadastro e edição) ----------
     Na edição a situação não aparece aqui: ela é alterada em Configurações. */
  function formularioRede(el, { rede, aoSalvar, aoCancelar }) {
    const r = rede || {};
    const q = (id) => el.querySelector('#' + id);
    const vivo = () => el.isConnected;
    const chaves = ['nome', 'tipo', 'situacao', 'cnpj', 'telefone', 'email'];

    el.innerHTML = `
      <form class="painel" id="rd-form" novalidate>
        <div id="rd-aviso"></div>
        <div class="form-grid">
          ${campo('nome', 'Nome da rede *', `<input id="rd-nome" maxlength="200" autocomplete="off" value="${esc(r.nome || '')}">`, true)}
          ${campo('nomeInst', 'Nome institucional', `<input id="rd-nomeInst" maxlength="200" autocomplete="off" value="${esc(r.nome_institucional || '')}">`, true)}
          ${campo('tipo', 'Tipo *', `<select id="rd-tipo">${opcoes(TIPOS, r.tipo)}</select>`)}
          ${rede ? '' : campo('situacao', 'Situação *', `<select id="rd-situacao">${opcoes(SITUACOES, 'ativa')}</select>`)}
          ${campo('cnpj', 'CNPJ', `<input id="rd-cnpj" inputmode="numeric" autocomplete="off" placeholder="00.000.000/0000-00" value="${esc(r.cnpj ? mascaraCnpj(r.cnpj) : '')}">`)}
          ${campo('telefone', 'Telefone institucional', `<input id="rd-telefone" inputmode="tel" autocomplete="off" placeholder="(00) 00000-0000" value="${esc(r.telefone_institucional ? mascaraTelefone(r.telefone_institucional) : '')}">`)}
          ${campo('email', 'E-mail institucional', `<input id="rd-email" type="email" autocomplete="off" value="${esc(r.email_institucional || '')}">`, true)}
        </div>
        <div class="form-acoes">
          <button type="submit" class="btn" id="rd-salvar">Salvar</button>
          <button type="button" class="btn btn--neutro" id="rd-cancelar">Cancelar</button>
        </div>
      </form>`;

    q('rd-cnpj').addEventListener('input', (e) => { e.target.value = mascaraCnpj(e.target.value); });
    q('rd-telefone').addEventListener('input', (e) => { e.target.value = mascaraTelefone(e.target.value); });
    q('rd-cancelar').addEventListener('click', aoCancelar);
    q('rd-form').addEventListener('submit', (e) => { e.preventDefault(); salvar(); });
    q('rd-nome').focus();

    const lerForm = () => ({
      nome: q('rd-nome').value, nomeInst: q('rd-nomeInst').value, tipo: q('rd-tipo').value,
      situacao: rede ? rede.situacao : q('rd-situacao').value,
      cnpj: q('rd-cnpj').value, email: q('rd-email').value, telefone: q('rd-telefone').value,
    });

    function mostrarErros(erros) {
      chaves.forEach((k) => {
        if (!q('f-' + k)) return;
        q('f-' + k).classList.toggle('erro', !!erros[k]);
        q('e-' + k).textContent = erros[k] || '';
      });
      const primeiro = chaves.find((k) => erros[k] && q('rd-' + k));
      if (primeiro) q('rd-' + primeiro).focus();
    }

    async function salvar() {
      const { erros, dados } = validar(lerForm());
      q('rd-aviso').innerHTML = '';
      mostrarErros(erros);
      if (Object.keys(erros).length) return;
      if (rede) delete dados.situacao; // a situação só muda em Configurações

      const botao = q('rd-salvar');
      botao.disabled = true;
      const falhar = (texto) => {
        if (!vivo()) return;
        q('rd-aviso').innerHTML = aviso(texto, 'erro');
        botao.disabled = false;
      };

      // O tipo define como a área de atuação é validada: não pode mudar com área já cadastrada.
      if (rede && dados.tipo !== rede.tipo) {
        const { count, error } = await SIPRO.db.from('redes_areas_atuacao').select('id', { count: 'exact', head: true }).eq('rede_id', rede.id);
        if (!vivo()) return;
        if (error) return falhar(mensagemDeErro(error));
        if (count > 0) return falhar('Esta rede já tem área de atuação cadastrada. Remova a área antes de alterar o tipo.');
      }

      const consulta = rede
        ? SIPRO.db.from('redes').update(dados).eq('id', rede.id)
        : SIPRO.db.from('redes').insert(dados);
      const { data, error } = await consulta.select(COLUNAS);
      if (!vivo()) return;
      if (error) return falhar(mensagemDeErro(error));
      if (!data || !data.length) return falhar('Nenhuma alteração foi salva. Verifique sua permissão e tente novamente.');
      aoSalvar(data[0]);
    }
  }

  /* ---------- Módulo: listagem de redes ---------- */
  let pagina = null; // elemento da tela atual; null quando a tela foi fechada
  let redes = [];

  const q = (id) => pagina.querySelector('#' + id);
  const cabecalho = (comBotao) => `
    <div class="pagina__cab">
      <div><h2>Gestão da Rede</h2><p>Selecione uma rede para abrir o ambiente administrativo dela.</p></div>
      ${comBotao ? '<button type="button" class="btn btn--sec" id="rede-nova">Nova rede</button>' : ''}
    </div>`;

  async function carregar() {
    const pag = pagina;
    const { data, error } = await SIPRO.db.from('redes').select(COLUNAS).order('nome');
    if (pagina !== pag) return;
    if (error) {
      pag.innerHTML = cabecalho(false) + aviso('Não foi possível carregar as redes.', 'erro') +
        '<div><button type="button" class="btn btn--sec" id="rede-retentar">Tentar novamente</button></div>';
      q('rede-retentar').addEventListener('click', () => carregar());
      return;
    }
    redes = data || [];
    desenharLista();
  }

  function desenharLista() {
    const itens = redes.map((r) => `
      <li>
        <a class="rede-item rede-item--link" href="#/rede/${esc(r.id)}/visao-geral" aria-label="Abrir ${esc(r.nome)}">
          <div>
            <p class="rede-item__nome">${esc(r.nome)}</p>
            <p class="rede-item__meta">${esc(rotulo(TIPOS, r.tipo))}${r.cnpj ? ' · CNPJ ' + esc(mascaraCnpj(r.cnpj)) : ''}</p>
          </div>
          <div class="rede-item__acoes">
            <span class="badge badge--${esc(r.situacao)}">${esc(rotulo(SITUACOES, r.situacao))}</span>
          </div>
        </a>
      </li>`).join('');

    pagina.innerHTML = cabecalho(true) + (redes.length
      ? `<ul class="rede-lista">${itens}</ul>`
      : `<section class="bloco-vazio"><h3>Nenhuma rede cadastrada</h3><p>Use "Nova rede" para cadastrar a primeira rede de ensino.</p></section>`);

    q('rede-nova').addEventListener('click', desenharNova);
  }

  function desenharNova() {
    pagina.innerHTML = `
      <div class="pagina__cab">
        <div><h2>Nova rede</h2><p>Dados cadastrais da rede de ensino. Campos com * são obrigatórios.</p></div>
      </div>
      <div id="rede-novo-form"></div>`;
    formularioRede(q('rede-novo-form'), {
      rede: null,
      aoSalvar: (nova) => { SIPRO.estado.redeId = nova.id; location.hash = `#/rede/${nova.id}/visao-geral`; },
      aoCancelar: desenharLista,
    });
  }

  SIPRO.modulos.rede = {
    async render(el) {
      el.innerHTML = `<div class="pagina" id="rede-pagina">${SIPRO.ui.carregando()}</div>`;
      const pag = (pagina = el.querySelector('#rede-pagina'));
      try {
        const { data, error } = await SIPRO.db.rpc('eh_admin');
        if (pagina !== pag) return;
        if (error) { pag.innerHTML = cabecalho(false) + aviso('Não foi possível verificar seu acesso. Recarregue a página.', 'erro'); return; }
        if (data !== true) {
          pag.innerHTML = cabecalho(false) +
            '<section class="bloco-vazio"><h3>Acesso restrito</h3><p>Esta área é destinada aos administradores do sistema.</p></section>';
          return;
        }
        await carregar();
      } catch (_) {
        if (pagina === pag) pag.innerHTML = cabecalho(false) + aviso('Não foi possível abrir esta tela agora.', 'erro');
      }
    },
    destruir() { pagina = null; redes = []; },
  };

  /* ---------- Seção: Dados da Rede ---------- */
  function desenharDados(el, amb, msg) {
    const r = amb.rede;
    const linhas = [
      ['Nome da rede', r.nome],
      ['Nome institucional', r.nome_institucional],
      ['Tipo', rotulo(TIPOS, r.tipo)],
      ['CNPJ', r.cnpj ? mascaraCnpj(r.cnpj) : ''],
      ['Telefone institucional', r.telefone_institucional ? mascaraTelefone(r.telefone_institucional) : ''],
      ['E-mail institucional', r.email_institucional],
    ];
    el.innerHTML = aviso(msg, 'info') + `
      <section class="painel">
        <dl class="dados">${linhas.map(([k, v]) =>
          `<div class="dados__item"><dt>${esc(k)}</dt><dd>${v ? esc(v) : '<span class="dados__vazio">Não informado</span>'}</dd></div>`).join('')}</dl>
        <div class="form-acoes"><button type="button" class="btn btn--sec" id="rd-editar">Editar dados</button></div>
      </section>`;
    el.querySelector('#rd-editar').addEventListener('click', () => {
      el.innerHTML = '<div id="rd-edicao"></div>';
      formularioRede(el.querySelector('#rd-edicao'), {
        rede: amb.rede,
        aoSalvar: (nova) => { amb.aoSalvar(nova); desenharDados(el, amb, 'Dados atualizados.'); },
        aoCancelar: () => desenharDados(el, amb),
      });
    });
  }

  SIPRO.modulos['rede-dados'] = {
    render(el, amb) { desenharDados(el, amb); },
  };

  /* ---------- Seção: Configurações ---------- */
  function desenharConfig(el, amb, msg, tipo) {
    const r = amb.rede;
    el.innerHTML = aviso(msg, tipo) + `
      <form class="painel" id="cf-form" novalidate>
        <h3>Situação da rede</h3>
        <p class="dica">Define se a rede está em operação. Os cadastros e o histórico são preservados.</p>
        <div id="cf-aviso"></div>
        <div class="form-grid">
          <div class="field" id="cf-campo"><label for="cf-situacao">Situação</label><select id="cf-situacao">${opcoes(SITUACOES, r.situacao)}</select><p class="field__erro" id="cf-erro"></p></div>
        </div>
        <div class="form-acoes"><button type="submit" class="btn" id="cf-salvar">Salvar situação</button></div>
      </form>
      <section class="bloco-vazio"><h3>Outras configurações administrativas</h3><p>Em desenvolvimento.</p></section>`;

    const q2 = (id) => el.querySelector('#' + id);
    q2('cf-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nova = q2('cf-situacao').value;
      q2('cf-aviso').innerHTML = '';
      q2('cf-campo').classList.remove('erro');
      q2('cf-erro').textContent = '';
      if (!SITUACOES.some((s) => s[0] === nova)) {
        q2('cf-campo').classList.add('erro');
        q2('cf-erro').textContent = 'Selecione a situação.';
        return;
      }
      if (nova === r.situacao) { q2('cf-aviso').innerHTML = aviso('A rede já está nesta situação.', 'info'); return; }
      if (nova !== 'ativa' && !window.confirm(`Alterar a situação desta rede para "${rotulo(SITUACOES, nova)}"? Os cadastros e o histórico são preservados.`)) return;

      const botao = q2('cf-salvar');
      botao.disabled = true;
      const { data, error } = await SIPRO.db.from('redes').update({ situacao: nova }).eq('id', r.id).select(COLUNAS);
      if (!el.isConnected) return;
      if (error || !data || !data.length) {
        q2('cf-aviso').innerHTML = aviso(error ? mensagemDeErro(error) : 'Nenhuma alteração foi salva. Verifique sua permissão e tente novamente.', 'erro');
        botao.disabled = false;
        return;
      }
      amb.aoSalvar(data[0]);
      desenharConfig(el, amb, 'Situação atualizada.', 'info');
    });
  }

  SIPRO.modulos['rede-config'] = {
    render(el, amb) { desenharConfig(el, amb); },
  };
})();
