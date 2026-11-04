/* SIPRO+ — Tela de login (Etapa 1: somente interface)
   A autenticação real será conectada na próxima etapa. Nada aqui valida
   credenciais, guarda senha ou simula acesso. */
(() => {
  'use strict';

  const form = document.getElementById('form-login');
  const cpf = document.getElementById('cpf');
  const senha = document.getElementById('senha');
  const olho = document.getElementById('btn-olho');
  const aviso = document.getElementById('aviso');

  document.getElementById('ano').textContent = new Date().getFullYear();

  /* --- CPF: máscara e conferência de formato (apenas ajuda ao usuário) --- */
  const soDigitos = (v) => v.replace(/\D/g, '').slice(0, 11);

  const mascara = (d) => d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');

  function cpfValido(d) {
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (const tam of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < tam; i++) soma += Number(d[i]) * (tam + 1 - i);
      if (((soma * 10) % 11) % 10 !== Number(d[tam])) return false;
    }
    return true;
  }

  cpf.addEventListener('input', () => {
    cpf.value = mascara(soDigitos(cpf.value));
    limpar('cpf');
  });
  senha.addEventListener('input', () => limpar('senha'));

  /* --- Mostrar/ocultar senha --- */
  olho.addEventListener('click', () => {
    const mostrar = senha.type === 'password';
    senha.type = mostrar ? 'text' : 'password';
    olho.setAttribute('aria-pressed', String(mostrar));
    olho.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
    senha.focus();
  });

  /* --- Mensagens de erro por campo --- */
  function erro(nome, msg) {
    const campo = form.querySelector(`[data-field="${nome}"]`);
    campo.classList.remove('erro');
    void campo.offsetWidth; // reinicia a animação
    campo.classList.add('erro');
    campo.querySelector('.field__erro').textContent = msg;
    campo.querySelector('input').setAttribute('aria-invalid', 'true');
  }
  function limpar(nome) {
    const campo = form.querySelector(`[data-field="${nome}"]`);
    campo.classList.remove('erro');
    campo.querySelector('.field__erro').textContent = '';
    campo.querySelector('input').removeAttribute('aria-invalid');
    aviso.textContent = '';
    aviso.classList.remove('info');
  }

  /* --- Envio --- */
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    aviso.textContent = '';
    aviso.classList.remove('info');

    const digitos = soDigitos(cpf.value);
    let primeiroInvalido = null;

    if (!digitos) { erro('cpf', 'Informe o seu CPF.'); primeiroInvalido = cpf; }
    else if (!cpfValido(digitos)) { erro('cpf', 'CPF inválido. Confira os números.'); primeiroInvalido = cpf; }

    if (!senha.value) { erro('senha', 'Informe a sua senha.'); primeiroInvalido = primeiroInvalido || senha; }

    if (primeiroInvalido) { primeiroInvalido.focus(); return; }

    /* PRÓXIMA ETAPA: enviar { cpf: digitos, senha: senha.value } ao serviço de
       autenticação segura (a ser definido) e tratar a resposta aqui. */
    aviso.classList.add('info');
    aviso.textContent = 'A autenticação ainda não está conectada. Esta é a etapa de interface.';
  });
})();
