import { getNativeAccounts } from './native-accounts.js';

const COPY = {
  en: {
    local: 'PRIVATE · ON THIS DEVICE', title: 'Your stories. Your place.', detail: 'Sign in to keep your reading history, preferences and MEGA library together on this device.',
    loading: 'Opening your accounts…', signIn: 'Sign in', create: 'Create a local account', account: 'Account', name: 'Your name', email: 'Email (optional)', password: 'Password', confirm: 'Confirm password', createAction: 'Create account',
    passwordHelp: 'At least 8 characters. Keep this password safe: local accounts have no email password reset.', mismatch: 'The passwords do not match.', invalidPassword: 'Use a password with at least 8 characters.',
    biometric: 'Unlock with biometrics', biometricEnable: 'Enable biometric unlock', biometricDisable: 'Turn off biometric unlock', biometricHelp: 'After signing in once, use the fingerprint or face recognition supported by Android to open this account.', biometricUnavailable: 'Secure biometric unlock is not available on this device.',
    google: 'Continue with Google', googleHelp: 'Google sign-in and syncing between devices need app setup. Local accounts are available now.', noProfiles: 'Create your first account to get started.', error: 'This action could not be completed. Check your password and try again.', retry: 'Try again', done: 'Done', settings: 'Your account', lock: 'Lock / switch account', accountLocal: 'Local account · saved on this device', security: 'Your MEGA session is kept in the encrypted Android vault. It is not included in library backups.', saved: 'Biometric preference saved.', cancelled: 'Biometric unlock was cancelled. You can use your password.', language: 'Language',
  },
  'pt-BR': {
    local: 'PRIVADO · NESTE APARELHO', title: 'Suas histórias. Seu lugar.', detail: 'Entre para manter histórico de leitura, preferências e biblioteca do MEGA juntos neste aparelho.',
    loading: 'Abrindo suas contas…', signIn: 'Entrar', create: 'Criar conta local', account: 'Conta', name: 'Seu nome', email: 'E-mail (opcional)', password: 'Senha', confirm: 'Confirmar senha', createAction: 'Criar conta',
    passwordHelp: 'Pelo menos 8 caracteres. Guarde esta senha: contas locais não têm recuperação por e-mail.', mismatch: 'As senhas não são iguais.', invalidPassword: 'Use uma senha com pelo menos 8 caracteres.',
    biometric: 'Abrir com biometria', biometricEnable: 'Ativar abertura por biometria', biometricDisable: 'Desativar abertura por biometria', biometricHelp: 'Depois do primeiro login, use a digital ou o reconhecimento facial seguro compatível com o Android para abrir esta conta.', biometricUnavailable: 'A biometria segura não está disponível neste aparelho.',
    google: 'Continuar com Google', googleHelp: 'O login Google e a sincronização entre aparelhos precisam de configuração do app. As contas locais já estão disponíveis.', noProfiles: 'Crie sua primeira conta para começar.', error: 'Não foi possível concluir. Confira sua senha e tente novamente.', retry: 'Tentar novamente', done: 'Concluir', settings: 'Sua conta', lock: 'Bloquear / trocar conta', accountLocal: 'Conta local · salva neste aparelho', security: 'Sua sessão do MEGA fica no cofre criptografado do Android. Ela não é incluída nos backups da biblioteca.', saved: 'Preferência de biometria salva.', cancelled: 'A biometria foi cancelada. Você pode usar sua senha.', language: 'Idioma',
  },
  es: {
    local: 'PRIVADO · EN ESTE DISPOSITIVO', title: 'Tus historias. Tu lugar.', detail: 'Inicia sesión para guardar tu historial, preferencias y biblioteca de MEGA juntos en este dispositivo.',
    loading: 'Abriendo tus cuentas…', signIn: 'Iniciar sesión', create: 'Crear cuenta local', account: 'Cuenta', name: 'Tu nombre', email: 'Correo (opcional)', password: 'Contraseña', confirm: 'Confirmar contraseña', createAction: 'Crear cuenta',
    passwordHelp: 'Al menos 8 caracteres. Guarda esta contraseña: las cuentas locales no tienen recuperación por correo.', mismatch: 'Las contraseñas no coinciden.', invalidPassword: 'Usa una contraseña de al menos 8 caracteres.',
    biometric: 'Abrir con biometría', biometricEnable: 'Activar apertura biométrica', biometricDisable: 'Desactivar apertura biométrica', biometricHelp: 'Después de iniciar sesión una vez, usa la huella o el reconocimiento facial seguro compatible con Android para abrir esta cuenta.', biometricUnavailable: 'La biometría segura no está disponible en este dispositivo.',
    google: 'Continuar con Google', googleHelp: 'El acceso con Google y la sincronización entre dispositivos necesitan configuración de la app. Las cuentas locales ya están disponibles.', noProfiles: 'Crea tu primera cuenta para empezar.', error: 'No se pudo completar. Comprueba tu contraseña e inténtalo de nuevo.', retry: 'Reintentar', done: 'Listo', settings: 'Tu cuenta', lock: 'Bloquear / cambiar cuenta', accountLocal: 'Cuenta local · guardada en este dispositivo', security: 'La sesión de MEGA se guarda en la bóveda cifrada de Android. No se incluye en las copias de la biblioteca.', saved: 'Preferencia biométrica guardada.', cancelled: 'Se canceló la biometría. Puedes usar tu contraseña.', language: 'Idioma',
  },
};

