const views = [...document.querySelectorAll('[data-view]')];
const feedback = document.querySelector('#feedback');
function showView(id) { views.forEach((view) => { view.hidden = view.id !== id; }); feedback.textContent = ''; window.location.hash = id; document.querySelector(`#${id} input`)?.focus(); }
function loadHash() { const requested = window.location.hash.slice(1); showView(views.some((view) => view.id === requested) ? requested : 'login'); }
document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.go)));
document.querySelector('[data-recover-email]').addEventListener('submit', (event) => { event.preventDefault(); document.querySelector('#recovery-email').textContent = event.currentTarget.querySelector('input').value; showView('recover-code'); });
document.querySelector('[data-recover-code]').addEventListener('submit', (event) => { event.preventDefault(); const code = [...event.currentTarget.querySelectorAll('input')].map((input) => input.value).join(''); if (code.length !== 5) { feedback.textContent = 'Informe os cinco dígitos do código.'; return; } showView('reset-password'); });
document.querySelectorAll('[data-message]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); const passwords = event.currentTarget.querySelectorAll('input[type="password"]'); if (passwords.length === 2 && passwords[0].value !== passwords[1].value) { feedback.textContent = 'As senhas informadas não coincidem.'; return; } feedback.textContent = event.currentTarget.dataset.message; }));
document.querySelectorAll('.code-inputs input').forEach((input, index, inputs) => { input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 1); if (input.value) inputs[index + 1]?.focus(); }); input.addEventListener('keydown', (event) => { if (event.key === 'Backspace' && !input.value) inputs[index - 1]?.focus(); }); });
window.addEventListener('hashchange', loadHash);
loadHash();
