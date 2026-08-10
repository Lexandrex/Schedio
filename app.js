const views = [...document.querySelectorAll('[data-view]')];
const feedback = document.querySelector('#feedback');
let recoveryEmail = '';
let recoveryCode = '';

function showView(id) {
  views.forEach((view) => {
    const isActive = view.id === id;
    view.hidden = !isActive;
    view.classList.toggle('active', isActive);
  });

  feedback.textContent = '';
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
  const response = await fetch(`/api/auth/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Não foi possível concluir a operação.');
  }

  return data;
}

document.querySelector('[data-auth-form="login"]').addEventListener('submit', async (event) => {
  event.preventDefault();

  const [email, password] = event.currentTarget.querySelectorAll('input');

  try {
    const data = await request('login', {
      email: email.value,
      password: password.value,
    });

    feedback.textContent = `Bem-vindo, ${data.user.email}.`;
  } catch (error) {
    feedback.textContent = error.message;
  }
});

document.querySelector('[data-auth-form="register"]').addEventListener('submit', async (event) => {
  event.preventDefault();

  const [email, password, confirmation] = event.currentTarget.querySelectorAll('input');

  if (password.value !== confirmation.value) {
    feedback.textContent = 'As senhas informadas não coincidem.';
    return;
  }

  try {
    await request('register', {
      email: email.value,
      password: password.value,
    });

    showView('login');
    feedback.textContent = 'Conta criada. Agora você pode entrar.';
  } catch (error) {
    feedback.textContent = error.message;
  }
});

document.querySelector('[data-auth-form="recovery-email"]').addEventListener('submit', async (event) => {
  event.preventDefault();

  recoveryEmail = event.currentTarget.querySelector('input').value;

  try {
    const data = await request('password-recovery', { email: recoveryEmail });
    document.querySelector('#recovery-email').textContent = recoveryEmail;
    showView('recover-code');
    feedback.textContent = data.message;
  } catch (error) {
    feedback.textContent = error.message;
  }
});

document.querySelector('[data-auth-form="recovery-code"]').addEventListener('submit', async (event) => {
  event.preventDefault();

  recoveryCode = [...event.currentTarget.querySelectorAll('input')]
    .map((input) => input.value)
    .join('');

  if (recoveryCode.length !== 5) {
    feedback.textContent = 'Informe os cinco dígitos do código.';
    return;
  }

  try {
    await request('password-recovery/verify', {
      email: recoveryEmail,
      code: recoveryCode,
    });

    showView('reset-password');
  } catch (error) {
    feedback.textContent = error.message;
  }
});

document.querySelector('[data-auth-form="reset-password"]').addEventListener('submit', async (event) => {
  event.preventDefault();

  const [password, confirmation] = event.currentTarget.querySelectorAll('input');

  if (password.value !== confirmation.value) {
    feedback.textContent = 'As senhas informadas não coincidem.';
    return;
  }

  try {
    const data = await request('password-recovery/reset', {
      email: recoveryEmail,
      code: recoveryCode,
      password: password.value,
    });

    showView('login');
    feedback.textContent = data.message;
  } catch (error) {
    feedback.textContent = error.message;
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