for (const [language, values] of Object.entries({
  en: { authError: 'Incorrect password. Please try again.', rateLimit: 'Too many attempts. Wait a little before trying again.', exists: 'A local account with this email already exists. Choose Sign in.', limit: 'This device has reached its account limit.', inputError: 'Check the account details and try again.', locked: 'This account is locked. Sign in again.' },
  'pt-BR': { authError: 'Senha incorreta. Tente novamente.', rateLimit: 'Muitas tentativas. Aguarde um pouco antes de tentar de novo.', exists: 'Já existe uma conta local com este e-mail. Escolha Entrar.', limit: 'Este aparelho atingiu o limite de contas.', inputError: 'Confira os dados da conta e tente novamente.', locked: 'Esta conta está bloqueada. Entre novamente.' },
  es: { authError: 'Contraseña incorrecta. Inténtalo de nuevo.', rateLimit: 'Demasiados intentos. Espera un poco antes de volver a intentarlo.', exists: 'Ya existe una cuenta local con este correo. Elige Iniciar sesión.', limit: 'Este dispositivo llegó al límite de cuentas.', inputError: 'Comprueba los datos de la cuenta e inténtalo de nuevo.', locked: 'Esta cuenta está bloqueada. Inicia sesión de nuevo.' },
})) Object.assign(COPY[language], values);

const supportedLanguage = value => Object.hasOwn(COPY, value) ? value : 'en';
const validProfile = value => value && typeof value.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.id) && typeof value.name === 'string';
const node = (tag, className, text) => { const value = document.createElement(tag); if (className) value.className = className; if (text !== undefined) value.textContent = text; return value; };
function button(label, action, kind = 'primary') { const value = node('button', `button ${kind}`, label); value.type = 'button'; if (action) value.addEventListener('click', action); return value; }
function field(caption, { type = 'text', autocomplete = '', required = false, maxLength = 160, minLength } = {}) {
  const label = node('label', 'account-field'), span = node('span', '', caption), input = node('input');
  input.type = type; input.autocomplete = autocomplete; input.required = required; input.maxLength = maxLength;
  if (minLength) input.minLength = minLength;
  if (type !== 'password') { input.autocapitalize = type === 'email' ? 'none' : 'words'; input.spellcheck = false; }
  label.append(span, input); return { label, input };
}
function safeMessage(error, labels) {
  if (['CANCELLED', 'BIOMETRIC_CANCELLED', 'USER_CANCELLED'].includes(error?.code)) return labels.cancelled;
  const key = { AUTH: 'authError', RATE_LIMIT: 'rateLimit', EXISTS: 'exists', LIMIT: 'limit', INPUT: 'inputError', LOCKED: 'locked', BIOMETRIC_UNAVAILABLE: 'biometricUnavailable' }[error?.code];
  return labels[key] || labels.error;
}
function brandedCard(container, labels) {
  const card = node('section', 'account-card');
  const brand = node('div', 'account-brand');
  const icon = node('img', 'brand-emblem'); icon.src = '/brand-emblem.png'; icon.alt = ''; icon.width = 52; icon.height = 52;
  const wordmark = node('span', 'brand-wordmark', 'Cloud'); wordmark.append(node('span', 'brand-light', 'Panels'));
  brand.append(icon, wordmark);
  const header = node('div', 'account-brand-header'); header.append(brand);
  card.append(header, node('span', 'account-local-badge', labels.local)); container.append(card); return card;
}
function googleUnavailable(card, labels) {
  const google = button(labels.google, null, 'secondary account-google'); google.disabled = true;
  const mark = node('span', 'account-google-mark', 'G'); mark.setAttribute('aria-hidden', 'true'); google.prepend(mark);
  card.append(node('div', 'account-divider'), google, node('p', 'account-help', labels.googleHelp));
}

