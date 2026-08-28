const views = [...document.querySelectorAll('[data-view]')];
const feedback = document.querySelector('#feedback');
let recoveryEmail = '';
let recoveryCode = '';
let verificationEmail = '';

const apiOrigin =
  window.location.protocol === 'file:' || window.location.origin === 'null' || window.location.port === '5500'
    ? 'http://127.0.0.1:4174'
    : window.location.origin;

function setFeedback(message, type = 'info') {
  feedback.textContent = message;
  feedback.dataset.type = type;
}

function showView(id) {
  views.forEach((view) => {
    const isActive = view.id === id;
    view.hidden = !isActive;
    view.classList.toggle('active', isActive);
  });

  setFeedback('', 'info');
  window.location.hash = id;
  document.querySelector(`#${id} input`)?.focus();
}

function loadHash() {
  const requested = window.location.hash.slice(1);
  const defaultView = views.some((view) => view.id === requested) ? requested : 'login';

  showView(defaultView);
}

document.querySelectorAll('[data-go]').forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.go));
});

async function request(endpoint, body) {
  const url = `${apiOrigin}/api/auth/${endpoint}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      throw new Error(data?.message || response.statusText || 'Não foi possível concluir a operação.');
    }

    return data;
  } catch (error) {
    throw new Error(error?.message || 'Falha na requisição. Verifique sua conexão e tente novamente.');
  }
}

document.querySelector('[data-auth-form="login"]').addEventListener('submit', async (event) => {
  event.preventDefault();

  const [email, password] = event.currentTarget.querySelectorAll('input');

  try {
    const data = await request('login', {
      email: email.value,
      password: password.value,
    });

    setFeedback(`Bem-vindo, ${data.user.email}.`, 'success');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
});

document.querySelector('[data-auth-form="register"]').addEventListener('submit', async (event) => {
  event.preventDefault();

  const [email, password, confirmation] = event.currentTarget.querySelectorAll('input');

  if (password.value !== confirmation.value) {
    setFeedback('As senhas informadas não coincidem.', 'error');
    return;
  }

  try {
    const data = await request('register', {
      email: email.value,
      password: password.value,
    });

    verificationEmail = data.user.email;
    document.querySelector('#verification-email').textContent = verificationEmail;
    showView('verify-email');
    setFeedback(data.message, 'success');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
});

document.querySelector('[data-auth-form="recovery-email"]').addEventListener('submit', async (event) => {
  event.preventDefault();

  recoveryEmail = event.currentTarget.querySelector('input').value.trim();

  if (!recoveryEmail || !recoveryEmail.includes('@')) {
    setFeedback('Informe um e-mail válido.', 'error');
    return;
  }

  try {
    const data = await request('password-recovery', { email: recoveryEmail });
    document.querySelector('#recovery-email').textContent = recoveryEmail;
    showView('recover-code');
    setFeedback(data.message, 'success');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
});

document.querySelector('[data-auth-form="recovery-code"]').addEventListener('submit', async (event) => {
  event.preventDefault();

  recoveryCode = [...event.currentTarget.querySelectorAll('input')]
    .map((input) => input.value)
    .join('');

  if (recoveryCode.length !== 6) {
    setFeedback('Informe os seis dígitos do código.', 'error');
    return;
  }

  try {
    await request('password-recovery/verify', {
      email: recoveryEmail,
      code: recoveryCode,
    });

    document.querySelector('[data-auth-form="reset-password"] .auth-username').value = recoveryEmail;
    showView('reset-password');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
});

document.querySelector('[data-auth-form="verification-code"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = [...event.currentTarget.querySelectorAll('input')].map((input) => input.value).join('');
  if (code.length !== 6) {
    setFeedback('Informe os seis dígitos do código.', 'error');
    return;
  }

  try {
    const data = await request('email-verification/verify', { email: verificationEmail, code });
    showView('login');
    setFeedback(data.message, 'success');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
});

document.querySelector('[data-resend-verification]').addEventListener('click', async () => {
  try {
    const data = await request('email-verification/resend', { email: verificationEmail });
    setFeedback(data.message, 'success');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
});

document.querySelector('[data-auth-form="reset-password"]').addEventListener('submit', async (event) => {
  event.preventDefault();

  const password = event.currentTarget.querySelector('input[autocomplete="new-password"]');
  const confirmation = event.currentTarget.querySelectorAll('input[autocomplete="new-password"]')[1];

  if (password.value !== confirmation.value) {
    setFeedback('As senhas informadas não coincidem.', 'error');
    return;
  }

  try {
    const data = await request('password-recovery/reset', {
      email: recoveryEmail,
      code: recoveryCode,
      password: password.value,
    });

    showView('login');
    setFeedback(data.message, 'success');
  } catch (error) {
    setFeedback(error.message, 'error');
  }
});

document.querySelectorAll('.code-inputs input').forEach((input, index, inputs) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 1);

    if (input.value) {
      inputs[index + 1]?.focus();
    }
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Backspace' && !input.value) {
      inputs[index - 1]?.focus();
    }
  });
});

window.addEventListener('hashchange', loadHash);
loadHash();
