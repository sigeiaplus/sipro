/* SIPRO+ — Ambiente da rede › Centrais Administrativas (seção)
   Lista, cadastra e edita as centrais da rede aberta (public.redes_centrais).
   Estrutura confirmada no banco: várias centrais por rede; no máximo uma principal
   (índice único parcial redes_centrais_principal_uk); município obrigatório; CEP com 8 dígitos;
   RLS só para administrador; toda inclusão, alteração e exclusão vai para redes_historico.
   Toda operação usa o rede_id da rede aberta (amb.rede); nunca se opera por id isolado. */
(() => {
  'use strict';
  const SIPRO = window.SIPRO;
  const esc = SIPRO.ui.escapar;

  const COLUNAS = 'id, rede_id, nome, tipo, cep, logradouro, numero, complemento, bairro, municipio_codigo, principal';

  /* ---------- Máscara e validação ---------- */
  const soDigitos = (t) => String(t || '').replace(/\D/g, '');
  const mascaraCep = (t) => {
    const d = soDigitos(t).slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  };

  function validar(v) {
    const erros = {};
    const nome = v.nome.trim();
    if (!nome) erros.nome = 'Informe o nome da central.';
    const cep = soDigitos(v.cep);
    if (cep && cep.length !== 8) erros.cep = 'CEP inválido. Informe os 8 dígitos.';
    if (!v.uf) erros.uf = 'Selecione o estado.';
    if (v.uf && !v.municipio) erros.mun = 'Selecione o município.';
    const texto = (t) => t.trim() || null;
    return {
      erros,
      dados: {
        nome,
        tipo: texto(v.tipo),
        cep: cep || null,
        logradouro: texto(v.logradouro),
        numero: texto(v.numero),
        complemento: texto(v.complemento),
        bairro: texto(v.bairro),
        municipio_codigo: v.municipio ? Number(v.municipio) : null,
      },
    };
  }

  function mensagemDeErro(err) {
    if (err.code === '23505') return 'Já existe uma central principal nesta rede. Use "Definir como principal" na lista para trocar.';
    if (err.code === '23514') return 'CEP inválido. Informe os 8 dígitos.';
    if (err.code === '23503') return 'Município inválido. Selecione novamente.';
    if (err.code === '23502') return 'Preencha os campos obrigatórios.';
    if (err.code === '42501') return 'Você não tem permissão para esta operação.';
    return 'Não foi possível concluir agora. Tente novamente em instantes.';
  }

  /* ---------- Estado ---------- */
  let pagina = null;       // elemento da seção; null quando fechada
  let rede = null;         // rede aberta (sempre a do ambiente)
  let estados = [];
  let centrais = [];
  let locais = {};         // codigo_ibge -> { nome, uf }
  let cacheMunicipios = {};
  let cepAtual = '';       // CEP da última consulta; descarta respostas atrasadas

  const q = (id) => pagina.querySelector('#' + id);
  const aviso = (texto, tipo) => (texto ? `<div class="aviso ${tipo}" role="${tipo === 'erro' ? 'alert' : 'status'}">${esc(texto)}</div>` : '');
  const falhaSemEfeito = 'Nenhuma alteração foi salva. Verifique sua permissão e tente novamente.';

  /* ---------- Carregamento ---------- */
  function desenharErro(texto) {
    pagina.innerHTML = aviso(texto, 'erro') +
      '<div><button type="button" class="btn btn--sec" id="ce-retentar">Tentar novamente</button></div>';
    q('ce-retentar').addEventListener('click', () => iniciar());
  }

  async function carregar(msg, tipoMsg) {
    const pag = pagina;
    const { data, error } = await SIPRO.db.from('redes_centrais').select(COLUNAS).eq('rede_id', rede.id);
    if (pagina !== pag) return;
    if (error) return desenharErro('Não foi possível carregar as centrais.');
    const codigos = [...new Set((data || []).map((c) => c.municipio_codigo))];
    locais = {};
    if (codigos.length) {
      const r = await SIPRO.db.from('municipios').select('codigo_ibge, nome, uf').in('codigo_ibge', codigos);
      if (pagina !== pag) return;
      if (r.error) return desenharErro('Não foi possível carregar as centrais.');
      (r.data || []).forEach((m) => { locais[m.codigo_ibge] = { nome: m.nome, uf: m.uf }; });
    }
    centrais = (data || []).sort((a, b) => (b.principal - a.principal) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    desenharLista(msg, tipoMsg);
  }

  async function iniciar() {
    const pag = pagina;
    const { data, error } = await SIPRO.db.from('estados').select('uf, nome').order('nome');
    if (pagina !== pag) return;
    if (error) return desenharErro('Não foi possível carregar os dados.');
    estados = data || [];
    await carregar();
  }

  /* ---------- Lista ---------- */
  function enderecoDe(c) {
    const loc = locais[c.municipio_codigo];
    const rua = [c.logradouro, c.numero ? 'nº ' + c.numero : '', c.complemento].filter(Boolean).join(', ');
    const cidade = loc ? `${loc.nome}/${loc.uf}` : '';
    return [rua, c.bairro, cidade, c.cep ? 'CEP ' + mascaraCep(c.cep) : ''].filter(Boolean).join(' · ');
  }

  function desenharLista(msg, tipoMsg) {
    const itens = centrais.map((c) => `
      <li class="rede-item${c.principal ? ' rede-item--principal' : ''}">
        <div>
          <p class="rede-item__nome">${esc(c.nome)}${c.principal ? ' <span class="badge badge--ativa">Principal</span>' : ''}</p>
          <p class="rede-item__meta">${esc([c.tipo, enderecoDe(c)].filter(Boolean).join(' · ') || 'Endereço não informado')}</p>
        </div>
        <div class="rede-item__acoes">
          ${c.principal ? '' : `<button type="button" class="btn btn--sec" data-principal="${esc(c.id)}">Definir como principal</button>`}
          <button type="button" class="btn btn--sec" data-editar="${esc(c.id)}">Editar</button>
          <button type="button" class="btn btn--neutro" data-remover="${esc(c.id)}">Remover</button>
        </div>
      </li>`).join('');

    pagina.innerHTML = aviso(msg, tipoMsg) +
      (centrais.length
        ? `<ul class="rede-lista">${itens}</ul>`
        : '<section class="bloco-vazio"><h3>Nenhuma central cadastrada</h3><p>Use "Nova central" para cadastrar a primeira central administrativa desta rede.</p></section>') +
      '<div><button type="button" class="btn btn--sec" id="ce-nova">Nova central</button></div>';

    q('ce-nova').addEventListener('click', () => desenharForm(null));
    pagina.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () =>
      desenharForm(centrais.find((c) => c.id === b.dataset.editar) || null)));
    pagina.querySelectorAll('[data-principal]').forEach((b) => b.addEventListener('click', () => definirPrincipal(b.dataset.principal)));
    pagina.querySelectorAll('[data-remover]').forEach((b) => b.addEventListener('click', () => remover(b.dataset.remover)));
  }

  /* ---------- Formulário ---------- */
  const campo = (k, rot, html, cheio) =>
    `<div class="field${cheio ? ' field--cheio' : ''}" id="fc-${k}"><label for="ce-${k}">${rot}</label>${html}<p class="field__erro" id="ec-${k}"></p></div>`;
  const entrada = (k, valor, extra) => `<input id="ce-${k}" autocomplete="off" value="${esc(valor || '')}" ${extra || ''}>`;

  function desenharForm(central) {
    const c = central || {};
    const ufAtual = c.municipio_codigo && locais[c.municipio_codigo] ? locais[c.municipio_codigo].uf : '';
    const ufs = estados.map((e) => `<option value="${esc(e.uf)}"${e.uf === ufAtual ? ' selected' : ''}>${esc(e.nome)}</option>`).join('');
    const existePrincipal = centrais.some((x) => x.principal);

    pagina.innerHTML = `
      <form class="painel" id="ce-form" novalidate>
        <h3>${central ? 'Editar central' : 'Nova central'}</h3>
        <div id="ce-aviso"></div>
        <div class="form-grid">
          ${campo('nome', 'Nome da central *', entrada('nome', c.nome, 'maxlength="200"'), true)}
          ${campo('tipo', 'Tipo de central', entrada('tipo', c.tipo, 'maxlength="100"'), true)}
          ${campo('cep', 'CEP', entrada('cep', c.cep ? mascaraCep(c.cep) : '', 'inputmode="numeric" placeholder="00000-000"') + '<p class="field__info" id="ci-cep" role="status" aria-live="polite"></p>')}
          ${campo('logradouro', 'Logradouro', entrada('logradouro', c.logradouro, 'maxlength="200"'), true)}
          ${campo('numero', 'Número', entrada('numero', c.numero, 'maxlength="20"'))}
          ${campo('complemento', 'Complemento', entrada('complemento', c.complemento, 'maxlength="100"'))}
          ${campo('bairro', 'Bairro', entrada('bairro', c.bairro, 'maxlength="100"'), true)}
          ${campo('uf', 'Estado *', `<select id="ce-uf"><option value="">Selecione</option>${ufs}</select>`)}
          ${campo('mun', 'Município *', '<select id="ce-mun" disabled></select>')}
          ${central ? '' : `<div class="field field--cheio field--check"><label for="ce-principal"><input type="checkbox" id="ce-principal"${existePrincipal ? '' : ' checked'}> Definir como central principal${existePrincipal ? ' (substitui a principal atual)' : ''}</label></div>`}
        </div>
        <div class="form-acoes">
          <button type="submit" class="btn" id="ce-salvar">Salvar</button>
          <button type="button" class="btn btn--neutro" id="ce-cancelar">Cancelar</button>
        </div>
      </form>`;

    cepAtual = '';
    q('ce-cep').addEventListener('input', (e) => { e.target.value = mascaraCep(e.target.value); buscarCep(); });
    q('ce-uf').addEventListener('change', (e) => popularMunicipios(e.target.value, null));
    q('ce-cancelar').addEventListener('click', () => desenharLista());
    q('ce-form').addEventListener('submit', (e) => { e.preventDefault(); salvar(central); });
    popularMunicipios(ufAtual, c.municipio_codigo);
    q('ce-nome').focus();
  }

  async function popularMunicipios(uf, selecionado) {
    const pag = pagina;
    const sel = q('ce-mun');
    if (!uf) { sel.innerHTML = '<option value="">Selecione o estado primeiro</option>'; sel.disabled = true; return; }
    sel.disabled = true;
    sel.innerHTML = '<option value="">Carregando...</option>';
    if (!cacheMunicipios[uf]) {
      const { data, error } = await SIPRO.db.from('municipios').select('codigo_ibge, nome').eq('uf', uf).order('nome');
      if (pagina !== pag || !q('ce-uf') || q('ce-uf').value !== uf) return;
      if (error) { sel.innerHTML = '<option value="">Não foi possível carregar</option>'; return; }
      cacheMunicipios[uf] = data || [];
    }
    if (!q('ce-uf') || q('ce-uf').value !== uf) return;
    sel.innerHTML = '<option value="">Selecione o município</option>' + cacheMunicipios[uf].map((m) =>
      `<option value="${m.codigo_ibge}"${Number(selecionado) === m.codigo_ibge ? ' selected' : ''}>${esc(m.nome)}</option>`).join('');
    sel.disabled = false;
  }

  /** Busca o endereço pelo CEP (ViaCEP) assim que o 8º dígito é digitado.
      Preenche logradouro, bairro, estado e município; número e complemento ficam com o usuário.
      Se a consulta falhar, o preenchimento manual continua funcionando. */
  async function buscarCep() {
    const pag = pagina;
    const cep = soDigitos(q('ce-cep').value);
    const info = q('ci-cep');
    cepAtual = cep;
    if (cep.length !== 8) { info.textContent = ''; return; }
    info.textContent = 'Buscando endereço...';
    const aindaValido = () => pagina === pag && q('ci-cep') && cepAtual === cep;

    let dados;
    try {
      const ctl = new AbortController();
      const limite = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctl.signal });
      clearTimeout(limite);
      if (!r.ok) throw new Error('http');
      dados = await r.json();
    } catch (_) {
      if (aindaValido()) info.textContent = 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.';
      return;
    }
    if (!aindaValido()) return;
    if (!dados || dados.erro) { info.textContent = 'CEP não encontrado. Confira o número ou preencha o endereço manualmente.'; return; }

    if (dados.logradouro) q('ce-logradouro').value = String(dados.logradouro).slice(0, 200);
    if (dados.bairro) q('ce-bairro').value = String(dados.bairro).slice(0, 100);

    const uf = String(dados.uf || '');
    const ibge = Number(dados.ibge);
    if (!estados.some((e) => e.uf === uf)) { info.textContent = 'Endereço preenchido em parte. Selecione o estado e o município.'; return; }
    q('ce-uf').value = uf;
    await popularMunicipios(uf, ibge);
    if (!aindaValido()) return;
    ['uf', 'mun'].forEach((k) => { q('fc-' + k).classList.remove('erro'); q('ec-' + k).textContent = ''; });
    info.textContent = q('ce-mun').value === String(ibge)
      ? 'Endereço preenchido. Confira os dados e informe o número.'
      : 'Endereço preenchido, mas o município não foi localizado. Selecione-o manualmente.';
  }

  function mostrarErros(erros) {
    const chaves = ['nome', 'cep', 'uf', 'mun'];
    chaves.forEach((k) => {
      q('fc-' + k).classList.toggle('erro', !!erros[k]);
      q('ec-' + k).textContent = erros[k] || '';
    });
    const primeiro = chaves.find((k) => erros[k]);
    if (primeiro) q('ce-' + primeiro).focus();
  }

  /* ---------- Ações ---------- */
  async function salvar(central) {
    const pag = pagina;
    const { erros, dados } = validar({
      nome: q('ce-nome').value, tipo: q('ce-tipo').value, cep: q('ce-cep').value,
      logradouro: q('ce-logradouro').value, numero: q('ce-numero').value,
      complemento: q('ce-complemento').value, bairro: q('ce-bairro').value,
      uf: q('ce-uf').value, municipio: q('ce-mun').value,
    });
    q('ce-aviso').innerHTML = '';
    mostrarErros(erros);
    if (Object.keys(erros).length) return;

    const botao = q('ce-salvar');
    botao.disabled = true;
    const falhar = (texto) => {
      if (pagina !== pag || !q('ce-aviso')) return;
      q('ce-aviso').innerHTML = aviso(texto, 'erro');
      botao.disabled = false;
    };

    if (central) { // edição: nunca altera rede_id nem principal
      const { data, error } = await SIPRO.db.from('redes_centrais').update(dados).eq('id', central.id).eq('rede_id', rede.id).select('id');
      if (pagina !== pag) return;
      if (error) return falhar(mensagemDeErro(error));
      if (!data || !data.length) return falhar(falhaSemEfeito);
      return carregar('Central atualizada.', 'info');
    }

    const quer = q('ce-principal').checked;
    const atual = centrais.find((x) => x.principal);
    const direto = quer && !atual; // sem principal hoje: grava já como principal (uma única operação)
    const { data, error } = await SIPRO.db.from('redes_centrais').insert({ rede_id: rede.id, ...dados, principal: direto }).select('id');
    if (pagina !== pag) return;
    if (error) return falhar(mensagemDeErro(error));
    if (!data || !data.length) return falhar(falhaSemEfeito);
    if (quer && !direto) {
      const r = await trocarPrincipal(data[0].id, atual);
      if (pagina !== pag) return;
      if (r.erro) return carregar(`Central cadastrada, mas não foi possível torná-la a principal. ${r.erro}`, 'erro');
    }
    return carregar('Central cadastrada.', 'info');
  }

  /** Troca a principal mantendo a regra de uma só: primeiro libera a atual, depois marca a nova.
      Se a segunda etapa falhar, devolve a condição de principal à central anterior. */
  async function trocarPrincipal(novaId, atual) {
    const alvo = (id, valor) => SIPRO.db.from('redes_centrais').update({ principal: valor }).eq('id', id).eq('rede_id', rede.id).select('id');
    if (atual) {
      const a = await alvo(atual.id, false);
      if (a.error) return { erro: mensagemDeErro(a.error) };
      if (!a.data || !a.data.length) return { erro: falhaSemEfeito };
    }
    const n = await alvo(novaId, true);
    if (n.error || !n.data || !n.data.length) {
      if (atual) await alvo(atual.id, true); // desfaz: a rede não fica sem principal
      return { erro: n.error ? mensagemDeErro(n.error) : falhaSemEfeito };
    }
    return {};
  }

  async function definirPrincipal(id) {
    const pag = pagina;
    const nova = centrais.find((c) => c.id === id);
    if (!nova || nova.principal) return;
    const atual = centrais.find((c) => c.principal);
    if (atual && !window.confirm(`Definir "${nova.nome}" como central principal? "${atual.nome}" deixará de ser a principal.`)) return;
    pagina.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const r = await trocarPrincipal(id, atual);
    if (pagina !== pag) return;
    if (r.erro) return carregar(r.erro, 'erro');
    await carregar('Central principal atualizada.', 'info');
  }

  async function remover(id) {
    const pag = pagina;
    const c = centrais.find((x) => x.id === id);
    if (!c) return;
    if (c.principal && centrais.length > 1) {
      return desenharLista('Defina outra central como principal antes de remover esta.', 'erro');
    }
    if (!window.confirm(`Remover a central "${c.nome}"? A alteração fica registrada no histórico da rede.`)) return;
    const { data, error } = await SIPRO.db.from('redes_centrais').delete().eq('id', id).eq('rede_id', rede.id).select('id');
    if (pagina !== pag) return;
    if (error) return desenharLista(mensagemDeErro(error), 'erro');
    if (!data || !data.length) return desenharLista(falhaSemEfeito, 'erro');
    await carregar('Central removida.', 'info');
  }

  SIPRO.modulos['rede-centrais'] = {
    async render(el, amb) {
      pagina = el;
      rede = amb.rede;
      estados = []; centrais = []; locais = {}; cacheMunicipios = {};
      el.innerHTML = SIPRO.ui.carregando();
      try {
        await iniciar();
      } catch (_) {
        if (pagina === el) el.innerHTML = aviso('Não foi possível abrir esta tela agora.', 'erro');
      }
    },
    destruir() { pagina = null; rede = null; estados = []; centrais = []; locais = {}; cacheMunicipios = {}; },
  };
})();