/** Native accounts are intentionally absent from ordinary browser previews. */
export async function openAccountGate({ client = getNativeAccounts(), language = 'en' } = {}) {
  if (!client) return null;
  let lang = supportedLanguage(language), profiles = [], biometricAvailable = false, chosenId = '', creating = false, busy = false;
  const container = node('div', 'account-gate'); container.id = 'cloudpanels-account-gate'; container.setAttribute('role', 'dialog'); container.setAttribute('aria-modal', 'true');
  const app = document.querySelector('.app-shell'), priorInert = app?.inert, priorHidden = app?.getAttribute('aria-hidden');
  if (app) { app.inert = true; app.setAttribute('aria-hidden', 'true'); }
  document.body.classList.add('account-is-locked'); document.body.append(container);
  const finish = profile => {
    container.remove(); document.body.classList.remove('account-is-locked');
    if (app) { app.inert = Boolean(priorInert); if (priorHidden === null) app.removeAttribute('aria-hidden'); else if (priorHidden !== undefined) app.setAttribute('aria-hidden', priorHidden); }
    document.documentElement.lang = lang;
    return profile;
  };
  return new Promise(resolve => {
    function draw(message = '', loading = false) {
      const labels = COPY[lang]; container.replaceChildren(); const card = brandedCard(container, labels);
      container.setAttribute('aria-label', creating ? labels.create : labels.signIn);
      const languageField = node('label', 'account-language'); languageField.append(node('span', 'sr-only', labels.language));
      const languageSelect = node('select');
      for (const [id, title] of [['en', 'English'], ['pt-BR', 'Português'], ['es', 'Español']]) { const option = node('option', '', title); option.value = id; languageSelect.append(option); }
      languageSelect.value = lang; languageSelect.disabled = busy || loading; languageSelect.addEventListener('change', () => { lang = supportedLanguage(languageSelect.value); draw(); }); languageField.append(languageSelect); card.querySelector('.account-brand-header').append(languageField);
      card.append(node('h1', '', labels.title), node('p', 'account-description', labels.detail));
      if (loading) { const status = node('p', 'account-status', labels.loading); status.setAttribute('role', 'status'); card.append(status); return; }
      if (message) { const error = node('p', 'account-error', message); error.setAttribute('role', 'alert'); card.append(error); }
      const tabs = node('div', 'account-tabs');
      if (profiles.length) {
        const signIn = button(labels.signIn, () => { creating = false; draw(); }, creating ? 'ghost' : 'secondary'); signIn.setAttribute('aria-pressed', String(!creating));
        const create = button(labels.create, () => { creating = true; draw(); }, creating ? 'secondary' : 'ghost'); create.setAttribute('aria-pressed', String(creating)); tabs.append(signIn, create); card.append(tabs);
      } else card.append(node('p', 'account-help', labels.noProfiles));
      const form = node('form', 'account-form'); form.autocomplete = 'on';
      let name, email, confirmation, select;
      if (creating || !profiles.length) {
        creating = true;
        name = field(labels.name, { required: true, autocomplete: 'name', maxLength: 80 });
        email = field(labels.email, { type: 'email', autocomplete: 'email', maxLength: 254 });
        form.append(name.label, email.label);
      } else {
        const accountLabel = node('label', 'account-field'); accountLabel.append(node('span', '', labels.account)); select = node('select'); select.id = 'account-profile';
        for (const profile of profiles) { const option = node('option', '', `${profile.name}${profile.email ? ` · ${profile.email}` : ''}`); option.value = profile.id; select.append(option); }
        if (!profiles.some(profile => profile.id === chosenId)) chosenId = profiles[0].id;
        select.value = chosenId; select.addEventListener('change', () => { chosenId = select.value; draw(); }); accountLabel.append(select); form.append(accountLabel);
      }
      const password = field(labels.password, { type: 'password', required: true, autocomplete: creating ? 'new-password' : 'current-password', maxLength: 256, minLength: creating ? 8 : undefined }); password.input.id = 'account-password'; form.append(password.label);
      if (creating) { confirmation = field(labels.confirm, { type: 'password', required: true, autocomplete: 'new-password', maxLength: 256, minLength: 8 }); form.append(confirmation.label, node('p', 'account-help', labels.passwordHelp)); }
      const error = node('p', 'account-error'); error.setAttribute('role', 'alert'); error.hidden = true; form.append(error);
      const submit = button(creating ? labels.createAction : labels.signIn); submit.type = 'submit'; form.append(submit);
      const setBusy = value => { busy = value; container.setAttribute('aria-busy', String(value)); for (const control of container.querySelectorAll('button,input,select')) control.disabled = value || control.classList.contains('account-google'); };
      const run = async action => {
        if (busy) return;
        error.hidden = true; setBusy(true);
        try { const profile = await action(); if (!validProfile(profile)) throw new Error(); resolve(finish(profile)); }
        catch (failure) { error.textContent = safeMessage(failure, labels); error.hidden = false; password.input.value = ''; if (confirmation) confirmation.input.value = ''; setBusy(false); password.input.focus({ preventScroll: true }); }
      };
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (creating && password.input.value.length < 8) { error.textContent = labels.invalidPassword; error.hidden = false; return; }
        if (creating && password.input.value !== confirmation.input.value) { error.textContent = labels.mismatch; error.hidden = false; return; }
        const value = password.input.value;
        void run(() => creating ? client.createProfile({ name: name.input.value.trim(), email: email.input.value.trim(), password: value }) : client.signIn(chosenId, value));
      });
      const selected = profiles.find(profile => profile.id === chosenId);
      if (!creating && selected?.biometricEnabled && biometricAvailable) {
        const unlock = button(labels.biometric, () => void run(() => client.unlockBiometric(selected.id)), 'secondary'); unlock.id = 'account-biometric-unlock'; form.append(unlock);
      }
      card.append(form); googleUnavailable(card, labels);
      queueMicrotask(() => (creating ? name.input : password.input).focus({ preventScroll: true }));
    }
    async function load() {
      draw('', true);
      try {
        const value = await client.listProfiles();
        if (!value || !Array.isArray(value.profiles) || value.profiles.length > 20 || !value.profiles.every(validProfile)) throw new Error();
        profiles = value.profiles; biometricAvailable = value.biometricAvailable === true; creating = !profiles.length; draw();
      } catch {
        const labels = COPY[lang]; draw('', true);
        const card = container.querySelector('.account-card'); card.querySelector('.account-status')?.remove(); card.append(node('p', 'account-error', labels.error), button(labels.retry, () => void load(), 'secondary'));
      }
    }
    void load();
  });
}

