/* SIPRO+ — Campos personalizados: caixa suspensa, data e hora.
   Troca todo <select>, <input type="date"> e <input type="time"> pelo visual do sistema.
   O campo nativo continua no DOM (escondido), então .value, change, input, disabled, required, min/max
   e as opções carregadas depois (ex.: municípios) continuam funcionando sem mudar o código das telas.
   Para manter um campo nativo em algum lugar, use o atributo data-nativo. */
(() => {
  'use strict';
  const SIPRO = (window.SIPRO = window.SIPRO || { modulos: {} });
  if (SIPRO.campos) return;

  const SELETOR = 'select, input[type="date"], input[type="time"]';
  const MIN_PESQUISA = 10; // a lista ganha campo de pesquisa a partir deste número de opções

  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

  const ICO = {
    seta: '<path d="m6 9 6 6 6-6"/>',
    cal: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    esq: '<path d="m15 18-6-6 6-6"/>',
    dir: '<path d="m9 18 6-6-6-6"/>',
    fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  };
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const el = (tag, cls, texto) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  };
  const semAcento = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const pad = (n) => String(n).padStart(2, '0');
  const mobile = () => window.matchMedia('(max-width: 860px)').matches;
  const disparar = (c) => {
    c.dispatchEvent(new Event('input', { bubbles: true }));
    c.dispatchEvent(new Event('change', { bubbles: true }));
  };
  let uid = 0;
  const feitos = new WeakSet();

  /** Rótulo associado ao campo (para leitor de tela e para o título da folha no celular). */
  function rotuloDe(c) {
    const l = c.labels && c.labels[0];
    if (!l) return { id: '', texto: c.getAttribute('aria-label') || '' };
    if (!l.id) l.id = `cx-rot-${++uid}`;
    return { id: l.id, texto: l.textContent.trim() };
  }

  /** Faz o campo nativo avisar quando o código da tela troca .value / .selectedIndex.
      Devolve um setter que muda o valor sem avisar (uso interno). */
  function vigiar(c, prop, proto, aoMudar) {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    Object.defineProperty(c, prop, {
      configurable: true,
      enumerable: d.enumerable,
      get() { return d.get.call(this); },
      set(v) { d.set.call(this, v); aoMudar(); },
    });
    return (v) => d.set.call(c, v);
  }

  function esconderNativo(c) {
    c.classList.add('cx__nativo');
    c.tabIndex = -1;
    c.setAttribute('aria-hidden', 'true');
  }

  /* =====================================================
     Painel flutuante (lista, calendário, hora)
     Fica dentro do mesmo ambiente do campo, para herdar a escala (zoom) da tela;
     no celular vira uma folha que sobe de baixo.
     ===================================================== */
  let atual = null; // { pop, scrim, ancora, foco, gatilho, folha, larguraAncora, aoFechar }

  function posicionar() {
    if (!atual || atual.folha) return;
    if (!atual.ancora.isConnected) { fecharPopup(false); return; }
    const { pop, ancora } = atual;
    const r = ancora.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { fecharPopup(false); return; }
    const w = ancora.offsetWidth;
    const z = w ? r.width / w : 1; // fator de escala do ambiente (zoom 0.85 no desktop)
    if (atual.larguraAncora) pop.style.minWidth = `${w}px`;
    pop.style.maxHeight = '';
    pop.style.left = '0px';
    pop.style.top = '0px';
    const abaixo = window.innerHeight - r.bottom - 12;
    const acima = r.top - 12;
    const emBaixo = pop.offsetHeight * z <= abaixo || abaixo >= acima;
    pop.style.maxHeight = `${Math.max(120, emBaixo ? abaixo : acima) / z}px`;
    const alt = pop.offsetHeight * z;
    const larg = pop.offsetWidth * z;
    const topo = emBaixo ? r.bottom + 6 : r.top - 6 - alt;
    let esq = r.left;
    if (esq + larg > window.innerWidth - 8) esq = Math.max(8, window.innerWidth - 8 - larg);
    // Calibra medindo onde o painel realmente ficou (funciona com ou sem zoom, em qualquer versão do Chrome).
    let cl = esq / z;
    let ct = topo / z;
    for (let i = 0; i < 2; i++) {
      pop.style.left = `${cl}px`;
      pop.style.top = `${ct}px`;
      const p = pop.getBoundingClientRect();
      const dx = p.left - esq;
      const dy = p.top - topo;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
      cl -= dx / z;
      ct -= dy / z;
    }
  }

  const aoRolar = (e) => {
    if (e && e.target && atual && e.target.nodeType === 1 && atual.pop.contains(e.target)) return;
    posicionar();
  };
  const aoPonteiro = (e) => {
    if (!atual) return;
    if (atual.scrim && e.target === atual.scrim) return; // o clique no fundo fecha pelo próprio fundo
    if (atual.pop.contains(e.target) || atual.ancora.contains(e.target)) return;
    fecharPopup(false);
  };
  const aoEscape = (e) => {
    if (e.key !== 'Escape' || !atual) return;
    e.preventDefault();
    e.stopPropagation();
    fecharPopup(true);
  };

  function fecharPopup(devolverFoco = true) {
    if (!atual) return;
    const a = atual;
    atual = null;
    document.removeEventListener('pointerdown', aoPonteiro, true);
    document.removeEventListener('keydown', aoEscape, true);
    window.removeEventListener('resize', aoRolar);
    window.removeEventListener('scroll', aoRolar, true);
    a.pop.remove();
    if (a.scrim) a.scrim.remove();
    a.gatilho.setAttribute('aria-expanded', 'false');
    if (a.aoFechar) a.aoFechar();
    if (devolverFoco && a.foco && a.foco.isConnected) a.foco.focus();
  }

  function abrirPopup(cfg) {
    fecharPopup(false);
    const folha = mobile();
    const pop = el('div', `cx-pop ${cfg.classe || ''}${folha ? ' cx-pop--folha' : ''}`);
    if (cfg.papel) pop.setAttribute('role', cfg.papel);
    if (cfg.papel) pop.setAttribute('aria-label', cfg.titulo);
    let scrim = null;
    const cab = el('div', 'cx-pop__cab');
    cab.append(el('strong', '', cfg.titulo));
    const x = el('button', 'cx-pop__fechar');
    x.type = 'button';
    x.setAttribute('aria-label', 'Fechar');
    x.innerHTML = svg(ICO.fechar);
    x.addEventListener('click', () => fecharPopup(true));
    cab.append(x);
    pop.append(cab, cfg.conteudo);
    if (folha) {
      scrim = el('div', 'cx-scrim');
      scrim.addEventListener('click', () => fecharPopup(true));
      document.body.append(scrim, pop);
    } else {
      (cfg.ancora.closest('.app') || document.body).append(pop);
    }
    atual = { pop, scrim, ancora: cfg.ancora, foco: cfg.foco, gatilho: cfg.gatilho, folha, larguraAncora: !!cfg.larguraAncora, aoFechar: cfg.aoFechar };
    cfg.gatilho.setAttribute('aria-expanded', 'true');
    posicionar();
    document.addEventListener('pointerdown', aoPonteiro, true);
    document.addEventListener('keydown', aoEscape, true);
    if (!folha) {
      window.addEventListener('resize', aoRolar);
      window.addEventListener('scroll', aoRolar, true);
    }
    return atual;
  }

  /* =====================================================
     Caixa suspensa (<select>)
     ===================================================== */
  function criarSelect(sel) {
    const n = ++uid;
    const rot = rotuloDe(sel);
    const wrap = el('div', 'cx');
    const gatilho = el('button', 'cx__gatilho');
    gatilho.type = 'button';
    gatilho.setAttribute('role', 'combobox');
    gatilho.setAttribute('aria-haspopup', 'listbox');
    gatilho.setAttribute('aria-expanded', 'false');
    gatilho.setAttribute('aria-controls', `cx-lista-${n}`);
    const valor = el('span', 'cx__valor');
    valor.id = `cx-valor-${n}`;
    const seta = el('span', 'cx__seta');
    seta.innerHTML = svg(ICO.seta);
    gatilho.append(valor, seta);
    gatilho.setAttribute('aria-labelledby', `${rot.id ? `${rot.id} ` : ''}${valor.id}`);

    sel.parentNode.insertBefore(wrap, sel);
    wrap.append(gatilho, sel);
    esconderNativo(sel);

    let manipulador = null; // teclado da lista, enquanto ela está aberta
    let ignorarEspaco = false;

    function atualizar() {
      const o = sel.options[sel.selectedIndex];
      const vazio = !o || o.value === '';
      valor.textContent = o && o.text.trim() ? o.text : 'Selecione';
      valor.classList.toggle('cx__valor--vazio', vazio);
      gatilho.disabled = sel.disabled;
      wrap.hidden = sel.hidden;
    }
    vigiar(sel, 'value', HTMLSelectElement.prototype, atualizar);
    vigiar(sel, 'selectedIndex', HTMLSelectElement.prototype, atualizar);
    sel.addEventListener('change', atualizar);
    sel.addEventListener('focus', () => gatilho.focus());
    if (sel.form) sel.form.addEventListener('reset', () => setTimeout(atualizar));
    new MutationObserver(() => {
      atualizar();
      if (atual && atual.sel === sel && atual.renderizar) atual.renderizar();
    }).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'label'] });
    atualizar();

    function abrir() {
      if (gatilho.disabled) return;
      const folha = mobile();
      const temBusca = sel.options.length >= MIN_PESQUISA;
      const caixa = el('div', 'cx-lista');
      let busca = null;
      if (temBusca) {
        const bw = el('div', 'cx-busca');
        const ico = el('span', 'cx-busca__ico');
        ico.innerHTML = svg(ICO.busca);
        busca = el('input');
        busca.type = 'text';
        busca.placeholder = 'Pesquisar...';
        busca.autocomplete = 'off';
        busca.spellcheck = false;
        busca.setAttribute('aria-label', 'Pesquisar na lista');
        bw.append(ico, busca);
        caixa.append(bw);
      }
      const ul = el('ul', 'cx-opcoes');
      ul.id = `cx-lista-${n}`;
      ul.setAttribute('role', 'listbox');
      if (rot.id) ul.setAttribute('aria-labelledby', rot.id);
      const msg = el('div', 'cx-vazio', 'Nenhum resultado encontrado.');
      msg.hidden = true;
      caixa.append(ul, msg);
      const dono = busca && !folha ? busca : gatilho; // quem mantém o foco enquanto a lista está aberta

      let itens = [];
      let ativo = -1;
      let buffer = '';
      let tBuffer = null;
      const desab = (li) => li.getAttribute('aria-disabled') === 'true';

      function marcar(i, rolar) {
        if (itens[ativo]) itens[ativo].classList.remove('cx-opcao--ativa');
        ativo = i;
        const li = itens[i];
        if (!li) { dono.removeAttribute('aria-activedescendant'); return; }
        li.classList.add('cx-opcao--ativa');
        dono.setAttribute('aria-activedescendant', li.id);
        if (rolar) {
          const t = li.offsetTop;
          const b = t + li.offsetHeight;
          if (t < ul.scrollTop) ul.scrollTop = Math.max(0, t - 6);
          else if (b > ul.scrollTop + ul.clientHeight) ul.scrollTop = b - ul.clientHeight + 6;
        }
      }

      function desenhar(filtro) {
        const f = semAcento((filtro || '').trim());
        ul.textContent = '';
        itens = [];
        ativo = -1;
        let grupo = null;
        sel.querySelectorAll('option').forEach((o) => {
          const vazia = o.value === '';
          const txt = o.text.trim() || (vazia ? 'Selecione' : '');
          if (f && (vazia || !semAcento(txt).includes(f))) return;
          const g = o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement : null;
          if (g !== grupo) {
            grupo = g;
            if (g) {
              const h = el('li', 'cx-grupo', g.label);
              h.setAttribute('role', 'presentation');
              ul.append(h);
            }
          }
          const li = el('li', `cx-opcao${vazia ? ' cx-opcao--vazia' : ''}`, txt);
          li.id = `cx-${n}-${itens.length}`;
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', o.selected ? 'true' : 'false');
          if (o.disabled || (g && g.disabled)) li.setAttribute('aria-disabled', 'true');
          li._opcao = o;
          ul.append(li);
          itens.push(li);
        });
        msg.hidden = itens.length > 0;
        let i = f ? -1 : itens.findIndex((li) => li._opcao.selected && !desab(li));
        if (i < 0) i = itens.findIndex((li) => !desab(li));
        marcar(i, false);
      }

      function selecionar(li) {
        if (!li || desab(li)) return;
        const o = li._opcao;
        const mudou = sel.selectedIndex !== o.index;
        if (mudou) sel.selectedIndex = o.index;
        fecharPopup(true);
        if (mudou) disparar(sel);
      }

      function mover(d) {
        let i = ativo;
        do { i += d; } while (i >= 0 && i < itens.length && desab(itens[i]));
        if (i >= 0 && i < itens.length) marcar(i, true);
      }

      function digitar(k) {
        buffer += semAcento(k);
        clearTimeout(tBuffer);
        tBuffer = setTimeout(() => { buffer = ''; }, 700);
        const i = itens.findIndex((li) => !desab(li) && semAcento(li.textContent).startsWith(buffer));
        if (i >= 0) marcar(i, true);
      }

      manipulador = (e) => {
        const k = e.key;
        if (k === 'ArrowDown') mover(1);
        else if (k === 'ArrowUp') mover(-1);
        else if ((k === 'Home' || k === 'End') && e.target !== busca) {
          const idx = k === 'Home' ? itens.findIndex((li) => !desab(li)) : itens.map(desab).lastIndexOf(false);
          if (idx >= 0) marcar(idx, true);
        } else if (k === 'Enter' || (k === ' ' && e.target !== busca && !buffer)) {
          if (k === ' ') ignorarEspaco = true;
          selecionar(itens[ativo]);
        } else if (k === 'Tab') { fecharPopup(true); return; }
        else if (k.length === 1 && !busca && !e.ctrlKey && !e.metaKey && !e.altKey) digitar(k);
        else return;
        e.preventDefault();
      };

      ul.addEventListener('click', (e) => {
        const li = e.target.closest('.cx-opcao');
        if (li) selecionar(li);
      });
      ul.addEventListener('mousemove', (e) => {
        const li = e.target.closest('.cx-opcao');
        const i = itens.indexOf(li);
        if (li && i !== ativo && !desab(li)) marcar(i, false);
      });
      ul.addEventListener('mousedown', (e) => e.preventDefault()); // não tira o foco do campo
      if (busca) {
        busca.addEventListener('input', () => { desenhar(busca.value); posicionar(); });
        busca.addEventListener('keydown', (e) => manipulador && manipulador(e));
      }

      desenhar('');
      const a = abrirPopup({
        ancora: wrap, foco: gatilho, gatilho, conteudo: caixa, titulo: rot.texto || 'Selecionar',
        larguraAncora: true, classe: 'cx-pop--lista', aoFechar: () => { manipulador = null; clearTimeout(tBuffer); },
      });
      a.sel = sel;
      a.renderizar = () => { desenhar(busca ? busca.value : ''); posicionar(); };
      marcar(ativo, true);
      if (busca && !folha) busca.focus();
    }

    gatilho.addEventListener('click', () => {
      if (atual && atual.gatilho === gatilho) fecharPopup(true); else abrir();
    });
    gatilho.addEventListener('keydown', (e) => {
      if (manipulador) manipulador(e);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); abrir(); }
    });
    gatilho.addEventListener('keyup', (e) => {
      if (e.key === ' ' && ignorarEspaco) { e.preventDefault(); ignorarEspaco = false; }
    });
  }

  /* =====================================================
     Campo de texto com máscara + botão (base de data e hora)
     ===================================================== */
  function campoTexto(inp, cfg) {
    const n = ++uid;
    const rot = rotuloDe(inp);
    const wrap = el('div', `cx ${cfg.classe}`);
    const texto = el('input', 'cx__texto');
    texto.type = 'text';
    texto.inputMode = 'numeric';
    texto.autocomplete = 'off';
    texto.spellcheck = false;
    texto.placeholder = cfg.placeholder;
    texto.maxLength = cfg.tam;
    texto.id = `cx-texto-${n}`;
    if (rot.id) texto.setAttribute('aria-labelledby', rot.id);
    if (inp.required) texto.setAttribute('aria-required', 'true');
    const botao = el('button', 'cx__icone');
    botao.type = 'button';
    botao.innerHTML = svg(cfg.icone);
    botao.setAttribute('aria-label', cfg.rotuloBotao);
    botao.setAttribute('aria-haspopup', 'dialog');
    botao.setAttribute('aria-expanded', 'false');

    inp.parentNode.insertBefore(wrap, inp);
    wrap.append(texto, botao, inp);
    esconderNativo(inp);

    function marcarInvalido(sim, msg) {
      texto.setAttribute('aria-invalid', sim ? 'true' : 'false');
      wrap.classList.toggle('cx--invalido', !!sim);
      inp.setCustomValidity(sim ? msg || 'Valor inválido.' : '');
    }
    function atualizarTexto() {
      texto.value = cfg.formatar(inp.value);
      marcarInvalido(false);
    }
    const setNativo = vigiar(inp, 'value', HTMLInputElement.prototype, atualizarTexto);
    function definir(v) {
      if (inp.value === v) return;
      setNativo(v);
      disparar(inp);
    }
    function sincronizar() {
      texto.disabled = inp.disabled;
      botao.disabled = inp.disabled;
      wrap.hidden = inp.hidden;
    }

    texto.addEventListener('input', () => {
      texto.value = cfg.mascara(texto.value);
      const t = texto.value;
      if (t.length < cfg.tam) { definir(''); marcarInvalido(false); return; }
      const r = cfg.interpretar(t);
      if (r.valor != null) { definir(r.valor); marcarInvalido(false); } else { definir(''); marcarInvalido(true, r.erro); }
    });
    texto.addEventListener('blur', () => {
      if (texto.value && texto.value.length < cfg.tam) marcarInvalido(true, cfg.incompleto);
    });
    inp.addEventListener('focus', () => texto.focus());
    inp.addEventListener('change', atualizarTexto);
    if (inp.form) inp.form.addEventListener('reset', () => setTimeout(atualizarTexto));
    new MutationObserver(sincronizar).observe(inp, { attributes: true, attributeFilter: ['disabled', 'hidden'] });
    sincronizar();
    atualizarTexto();

    return { wrap, texto, botao, rot, definir, marcarInvalido };
  }

  /* =====================================================
     Data (<input type="date">) — calendário em português
     ===================================================== */
  const diasNoMes = (a, m) => new Date(a, m, 0).getDate();
  const diaSemana = (o) => new Date(o.a, o.m - 1, o.d).getDay();
  const dataReal = (a, m, d) => a >= 1000 && m >= 1 && m <= 12 && d >= 1 && d <= diasNoMes(a, m);
  const cmpData = (x, y) => x.a - y.a || x.m - y.m || x.d - y.d;
  const isoData = (o) => `${String(o.a).padStart(4, '0')}-${pad(o.m)}-${pad(o.d)}`;
  const lerIso = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? { a: +m[1], m: +m[2], d: +m[3] } : null;
  };
  const textoData = (o) => (o ? `${pad(o.d)}/${pad(o.m)}/${String(o.a).padStart(4, '0')}` : '');
  const somarDias = (o, n) => {
    const dt = new Date(o.a, o.m - 1, o.d + n);
    return { a: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  };
  const somarMeses = (o, n) => {
    const idx = o.a * 12 + (o.m - 1) + n;
    const a = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    return { a, m, d: Math.min(o.d, diasNoMes(a, m)) };
  };
  const hojeData = () => {
    const d = new Date();
    return { a: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  };

  function criarData(inp) {
    const lim = () => ({ min: lerIso(inp.min), max: lerIso(inp.max) });
    const fora = (o) => {
      const { min, max } = lim();
      return !!((min && cmpData(o, min) < 0) || (max && cmpData(o, max) > 0));
    };
    const ajustar = (o) => {
      const { min, max } = lim();
      if (min && cmpData(o, min) < 0) return { ...min };
      if (max && cmpData(o, max) > 0) return { ...max };
      return o;
    };

    const c = campoTexto(inp, {
      classe: 'cx--data', placeholder: 'dd/mm/aaaa', tam: 10, icone: ICO.cal, rotuloBotao: 'Abrir calendário',
      incompleto: 'Data incompleta.',
      mascara: (t) => {
        const d = t.replace(/\D/g, '').slice(0, 8);
        let r = d.slice(0, 2);
        if (d.length > 2) r += `/${d.slice(2, 4)}`;
        if (d.length > 4) r += `/${d.slice(4)}`;
        return r;
      },
      formatar: (v) => textoData(lerIso(v)),
      interpretar: (t) => {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
        const o = m && { d: +m[1], m: +m[2], a: +m[3] };
        if (!o || !dataReal(o.a, o.m, o.d)) return { erro: 'Data inválida.' };
        if (fora(o)) return { erro: 'Data fora do período permitido.' };
        return { valor: isoData(o) };
      },
    });
    const { wrap, texto, botao, rot } = c;

    function abrir() {
      if (texto.disabled) return;
      const selecionada = lerIso(inp.value);
      const hoje = hojeData();
      let foco = ajustar(selecionada || hoje);
      let vis = { a: foco.a, m: foco.m };
      let modo = 'dias';
      const raiz = el('div', 'cx-cal');

      const btn = (cls, rotulo, alvo, fn) => {
        const b = el('button', cls);
        b.type = 'button';
        if (rotulo) b.setAttribute('aria-label', rotulo);
        if (alvo) b.dataset.alvo = alvo;
        b.addEventListener('click', fn);
        return b;
      };
      const cabecalho = (titulo, o) => {
        const cab = el('div', 'cx-cal__cab');
        const p = btn('cx-cal__nav', o.rp, 'prev', o.prev);
        p.innerHTML = svg(ICO.esq);
        p.disabled = !!o.prevOff;
        let t;
        if (o.aoTitulo) { t = btn('cx-cal__titulo', o.rt, 'titulo', o.aoTitulo); t.textContent = titulo; } else t = el('span', 'cx-cal__titulo cx-cal__titulo--fixo', titulo);
        const nx = btn('cx-cal__nav', o.rn, 'next', o.next);
        nx.innerHTML = svg(ICO.dir);
        nx.disabled = !!o.nextOff;
        cab.append(p, t, nx);
        return cab;
      };
      const escolher = (o) => {
        if (fora(o)) return;
        c.definir(isoData(o));
        texto.value = textoData(o);
        c.marcarInvalido(false);
        fecharPopup(true);
      };

      function renderDias() {
        const { min, max } = lim();
        const total = diasNoMes(vis.a, vis.m);
        const desab = (d) => fora({ a: vis.a, m: vis.m, d });
        let d0 = Math.min(foco.a === vis.a && foco.m === vis.m ? foco.d : 1, total);
        if (desab(d0)) { d0 = 1; while (d0 < total && desab(d0)) d0++; }
        foco = { a: vis.a, m: vis.m, d: d0 };
        const ant = somarMeses({ a: vis.a, m: vis.m, d: 1 }, -1);
        const prox = somarMeses({ a: vis.a, m: vis.m, d: 1 }, 1);
        raiz.append(cabecalho(`${MESES[vis.m - 1]} ${vis.a}`, {
          rp: 'Mês anterior', rn: 'Próximo mês', rt: 'Escolher mês e ano',
          prev: () => { vis = { a: ant.a, m: ant.m }; render('prev'); },
          next: () => { vis = { a: prox.a, m: prox.m }; render('next'); },
          aoTitulo: () => { modo = 'meses'; render('item'); },
          prevOff: min && cmpData({ a: ant.a, m: ant.m, d: diasNoMes(ant.a, ant.m) }, min) < 0,
          nextOff: max && cmpData({ a: prox.a, m: prox.m, d: 1 }, max) > 0,
        }));
        const grade = el('div', 'cx-dias');
        grade.setAttribute('role', 'grid');
        grade.setAttribute('aria-label', `${MESES[vis.m - 1]} de ${vis.a}`);
        const sem = el('div', 'cx-semana');
        sem.setAttribute('role', 'row');
        DIAS.forEach((l, i) => {
          const s = el('span', '', l);
          s.setAttribute('role', 'columnheader');
          s.setAttribute('aria-label', DIAS_LONGOS[i]);
          sem.append(s);
        });
        grade.append(sem);
        const ini = diaSemana({ a: vis.a, m: vis.m, d: 1 });
        let linha = null;
        for (let i = 0; i < ini + total; i++) {
          if (i % 7 === 0) { linha = el('div', 'cx-linha'); linha.setAttribute('role', 'row'); grade.append(linha); }
          if (i < ini) { linha.append(el('span', 'cx-nada')); continue; }
          const d = i - ini + 1;
          const eh = (o) => o && o.a === vis.a && o.m === vis.m && o.d === d;
          const b = el('button', `cx-dia${eh(hoje) ? ' cx-dia--hoje' : ''}`, String(d));
          b.type = 'button';
          b.setAttribute('role', 'gridcell');
          b.setAttribute('aria-label', `${d} de ${MESES[vis.m - 1].toLowerCase()} de ${vis.a}`);
          b.setAttribute('aria-selected', eh(selecionada) ? 'true' : 'false');
          if (eh(hoje)) b.setAttribute('aria-current', 'date');
          b.tabIndex = d === foco.d ? 0 : -1;
          b.dataset.dia = d;
          b.disabled = desab(d);
          b.addEventListener('click', () => escolher({ a: vis.a, m: vis.m, d }));
          linha.append(b);
        }
        raiz.append(grade);
        const rodape = el('div', 'cx-cal__rodape');
        const bh = btn('', '', 'hoje', () => escolher(hoje));
        bh.textContent = 'Hoje';
        bh.disabled = fora(hoje);
        rodape.append(bh);
        if (!inp.required) {
          const bl = btn('', '', 'limpar', () => {
            c.definir('');
            texto.value = '';
            c.marcarInvalido(false);
            fecharPopup(true);
          });
          bl.textContent = 'Limpar';
          rodape.append(bl);
        }
        raiz.append(rodape);
      }

      function renderMeses() {
        const { min, max } = lim();
        raiz.append(cabecalho(String(vis.a), {
          rp: 'Ano anterior', rn: 'Próximo ano', rt: 'Escolher ano',
          prev: () => { vis.a -= 1; render('prev'); },
          next: () => { vis.a += 1; render('next'); },
          aoTitulo: () => { modo = 'anos'; render('item'); },
          prevOff: min && vis.a <= min.a,
          nextOff: max && vis.a >= max.a,
        }));
        const grade = el('div', 'cx-grade');
        const desab = (m) => (min && cmpData({ a: vis.a, m, d: diasNoMes(vis.a, m) }, min) < 0) || (max && cmpData({ a: vis.a, m, d: 1 }, max) > 0);
        let tab = desab(vis.m) ? MESES_CURTOS.findIndex((_, i) => !desab(i + 1)) + 1 : vis.m;
        if (tab < 1) tab = vis.m;
        MESES_CURTOS.forEach((nome, i) => {
          const m = i + 1;
          const b = el('button', 'cx-grade__op', nome);
          b.type = 'button';
          b.setAttribute('aria-label', `${MESES[i]} de ${vis.a}`);
          b.setAttribute('aria-pressed', selecionada && selecionada.a === vis.a && selecionada.m === m ? 'true' : 'false');
          b.tabIndex = m === tab ? 0 : -1;
          b.disabled = !!desab(m);
          b.addEventListener('click', () => {
            vis.m = m;
            foco = { a: vis.a, m, d: Math.min(foco.d, diasNoMes(vis.a, m)) };
            modo = 'dias';
            render('dia');
          });
          grade.append(b);
        });
        raiz.append(grade);
      }

      function renderAnos() {
        const { min, max } = lim();
        const ini = Math.floor(vis.a / 12) * 12;
        raiz.append(cabecalho(`${ini} – ${ini + 11}`, {
          rp: 'Anos anteriores', rn: 'Próximos anos',
          prev: () => { vis.a -= 12; render('prev'); },
          next: () => { vis.a += 12; render('next'); },
          prevOff: min && ini <= min.a,
          nextOff: max && ini + 11 >= max.a,
        }));
        const grade = el('div', 'cx-grade');
        const desab = (y) => (min && y < min.a) || (max && y > max.a);
        let tab = vis.a >= ini && vis.a <= ini + 11 && !desab(vis.a) ? vis.a : -1;
        for (let y = ini; tab < 0 && y <= ini + 11; y++) if (!desab(y)) tab = y;
        for (let y = ini; y <= ini + 11; y++) {
          const b = el('button', 'cx-grade__op', String(y));
          b.type = 'button';
          b.setAttribute('aria-pressed', selecionada && selecionada.a === y ? 'true' : 'false');
          b.tabIndex = y === tab ? 0 : -1;
          b.disabled = !!desab(y);
          b.addEventListener('click', () => { vis.a = y; modo = 'meses'; render('item'); });
          grade.append(b);
        }
        raiz.append(grade);
      }

      function render(alvo) {
        raiz.textContent = '';
        if (modo === 'dias') renderDias(); else if (modo === 'meses') renderMeses(); else renderAnos();
        if (!alvo || !raiz.isConnected) return;
        let f = alvo === 'dia' || alvo === 'item' ? raiz.querySelector('[tabindex="0"]') : raiz.querySelector(`[data-alvo="${alvo}"]`);
        if (!f || f.disabled) f = raiz.querySelector('[tabindex="0"]');
        if (f) f.focus();
      }

      raiz.addEventListener('keydown', (e) => {
        const dia = e.target.closest && e.target.closest('[data-dia]');
        if (modo === 'dias' && dia) {
          let novo = null;
          const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
          if (passo) novo = somarDias(foco, passo);
          else if (e.key === 'Home') novo = somarDias(foco, -diaSemana(foco));
          else if (e.key === 'End') novo = somarDias(foco, 6 - diaSemana(foco));
          else if (e.key === 'PageUp') novo = somarMeses(foco, e.shiftKey ? -12 : -1);
          else if (e.key === 'PageDown') novo = somarMeses(foco, e.shiftKey ? 12 : 1);
          if (!novo) return;
          e.preventDefault();
          foco = ajustar(novo);
          vis = { a: foco.a, m: foco.m };
          render('dia');
          return;
        }
        const op = e.target.closest && e.target.closest('.cx-grade__op');
        if (op) {
          const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
          if (!passo) return;
          e.preventDefault();
          const todos = [...raiz.querySelectorAll('.cx-grade__op')];
          let j = todos.indexOf(op) + passo;
          while (j >= 0 && j < todos.length && todos[j].disabled) j += passo;
          if (j >= 0 && j < todos.length) {
            op.tabIndex = -1;
            todos[j].tabIndex = 0;
            todos[j].focus();
          }
        }
      });

      render();
      abrirPopup({
        ancora: wrap, foco: texto, gatilho: botao, conteudo: raiz, papel: 'dialog',
        titulo: rot.texto || 'Escolher data', classe: 'cx-pop--cal',
      });
      render('dia');
    }

    botao.addEventListener('click', () => {
      if (atual && atual.gatilho === botao) fecharPopup(true); else abrir();
    });
    texto.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); abrir(); }
    });
  }

  /* =====================================================
     Hora (<input type="time">)
     ===================================================== */
  const lerHora = (s) => {
    const m = /^(\d{2}):(\d{2})/.exec(s || '');
    return m ? { h: +m[1], m: +m[2] } : null;
  };

  function criarHora(inp) {
    const c = campoTexto(inp, {
      classe: 'cx--hora', placeholder: 'hh:mm', tam: 5, icone: ICO.relogio, rotuloBotao: 'Abrir seletor de hora',
      incompleto: 'Hora incompleta.',
      mascara: (t) => {
        const d = t.replace(/\D/g, '').slice(0, 4);
        return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
      },
      formatar: (v) => {
        const h = lerHora(v);
        return h ? `${pad(h.h)}:${pad(h.m)}` : '';
      },
      interpretar: (t) => {
        const h = lerHora(t);
        return h && h.h < 24 && h.m < 60 ? { valor: `${pad(h.h)}:${pad(h.m)}` } : { erro: 'Hora inválida.' };
      },
    });
    const { wrap, texto, botao, rot } = c;

    function abrir() {
      if (texto.disabled) return;
      let cur = lerHora(inp.value);
      const passoMin = Math.max(1, Math.round((parseFloat(inp.step) || 60) / 60));
      const raiz = el('div', 'cx-hora');
      const colunas = {};

      const aplicar = () => {
        const v = `${pad(cur.h)}:${pad(cur.m)}`;
        c.definir(v);
        texto.value = v;
        c.marcarInvalido(false);
        marcar();
      };
      const coluna = (titulo, tipo, qtd, passo) => {
        const col = el('div', 'cx-hora__col');
        col.setAttribute('role', 'group');
        col.setAttribute('aria-label', titulo);
        const lista = el('div', 'cx-hora__lista');
        for (let i = 0; i < qtd; i += passo) {
          const b = el('button', 'cx-hora__op', pad(i));
          b.type = 'button';
          b.dataset.v = i;
          b.addEventListener('click', () => {
            cur = cur || { h: 0, m: 0 };
            cur[tipo] = i;
            aplicar();
          });
          lista.append(b);
        }
        col.append(el('div', 'cx-hora__tit', titulo), lista);
        colunas[tipo] = lista;
        return col;
      };
      function marcar() {
        ['h', 'm'].forEach((t) => {
          const botoes = [...colunas[t].children];
          let tab = botoes.find((b) => cur && +b.dataset.v === cur[t]);
          botoes.forEach((b) => {
            const sel = b === tab;
            b.setAttribute('aria-pressed', sel ? 'true' : 'false');
            b.tabIndex = -1;
          });
          if (!tab) tab = botoes[0];
          tab.tabIndex = 0;
        });
      }
      raiz.append(coluna('Hora', 'h', 24, 1), coluna('Minuto', 'm', 60, passoMin));
      const rodape = el('div', 'cx-cal__rodape');
      if (!inp.required) {
        const bl = el('button', '', 'Limpar');
        bl.type = 'button';
        bl.addEventListener('click', () => {
          c.definir('');
          texto.value = '';
          c.marcarInvalido(false);
          fecharPopup(true);
        });
        rodape.append(bl);
      }
      const ok = el('button', 'cx-cal__ok', 'OK');
      ok.type = 'button';
      ok.addEventListener('click', () => fecharPopup(true));
      rodape.append(ok);
      raiz.append(rodape);
      marcar();

      raiz.addEventListener('keydown', (e) => {
        const op = e.target.closest && e.target.closest('.cx-hora__op');
        if (!op) return;
        const lista = op.parentElement;
        const irPara = (b) => {
          if (!b) return;
          [...b.parentElement.children].forEach((x) => { x.tabIndex = -1; });
          b.tabIndex = 0;
          b.focus();
        };
        if (e.key === 'ArrowDown') irPara(op.nextElementSibling);
        else if (e.key === 'ArrowUp') irPara(op.previousElementSibling);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const outra = lista === colunas.h ? colunas.m : colunas.h;
          irPara(outra.querySelector('[aria-pressed="true"]') || outra.firstElementChild);
        } else return;
        e.preventDefault();
      });

      abrirPopup({
        ancora: wrap, foco: texto, gatilho: botao, conteudo: raiz, papel: 'dialog',
        titulo: rot.texto || 'Escolher hora', classe: 'cx-pop--hora',
      });
      ['h', 'm'].forEach((t) => {
        const s = colunas[t].querySelector('[aria-pressed="true"]');
        if (s) colunas[t].scrollTop = Math.max(0, s.offsetTop - colunas[t].clientHeight / 2 + s.offsetHeight / 2);
      });
      const f = colunas.h.querySelector('[tabindex="0"]');
      if (f) f.focus();
    }

    botao.addEventListener('click', () => {
      if (atual && atual.gatilho === botao) fecharPopup(true); else abrir();
    });
    texto.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); abrir(); }
    });
  }

  /* =====================================================
     Aplicação automática (inclusive em telas criadas depois)
     ===================================================== */
  function melhorarUm(c) {
    if (feitos.has(c) || c.hasAttribute('data-nativo') || !c.parentNode) return;
    if (c.tagName === 'SELECT') {
      if (c.multiple || c.size > 1) return;
      feitos.add(c);
      criarSelect(c);
    } else if (c.type === 'date') {
      feitos.add(c);
      criarData(c);
    } else if (c.type === 'time') {
      feitos.add(c);
      criarHora(c);
    }
  }
  function melhorar(raiz) {
    if (raiz.nodeType !== 1 && raiz.nodeType !== 9) return;
    if (raiz.nodeType === 1 && raiz.matches(SELETOR)) melhorarUm(raiz);
    raiz.querySelectorAll(SELETOR).forEach(melhorarUm);
  }

  SIPRO.campos = { melhorar, fechar: () => fecharPopup(false) };

  melhorar(document);
  new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes.forEach((no) => melhorar(no)));
    if (atual && !atual.ancora.isConnected) fecharPopup(false);
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => fecharPopup(false));
})();
