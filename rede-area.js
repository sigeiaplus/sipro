/* SIPRO+ — Gestão da Rede › Área de Atuação
   Cadastra onde cada rede atua (public.redes_areas_atuacao), conforme o tipo da rede:
   estadual = um estado; municipal = um município; federal, privada e outra = várias áreas
   (estados, municípios ou descrição livre). As regras também são impostas pelo banco. */
(() => {
  'use strict';
  const SIPRO = window.SIPRO;
  const esc = SIPRO.ui.escapar;

  const UNICA = (tipo) => tipo === 'estadual' || tipo === 'municipal';
  const REGRA = {
    estadual: 'Rede estadual: informe o estado de atuação. É permitida uma única área.',
    municipal: 'Rede municipal: informe o município de atuação. É permitida uma única área.',
    outros: 'Esta rede pode ter várias áreas: estados, municípios ou uma descrição livre (por exemplo, abrangência nacional).',
  };

  let pagina = null; // elemento da tela atual; null quando a tela foi fechada
  let estados = [];
  let redes = [];
  let rede = null;
  let areas = [];
  let cacheMunicipios = {};

  const q = (id) => pagina.querySelector('#' + id);
  const aviso = (texto, tipo) => (texto ? `<div class="aviso ${tipo}" role="${tipo === 'erro' ? 'alert' : 'status'}">${esc(texto)}</div>` : '');
  const nomeUf = (uf) => (estados.find((e) => e.uf === uf) || { nome: uf }).nome;
  const cabecalho = () => `
    <div class="pagina__cab">
      <div><h2>Gestão da Rede</h2><p>Cadastro e acompanhamento das redes de ensino.</p></div>
    </div>
    ${SIPRO.ui.abasRede('rede-area')}`;

  function mensagemDeErro(err) {
    if (err.code === 'P0001' && err.message) return err.message; // regras do banco, já em português
    if (err.code === '23505') return 'Esta localidade já está cadastrada nesta rede.';
    if (err.code === '23514') return 'Informe ao menos um estado, um município ou uma descrição.';
    if (err.code === '42501') return 'Você não tem permissão para esta operação.';
    return 'Não foi possível concluir agora. Tente novamente em instantes.';
  }

  function descreverArea(a, nomesMun) {
    let rotulo;
    let meta;
    if (a.municipio_codigo) { rotulo = `${nomesMun[a.municipio_codigo] || a.municipio_codigo}${a.uf ? ' — ' + a.uf : ''}`; meta = 'Município'; }
    else if (a.uf) { rotulo = nomeUf(a.uf); meta = 'Estado inteiro'; }
    else { rotulo = a.descricao; meta = 'Descrição livre'; }
    if ((a.municipio_codigo || a.uf) && a.descricao) meta += ' · ' + a.descricao;
    return { ...a, rotulo, meta };
  }

  /* ---------- Carregamento ---------- */
  const seletorHtml = () => (redes.length > 1
    ? `<div class="field seletor-rede"><label for="ar-rede">Rede</label><select id="ar-rede"><option value="">Selecione a rede</option>${
      redes.map((r) => `<option value="${esc(r.id)}"${rede && rede.id === r.id ? ' selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></div>`
    : `<p class="rede-atual">Rede: <strong>${esc(redes[0].nome)}</strong></p>`);

  function ligarSeletor() {
    const sel = pagina.querySelector('#ar-rede');
    if (!sel) return;
    sel.addEventListener('change', () => {
      rede = redes.find((r) => r.id === sel.value) || null;
      SIPRO.estado.redeId = rede ? rede.id : null;
      areas = [];
      if (rede) carregarAreas(); else desenhar();
    });
  }

  function desenharErro(texto) {
    pagina.innerHTML = cabecalho() + seletorHtml() + aviso(texto, 'erro') +
      '<div><button type="button" class="btn btn--sec" id="ar-retentar">Tentar novamente</button></div>';
    ligarSeletor();
    q('ar-retentar').addEventListener('click', () => (rede ? carregarAreas() : iniciar()));
  }

  async function carregarAreas(msg) {
    const pag = pagina;
    const { data, error } = await SIPRO.db.from('redes_areas_atuacao').select('id, uf, municipio_codigo, descricao').eq('rede_id', rede.id);
    if (pagina !== pag) return;
    if (error) return desenharErro('Não foi possível carregar as áreas de atuação.');
    const nomes = {};
    const codigos = (data || []).filter((a) => a.municipio_codigo).map((a) => a.municipio_codigo);
    if (codigos.length) {
      const r = await SIPRO.db.from('municipios').select('codigo_ibge, nome').in('codigo_ibge', codigos);
      if (pagina !== pag) return;
      if (r.error) return desenharErro('Não foi possível carregar as áreas de atuação.');
      (r.data || []).forEach((m) => { nomes[m.codigo_ibge] = m.nome; });
    }
    areas = (data || []).map((a) => descreverArea(a, nomes)).sort((a, b) => String(a.rotulo).localeCompare(String(b.rotulo), 'pt-BR'));
    desenhar(msg, 'info');
  }

  /* ---------- Telas ---------- */
  function desenhar(msg, tipoMsg, form) {
    let conteudo;
    if (!rede) {
      conteudo = '<section class="bloco-vazio"><h3>Selecione uma rede</h3><p>Escolha a rede para consultar ou cadastrar sua área de atuação.</p></section>';
    } else {
      const unica = UNICA(rede.tipo);
      const itens = areas.map((a) => `
        <li class="rede-item">
          <div><p class="rede-item__nome">${esc(a.rotulo)}</p><p class="rede-item__meta">${esc(a.meta)}</p></div>
          <div class="rede-item__acoes">
            ${unica ? `<button type="button" class="btn btn--sec" data-alterar="${esc(a.id)}">Alterar</button>` : ''}
            <button type="button" class="btn btn--neutro" data-remover="${esc(a.id)}">Remover</button>
          </div>
        </li>`).join('');
      const podeAdicionar = !form && (!unica || areas.length === 0);
      conteudo = `
        <p class="dica">${esc(REGRA[rede.tipo] || REGRA.outros)}</p>
        ${areas.length ? `<ul class="rede-lista">${itens}</ul>`
          : '<section class="bloco-vazio"><h3>Nenhuma área de atuação cadastrada</h3><p>Use "Adicionar área" para informar onde esta rede atua.</p></section>'}
        ${podeAdicionar ? '<div><button type="button" class="btn btn--sec" id="ar-adicionar">Adicionar área</button></div>' : ''}
        ${form ? htmlForm(form) : ''}`;
    }

    pagina.innerHTML = cabecalho() + seletorHtml() + aviso(msg, tipoMsg) + conteudo;
    ligarSeletor();
    const add = pagina.querySelector('#ar-adicionar');
    if (add) add.addEventListener('click', () => desenhar(null, null, { editId: null, valores: null }));
    pagina.querySelectorAll('[data-alterar]').forEach((b) => b.addEventListener('click', () => {
      const a = areas.find((x) => x.id === b.dataset.alterar);
      if (a) desenhar(null, null, { editId: a.id, valores: { uf: a.uf, municipio: a.municipio_codigo, descricao: a.descricao } });
    }));
    pagina.querySelectorAll('[data-remover]').forEach((b) => b.addEventListener('click', () => remover(b.dataset.remover)));
    if (form) montarForm(form);
  }

  const campo = (k, rot, html, cheio) =>
    `<div class="field${cheio ? ' field--cheio' : ''}" id="fa-${k}"><label for="ar-${k}">${rot}</label>${html}<p class="field__erro" id="ea-${k}"></p></div>`;

  function htmlForm(form) {
    const obrigaUf = UNICA(rede.tipo);
    const ufs = estados.map((e) => `<option value="${esc(e.uf)}">${esc(e.nome)}</option>`).join('');
    return `
      <form class="painel" id="ar-form" novalidate>
        <h3>${form.editId ? 'Alterar área de atuação' : 'Adicionar área de atuação'}</h3>
        <div id="ar-aviso"></div>
        <div class="form-grid">
          ${campo('uf', obrigaUf ? 'Estado *' : 'Estado', `<select id="ar-uf"><option value="">Selecione</option>${ufs}</select>`, false)}
          ${rede.tipo === 'estadual' ? '' : campo('mun', rede.tipo === 'municipal' ? 'Município *' : 'Município', '<select id="ar-mun" disabled></select>', false)}
          ${UNICA(rede.tipo) ? '' : campo('desc', 'Descrição', '<input id="ar-desc" maxlength="200" autocomplete="off" placeholder="Ex.: Todo o território nacional">', true)}
        </div>
        <div class="form-acoes">
          <button type="submit" class="btn" id="ar-salvar">Salvar</button>
          <button type="button" class="btn btn--neutro" id="ar-cancelar">Cancelar</button>
        </div>
      </form>`;
  }

  async function popularMunicipios(uf, selecionado) {
    const pag = pagina;
    if (!q('ar-mun')) return;
    if (!uf) {
      q('ar-mun').innerHTML = '<option value="">Selecione o estado primeiro</option>';
      q('ar-mun').disabled = true;
      return;
    }
    q('ar-mun').disabled = true;
    q('ar-mun').innerHTML = '<option value="">Carregando...</option>';
    if (!cacheMunicipios[uf]) {
      const { data, error } = await SIPRO.db.from('municipios').select('codigo_ibge, nome').eq('uf', uf).order('nome');
      if (pagina !== pag || !q('ar-uf') || q('ar-uf').value !== uf) return;
      if (error) { q('ar-mun').innerHTML = '<option value="">Não foi possível carregar</option>'; return; }
      cacheMunicipios[uf] = data || [];
    }
    if (!q('ar-uf') || q('ar-uf').value !== uf) return;
    const vazio = rede.tipo === 'municipal' ? 'Selecione o município' : 'Todo o estado (sem município)';
    q('ar-mun').innerHTML = `<option value="">${vazio}</option>` + cacheMunicipios[uf].map((m) =>
      `<option value="${m.codigo_ibge}"${Number(selecionado) === m.codigo_ibge ? ' selected' : ''}>${esc(m.nome)}</option>`).join('');
    q('ar-mun').disabled = false;
  }

  function montarForm(form) {
    const v = form.valores || {};
    q('ar-uf').value = v.uf || '';
    if (q('ar-desc')) q('ar-desc').value = v.descricao || '';
    popularMunicipios(v.uf || '', v.municipio);
    q('ar-uf').addEventListener('change', (e) => popularMunicipios(e.target.value, null));
    q('ar-cancelar').addEventListener('click', () => desenhar());
    q('ar-form').addEventListener('submit', (e) => { e.preventDefault(); salvar(form.editId); });
    q('ar-uf').focus();
  }

  function mostrarErros(erros) {
    ['uf', 'mun', 'desc'].forEach((k) => {
      if (!q('fa-' + k)) return;
      q('fa-' + k).classList.toggle('erro', !!erros[k]);
      q('ea-' + k).textContent = erros[k] || '';
    });
    const primeiro = ['uf', 'mun', 'desc'].find((k) => erros[k]);
    if (primeiro) q('ar-' + primeiro).focus();
  }

  /* ---------- Ações ---------- */
  async function salvar(editId) {
    const pag = pagina;
    const uf = q('ar-uf').value;
    const mun = q('ar-mun') ? q('ar-mun').value : '';
    const desc = q('ar-desc') ? q('ar-desc').value.trim() : '';
    const erros = {};
    if (UNICA(rede.tipo)) {
      if (!uf) erros.uf = 'Selecione o estado.';
      if (rede.tipo === 'municipal' && uf && !mun) erros.mun = 'Selecione o município.';
    } else if (!uf && !mun && !desc) {
      erros.desc = 'Informe um estado, um município ou uma descrição.';
    }
    q('ar-aviso').innerHTML = '';
    mostrarErros(erros);
    if (Object.keys(erros).length) return;

    const dados = { uf: uf || null, municipio_codigo: mun ? Number(mun) : null, descricao: UNICA(rede.tipo) ? null : (desc || null) };
    const botao = q('ar-salvar');
    botao.disabled = true;
    const consulta = editId
      ? SIPRO.db.from('redes_areas_atuacao').update(dados).eq('id', editId)
      : SIPRO.db.from('redes_areas_atuacao').insert({ rede_id: rede.id, ...dados });
    const { data, error } = await consulta.select('id');
    if (pagina !== pag) return;
    const falhar = (texto) => { q('ar-aviso').innerHTML = aviso(texto, 'erro'); botao.disabled = false; };
    if (error) return falhar(mensagemDeErro(error));
    if (!data || !data.length) return falhar('Nenhuma alteração foi salva. Verifique sua permissão e tente novamente.');
    await carregarAreas(editId ? 'Área de atuação atualizada.' : 'Área de atuação adicionada.');
  }

  async function remover(id) {
    const pag = pagina;
    const a = areas.find((x) => x.id === id);
    if (!a || !window.confirm(`Remover "${a.rotulo}" da área de atuação desta rede? A alteração fica registrada no histórico.`)) return;
    const { data, error } = await SIPRO.db.from('redes_areas_atuacao').delete().eq('id', id).select('id');
    if (pagina !== pag) return;
    if (error) return desenhar(mensagemDeErro(error), 'erro');
    if (!data || !data.length) return desenhar('Nenhuma alteração foi salva. Verifique sua permissão e tente novamente.', 'erro');
    await carregarAreas('Área removida.');
  }

  async function iniciar() {
    const pag = pagina;
    const [rEst, rRedes] = await Promise.all([
      SIPRO.db.from('estados').select('uf, nome').order('nome'),
      SIPRO.db.from('redes').select('id, nome, tipo, situacao').order('nome'),
    ]);
    if (pagina !== pag) return;
    if (rEst.error || rRedes.error) { pag.innerHTML = cabecalho() + aviso('Não foi possível carregar os dados.', 'erro'); return; }
    estados = rEst.data || [];
    redes = rRedes.data || [];
    if (!redes.length) {
      pag.innerHTML = cabecalho() +
        '<section class="bloco-vazio"><h3>Nenhuma rede cadastrada</h3><p>Cadastre a rede em Dados da Rede antes de informar a área de atuação.</p></section>' +
        '<div><a class="btn btn--sec" href="#/rede">Ir para Dados da Rede</a></div>';
      return;
    }
    rede = redes.find((r) => r.id === SIPRO.estado.redeId) || (redes.length === 1 ? redes[0] : null);
    SIPRO.estado.redeId = rede ? rede.id : null;
    if (rede) await carregarAreas(); else desenhar();
  }

  SIPRO.modulos['rede-area'] = {
    async render(el) {
      el.innerHTML = '<div class="pagina" id="rede-area-pagina"><p class="carregando-modulo" role="status">Carregando...</p></div>';
      const pag = (pagina = el.querySelector('#rede-area-pagina'));
      rede = null; areas = []; redes = []; cacheMunicipios = {};
      try {
        const { data, error } = await SIPRO.db.rpc('eh_admin');
        if (pagina !== pag) return;
        if (error) { pag.innerHTML = cabecalho() + aviso('Não foi possível verificar seu acesso. Recarregue a página.', 'erro'); return; }
        if (data !== true) {
          pag.innerHTML = cabecalho() + '<section class="bloco-vazio"><h3>Acesso restrito</h3><p>Esta área é destinada aos administradores do sistema.</p></section>';
          return;
        }
        await iniciar();
      } catch (_) {
        if (pagina === pag) pag.innerHTML = cabecalho() + aviso('Não foi possível abrir esta tela agora.', 'erro');
      }
    },
    destruir() { pagina = null; rede = null; areas = []; redes = []; cacheMunicipios = {}; },
  };
})();