let activeSettings;
export async function showAccountSettings({ client = getNativeAccounts(), profile, onLock, onProfileChange, language = 'en' } = {}) {
  if (!client || !validProfile(profile)) return;
  if (activeSettings?.open) { activeSettings.focus(); return; }
  const labels = COPY[supportedLanguage(language)], dialog = node('dialog', 'account-settings-dialog');
  dialog.setAttribute('aria-label', labels.settings); dialog.setAttribute('closedby', 'closerequest'); document.body.append(dialog); activeSettings = dialog;
  let current = profile, busy = false, biometricAvailable = false;
  const card = brandedCard(dialog, labels), heading = node('h2', '', labels.settings), accountName = node('strong', 'account-profile-name', current.name), email = node('p', 'account-help', current.email || labels.accountLocal), status = node('p', 'account-status');
  status.setAttribute('role', 'status');
  card.append(heading, accountName, email, node('p', 'account-local-note', labels.accountLocal), node('p', 'account-description', labels.security), node('p', 'account-help', labels.biometricHelp), status);
  const actions = node('div', 'account-settings-actions'); card.append(actions);
  const close = () => { if (busy) return; dialog.close(); };
  const draw = () => {
    actions.replaceChildren();
    const biometric = button(current.biometricEnabled ? labels.biometricDisable : labels.biometricEnable, async () => {
      if (busy) return; busy = true; status.textContent = ''; draw();
      try {
        const updated = await (current.biometricEnabled ? client.disableBiometric() : client.enableBiometric());
        if (!validProfile(updated)) throw new Error(); current = updated; await onProfileChange?.(current); status.textContent = labels.saved;
      } catch (error) { status.textContent = safeMessage(error, labels); }
      finally { busy = false; draw(); }
    }, 'secondary'); biometric.id = 'account-biometric-toggle'; biometric.disabled = busy || (!biometricAvailable && !current.biometricEnabled); actions.append(biometric);
    if (!biometricAvailable) actions.append(node('p', 'account-help', labels.biometricUnavailable));
    const lock = button(labels.lock, async () => {
      if (busy) return; busy = true; status.textContent = ''; draw();
      try {
        if (onLock) await onLock(); else { await client.logout(); location.reload(); }
        dialog.close();
      } catch (error) { status.textContent = safeMessage(error, labels); busy = false; draw(); }
    }, 'secondary'); lock.id = 'account-lock'; lock.disabled = busy;
    const done = button(labels.done, close); done.disabled = busy; actions.append(lock, done);
  };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => { if (activeSettings === dialog) activeSettings = undefined; dialog.remove(); }, { once: true });
  draw(); dialog.showModal();
  try { const value = await client.listProfiles(); biometricAvailable = value?.biometricAvailable === true; draw(); }
  catch { status.textContent = labels.error; }
  actions.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
}
