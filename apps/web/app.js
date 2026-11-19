const API = window.CINNARIOS_PHONE
  ? `${location.origin}/v1`
  : `${location.protocol}//${location.hostname}:3001/v1`;
const app = document.querySelector('#app');
const cartCount = document.querySelector('#cart-count');

const sessionKey = 'marketplace.session';
const tokenKey = 'marketplace.access';

function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

if (!localStorage.getItem(sessionKey)) localStorage.setItem(sessionKey, newId());

function sessionId() {
  return localStorage.getItem(sessionKey);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

/** National Bank of Rwanda average for 17 Nov 2026: midpoint of the USD buying and selling rates. */
const USD_TO_RWF = 1477.385;

const RW_PROVINCES = {
  'Kigali City': ['Gasabo', 'Kicukiro', 'Nyarugenge'],
  'Northern Province': ['Burera', 'Gakenke', 'Gicumbi', 'Musanze', 'Rulindo'],
  'Southern Province': ['Gisagara', 'Huye', 'Kamonyi', 'Muhanga', 'Nyamagabe', 'Nyanza', 'Nyaruguru', 'Ruhango'],
  'Eastern Province': ['Bugesera', 'Gatsibo', 'Kayonza', 'Kirehe', 'Ngoma', 'Nyagatare', 'Rwamagana'],
  'Western Province': ['Karongi', 'Ngororero', 'Nyabihu', 'Nyamasheke', 'Rubavu', 'Rusizi', 'Rutsiro'],
};

/** Every price shows in Rwandan francs. Prices recorded in dollars are converted at USD_TO_RWF. */
function money(cents, currency = 'USD') {
  const amount = Number(cents) / 100;
  const francs = String(currency).trim() === 'RWF' ? amount : amount * USD_TO_RWF;
  return `RWF ${new Intl.NumberFormat('en-RW', { maximumFractionDigits: 0 }).format(Math.round(francs))}`;
}

function rateNote() {
  return '<p class="note">Shown in francs at the National Bank of Rwanda average for 17 Nov 2026: 1 USD = 1,477.385 RWF. The price is still recorded in dollars.</p>';
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  const token = sessionStorage.getItem(tokenKey);
  if (token) headers.Authorization = `Bearer ${token}`;
  let response = await fetch(API + path, { ...options, headers, credentials: 'include' });
  if (response.status === 401 && token && !path.startsWith('/auth/')) {
    const refreshed = await fetch(API + '/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (refreshed.ok) {
      const data = await refreshed.json();
      sessionStorage.setItem(tokenKey, data.accessToken);
      headers.Authorization = `Bearer ${data.accessToken}`;
      response = await fetch(API + path, { ...options, headers, credentials: 'include' });
    } else {
      sessionStorage.removeItem(tokenKey);
    }
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || 'The request failed.');
    error.code = body.code;
    throw error;
  }
  return body;
}

function signedIn() {
  return Boolean(sessionStorage.getItem(tokenKey));
}

async function refreshCartCount() {
  if (!signedIn()) {
    cartCount.textContent = '';
    return;
  }
  try {
    const cart = await api('/cart');
    const next = cart.items.length ? `(${cart.items.length})` : '';
    if (cartCount.textContent !== next) {
      cartCount.textContent = next;
      if (next && motionOk()) {
        cartCount.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      }
    }
  } catch {
    cartCount.textContent = '';
  }
}

function formError(error) {
  return `<p class="error">${error.message}</p>`;
}

async function journey(kind, sourceId) {
  if (!signedIn()) return;
  await api('/me/journey', {
    method: 'POST',
    body: JSON.stringify({ kind, sourceId, sessionId: sessionId() }),
  });
}

let painted = false;
let carriedWork = null;

function motionOk() {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function place(html, carry, after) {
  const apply = () => {
    app.innerHTML = html;
    after?.();
  };
  if (!painted || !motionOk() || !document.startViewTransition) {
    apply();
    painted = true;
    return;
  }
  if (!carry) {
    document.querySelectorAll('#app img').forEach((img) => {
      img.style.viewTransitionName = 'none';
    });
  }
  try {
    document.startViewTransition(apply);
  } catch {
    apply();
  }
  painted = true;
}

function listOrigin() {
  const route = location.hash || '#home';
  if (route.startsWith('#search')) return '#search';
  if (route.startsWith('#saved')) return '#saved';
  if (route.startsWith('#home')) return '#home';
  if (
    route.startsWith('#gallery') ||
    route.startsWith('#discover') ||
    route.startsWith('#collection') ||
    route.startsWith('#artist')
  ) return '#gallery';
  return null;
}

function pieceOrigin() {
  const saved = sessionStorage.getItem('marketplace.origin');
  if (saved === '#home' || saved === '#gallery' || saved === '#search' || saved === '#saved') return saved;
  return '#home';
}

function markNav() {
  const route = location.hash || '#home';
  let tab = '#home';
  if (route.startsWith('#work/') || route.startsWith('#try/')) {
    const from = route.split('/')[2];
    tab = from === 'search' ? '#search'
      : from === 'saved' ? '#saved'
      : from === 'home' ? '#home'
      : from === 'discover' ? '#gallery'
      : pieceOrigin();
  }
  else if (route.startsWith('#search')) tab = '#search';
  else if (
    route.startsWith('#gallery') ||
    route.startsWith('#discover') ||
    route.startsWith('#collection') ||
    route.startsWith('#artist')
  ) tab = '#gallery';
  else if (
    route.startsWith('#saved') ||
    route.startsWith('#moodboard') ||
    route.startsWith('#offers') ||
    route.startsWith('#thread') ||
    route.startsWith('#offer/')
  ) tab = '#saved';
  else if (
    route.startsWith('#studio') ||
    route.startsWith('#account') ||
    route.startsWith('#orders') ||
    route.startsWith('#receipt') ||
    route === '#enter' ||
    route === '#forgot'
  ) tab = '#account';
  document.querySelectorAll('[data-tab]').forEach((link) => {
    if (link.getAttribute('href') === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function setPage(mode, title) {
  document.body.dataset.page = mode;
  document.title = title ? `${title} · Cinnarios` : 'Cinnarios';
  let back = document.querySelector('#back');
  if (mode === 'sheet') {
    if (!back) {
      back = document.createElement('a');
      back.id = 'back';
      back.href = '#home';
      back.textContent = 'Back';
      document.querySelector('.bar')?.prepend(back);
    }
  } else if (back) {
    back.remove();
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (href.startsWith('#work/')) {
    const origin = listOrigin();
    if (origin) sessionStorage.setItem('marketplace.origin', origin);
    carriedWork = href.slice('#work/'.length).split('/')[0];
    const image = link.querySelector('img');
    if (image) image.style.viewTransitionName = `work-${carriedWork}`;
    return;
  }
  carriedWork = null;
});

async function render() {
  markNav();
  const route = location.hash || '#home';
  if (!painted) app.innerHTML = '<p class="loading">Opening the works.</p>';
  if (route === '#home') return window.renderHome?.();
  if (route.startsWith('#work/')) return renderWork(route.slice('#work/'.length).split('/')[0], route.split('/')[2]);
  if (route.startsWith('#try/')) return renderTry(route.slice('#try/'.length).split('/')[0]);
  if (route === '#cart') return renderCart();
  if (route === '#checkout') return renderCheckout();
  if (route.startsWith('#receipt/')) return renderReceipt(decodeURIComponent(route.slice('#receipt/'.length)));
  if (route === '#saved') return renderSaved();
  if (route === '#account') return renderAccount();
  if (route === '#enter') return renderAuth();
  if (route === '#forgot') return renderForgot();
  if (route === '#reset') return renderReset();
  if (route === '#search') return renderSearch();
  if (route === '#gallery' || route === '#discover') return renderDiscover();
  if (window.renderRoom?.(route)) return undefined;
  return renderGallery();
}

function acceptSession(result) {
  if (result.mfaRequired) {
    sessionStorage.setItem('marketplace.mfa', result.mfaToken);
    const mfaForm = document.querySelector('#mfa-form');
    if (mfaForm) {
      mfaForm.hidden = false;
      mfaForm.dataset.token = result.mfaToken;
      return;
    }
    location.hash = '#enter';
    return;
  }
  sessionStorage.removeItem('marketplace.mfa');
  sessionStorage.setItem(tokenKey, result.accessToken);
  location.hash = '#home';
}

function renderAuth() {
  setPage('sheet', 'Sign in');
  place(`
    <h1>Come in.</h1>
    <p>Create an account or sign in. The profile, cart, and confidence record stay with this account.</p>
    <form id="auth-form">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="new-password" minlength="12" required />
      <p class="note">At least 12 characters, with upper and lower case letters and a number.</p>
      <button type="submit" data-mode="register">Create account</button>
      <button type="submit" class="quiet" data-mode="login">Sign in</button>
      <p id="auth-error" class="error"></p>
      <p><a href="#forgot">Forgot password</a></p>
    </form>
    <div id="providers"></div>
    <form id="mfa-form" hidden>
      <label for="code">Authentication code</label>
      <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" required />
      <button type="submit">Confirm code</button>
    </form>`, false, () => {
  const form = document.querySelector('#auth-form');
  form.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) form.dataset.mode = button.dataset.mode;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const mode = form.dataset.mode || 'register';
    try {
      const result = await api(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      });
      acceptSession(result);
    } catch (error) {
      document.querySelector('#auth-error').textContent = error.message;
    }
  });
  document.querySelector('#mfa-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const mfaForm = event.currentTarget;
    try {
      const result = await api('/auth/mfa/challenge', {
        method: 'POST',
        body: JSON.stringify({ mfaToken: mfaForm.dataset.token, code: new FormData(mfaForm).get('code') }),
      });
      acceptSession(result);
    } catch (error) {
      document.querySelector('#auth-error').textContent = error.message;
    }
  });
  loadProviders();
  });
}

function renderForgot() {
  setPage('sheet', 'Reset password');
  place(`
    <h1>Reset the password.</h1>
    <p>Enter the account email. This local server shows the reset link here, because mail is only written to the API log.</p>
    <form id="forgot-form">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required />
      <button type="submit">Send reset link</button>
      <p id="forgot-result"></p>
    </form>`, false, () => {
    document.querySelector('#forgot-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const result = document.querySelector('#forgot-result');
      result.className = '';
      result.textContent = '';
      try {
        const body = await api('/auth/password/forgot', {
          method: 'POST',
          body: JSON.stringify({ email: new FormData(event.currentTarget).get('email') }),
        });
        result.textContent = body.message;
        if (body.resetUrl) {
          const link = document.createElement('a');
          link.href = body.resetUrl;
          link.textContent = 'Open the reset link';
          result.append(document.createElement('br'), link);
        }
      } catch (error) {
        result.className = 'error';
        result.textContent = error.message;
      }
    });
  });
}

function renderReset() {
  setPage('sheet', 'New password');
  const token = sessionStorage.getItem('marketplace.reset') || '';
  place(`
    <h1>Choose a new password.</h1>
    <form id="reset-form">
      <label for="password">New password</label>
      <input id="password" name="password" type="password" autocomplete="new-password" minlength="12" required />
      <p class="note">At least 12 characters, with upper and lower case letters and a number.</p>
      <button type="submit" ${token ? '' : 'disabled'}>Update password</button>
      <p id="reset-result" class="${token ? '' : 'error'}">${token ? '' : 'This reset link is missing its token.'}</p>
    </form>`, false, () => {
    document.querySelector('#reset-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const result = document.querySelector('#reset-result');
      try {
        await api('/auth/password/reset', {
          method: 'POST',
          body: JSON.stringify({ token, password: new FormData(event.currentTarget).get('password') }),
        });
        sessionStorage.removeItem('marketplace.reset');
        result.className = '';
        result.textContent = 'Password updated.';
        const link = document.createElement('a');
        link.href = '#enter';
        link.textContent = 'Sign in';
        result.append(document.createElement('br'), link);
      } catch (error) {
        result.className = 'error';
        result.textContent = error.message;
      }
    });
  });
}

function loadProviders() {
  const slot = document.querySelector('#providers');
  if (!slot) return;
  api('/auth/providers').then((providers) => {
    if (!providers.googleClientId && !providers.appleClientId) {
      slot.innerHTML = '<p class="note">Google and Apple sign-in run once a client id is set for this server.</p>';
      return;
    }
    if (providers.googleClientId) slot.insertAdjacentHTML('beforeend', '<div id="google-button"></div>');
    if (providers.appleClientId) slot.insertAdjacentHTML('beforeend', '<button type="button" id="apple-button" class="quiet">Continue with Apple</button>');
    if (providers.googleClientId) mountGoogle(providers.googleClientId);
    if (providers.appleClientId) mountApple(providers.appleClientId);
  }).catch((error) => {
    slot.innerHTML = `<p class="error">${esc(error.message)}</p>`;
  });
}

function mountGoogle(clientId) {
  const start = () => {
    const google = window.google;
    if (!google?.accounts?.id) return;
    google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        try {
          acceptSession(await api('/auth/oauth/google', {
            method: 'POST',
            body: JSON.stringify({ idToken: response.credential }),
          }));
        } catch (error) {
          const node = document.querySelector('#auth-error');
          if (node) node.textContent = error.message;
        }
      },
    });
    google.accounts.id.renderButton(document.querySelector('#google-button'), {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
    });
  };
  if (window.google?.accounts?.id) {
    start();
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.onload = start;
  document.head.appendChild(script);
}

function mountApple(clientId) {
  const start = () => {
    const apple = window.AppleID;
    if (!apple?.auth) return;
    apple.auth.init({
      clientId,
      scope: 'name email',
      redirectURI: location.origin,
      usePopup: true,
    });
    document.querySelector('#apple-button').addEventListener('click', async () => {
      try {
        const response = await apple.auth.signIn();
        acceptSession(await api('/auth/oauth/apple', {
          method: 'POST',
          body: JSON.stringify({ idToken: response.authorization.id_token }),
        }));
      } catch (error) {
        const node = document.querySelector('#auth-error');
        if (node) node.textContent = error.message || 'Apple sign-in was cancelled.';
      }
    });
  };
  if (window.AppleID?.auth) {
    start();
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
  script.async = true;
  script.onload = start;
  document.head.appendChild(script);
}

async function loadConfidence(sourceId) {
  if (!signedIn()) return null;
  try {
    const report = await api('/me/confidence');
    return sourceId ? report.artworks.find((work) => work.sourceId === sourceId) ?? null : report;
  } catch {
    return null;
  }
}

async function renderGallery() {
  setPage('visit', 'Works');
  try {
    const works = await api('/catalog/artworks');
    place(`<h1>The size the museum recorded.</h1>
      <p class="intro">Public-domain paintings from The Met. The price is a reproduction at that size.</p>
      <div class="grid">${works.map((work) => `
      <a class="work" href="#work/${esc(work.sourceId)}">
        <span class="frame"><img src="${esc(work.thumbnailUrl)}" alt="" loading="lazy" decoding="async" style="${work.sourceId === carriedWork ? `view-transition-name: work-${esc(work.sourceId)}` : ''}" /></span>
        <strong>${esc(work.title)}</strong>
        <span>${esc(work.artist || 'Unknown artist')}</span>
        <span class="measures">${esc(work.widthCm)} × ${esc(work.heightCm)} cm</span>
      </a>`).join('')}</div>`, carriedWork);
  } catch (error) {
    place(formError(error), false);
  }
}

async function openPieceInSpace(sourceId) {
  let apiOrigin = location.origin;
  if (!window.CINNARIOS_PHONE) {
    const host = await fetch('/lan').then((response) => response.json());
    apiOrigin = `http://${host.address}:3001`;
  }
  const cameraHref = `cinnarios://try/${sourceId}?api=${encodeURIComponent(apiOrigin)}`;
  const call = window.Unity && window.Unity.call;
  if (typeof call === 'function') {
    call(cameraHref);
    return;
  }
  window.location.href = cameraHref;
}

function backHref(from) {
  if (from === 'search') return '#search';
  if (from === 'discover') return '#gallery';
  if (from === 'saved') return '#saved';
  if (from === 'home') return '#home';
  return pieceOrigin();
}

function describeFeel(work) {
  return { subject: window.Rooms.subjectName(work), mood: window.Rooms.moodName(work), colour: window.Rooms.colourName(work) };
}

async function renderDiscover() {
  setPage('visit', 'Discover');
  try {
    const catalog = await api('/catalog/artworks');
    const picks = new window.Cinnarios.DiscoverySampler(describeFeel).pick(catalog, { count: 18, triedIds: window.Rooms.triedIds() });
    const page = new window.Cinnarios.DiscoverPage(picks, catalog.length, { esc });
    place(page.html(), false, () => page.bind());
  } catch (error) {
    place(formError(error), false);
  }
}

async function renderSearch() {
  setPage('visit', 'Search');
  try {
    const catalog = await api('/catalog/artworks');
    const page = new window.Cinnarios.SearchPage(catalog, new window.Cinnarios.CatalogSearch(describeFeel), { esc, money });
    place(page.html(), false, () => page.bind());
  } catch (error) {
    place(formError(error), false);
  }
}

async function renderWork(sourceId, from) {
  carriedWork = sourceId;
  try {
    const [work, catalog] = await Promise.all([api(`/catalog/artworks/${sourceId}`), api('/catalog/artworks')]);
    setPage('visit', work.title);
    const prior = await loadConfidence(sourceId);
    const seen = new Set(prior?.signals ?? []);
    if (signedIn()) {
      try {
        await journey('artwork_viewed', sourceId);
        if (!seen.has('credit_reviewed')) await journey('credit_reviewed', sourceId);
      } catch {
        /* A stale sign-in should not hide the painting. */
      }
    }
    const reserved = window.Rooms.isReserved(sourceId);
    const page = new window.Cinnarios.PiecePage({
      work,
      feel: describeFeel(work),
      similar: new window.Cinnarios.SimilarityRanker(describeFeel).rank(work, catalog, 5),
      from,
      backHref: backHref(from),
      saved: window.Rooms.isSaved(sourceId),
      canAdd: signedIn() && !reserved,
      extra: window.Rooms.workFacts(work) + (signedIn() ? '' : '<p class="piece-note"><a href="#enter">Sign in</a> to keep a cart.</p>'),
    }, { esc, money });
    place(page.html(), sourceId, () => {
      window.Rooms.bindWork(work);
      page.bind({
        openCamera: () => openPieceInSpace(sourceId),
        toggleSaved: () => window.Rooms.toggleSaved(sourceId),
        addToCart: async () => {
          if (window.Rooms.isReserved(sourceId)) {
            throw new Error('This browser already reserved that print in a sandbox order. Release it on this page to add it again.');
          }
          await api('/cart/items', { method: 'POST', body: JSON.stringify({ sourceId, quantity: 1 }) });
          await refreshCartCount();
          location.hash = '#cart';
        },
      });
    });
  } catch (error) {
    setPage('visit', 'Work');
    place(formError(error), false);
  }
}

async function showPhone(sourceId) {
  document.querySelector('#handoff').hidden = false;
  const host = window.CINNARIOS_PHONE ? null : await fetch('/lan').then((response) => response.json());
  const target = window.CINNARIOS_PHONE
    ? `${location.origin}/#try/${sourceId}`
    : `http://${host.address}:3000/#try/${sourceId}`;
  const link = document.querySelector('#phone-link');
  link.href = target;
  link.textContent = target;
  document.querySelector('#phone-qr').src = `/qr.svg?text=${encodeURIComponent(target)}`;
}

async function renderTry(sourceId) {
  carriedWork = sourceId;
  try {
    const work = await api(`/catalog/artworks/${sourceId}`);
    setPage('visit', work.title);
    const current = await loadConfidence(sourceId);
    const host = window.CINNARIOS_PHONE ? null : await fetch('/lan').then((response) => response.json());
    const apiOrigin = window.CINNARIOS_PHONE ? location.origin : `http://${host.address}:3001`;
    const cameraHref = `cinnarios://try/${sourceId}?api=${encodeURIComponent(apiOrigin)}`;
    place(`
      <article class="detail">
        <img src="${esc(work.imageUrl)}" alt="${esc(work.title)}" />
        <div class="facts">
          <h1>${esc(work.title)}</h1>
          <p>${esc(work.artist || 'Unknown artist')}${work.date ? `, ${esc(work.date)}` : ''}</p>
          <p class="measures">${esc(work.widthCm)} × ${esc(work.heightCm)} × ${esc(work.depthCm)} cm</p>
          <p class="price">${esc(money(work.priceAmount, work.currency))}</p>
          ${rateNote()}
          <p>${esc(work.creditLine)}</p>
          <p>${esc(work.mediumDescription)}</p>
          <div class="actions">
            <a class="button" id="open-camera" href="${esc(cameraHref)}">Open in camera</a>
          </div>
          <p class="note">This opens the wall on the phone. The question starts after the painting is locked.</p>
          <section class="block" id="decision" hidden>
            <h2>This try</h2>
            <p id="decision-line"></p>
          </section>
          <p id="try-error" class="error" role="alert"></p>
        </div>
      </article>`, sourceId, () => window.Rooms?.bindTry(work, cameraHref));
  } catch (error) {
    setPage('visit', 'Try on');
    place(formError(error), false);
  }
}

async function renderCart() {
  carriedWork = null;
  setPage('visit', 'Cart');
  if (!signedIn()) {
    place('<section class="cart-page"><h1>Cart</h1><div class="empty-state"><h2>Sign in to keep a cart</h2><p>Your cart stays with your account, on the phone and on the computer.</p><a class="button" href="#enter">Sign in</a></div></section>', false);
    return;
  }
  try {
    const cart = await api('/cart');
    const page = new window.Cinnarios.CartPage(cart, {
      setQuantity: async (id, quantity) => {
        await api(`/cart/items/${id}`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
        await refreshCartCount();
        return api('/cart');
      },
      remove: async (id) => {
        await api(`/cart/items/${id}`, { method: 'DELETE' });
        await refreshCartCount();
        return api('/cart');
      },
    }, { esc, money });
    place(page.html(), false, () => page.bind());
  } catch (error) {
    place(formError(error), false);
  }
}

async function renderCheckout() {
  setPage('visit', 'Check out');
  if (!signedIn()) {
    location.hash = '#enter';
    return;
  }
  try {
    const [cart, addresses] = await Promise.all([api('/cart'), api('/me/addresses')]);
    if (!cart.items.length) {
      location.hash = '#cart';
      return;
    }
    const page = new window.Cinnarios.CheckoutPage(cart, addresses[addresses.length - 1] || null, RW_PROVINCES, {
      placeOrder: async (address, tierId) => {
        const saved = await api('/me/addresses', { method: 'POST', body: JSON.stringify(address) });
        const order = await api('/checkout', { method: 'POST', body: JSON.stringify({ addressId: saved.id, sessionId: sessionId() }) });
        window.Cinnarios.Delivery.rememberForOrder(order.number, tierId);
        sessionStorage.setItem('marketplace.lastOrder', order.number);
        await refreshCartCount();
        location.hash = `#receipt/${order.number}`;
      },
    }, { esc, money });
    place(page.html(), false, () => page.bind());
  } catch (error) {
    place(formError(error), false);
  }
}

async function renderReceipt(number) {
  setPage('visit', 'Order placed');
  try {
    const order = (await api('/orders')).find((item) => item.number === number);
    if (!order) throw new Error('That order is not on this account.');
    const page = new window.Cinnarios.OrderPlacedPage(order, window.Cinnarios.Delivery.forOrder(number), { esc, money });
    place(page.html(), false);
  } catch (error) {
    place(formError(error), false);
  }
}

async function renderSaved() {
  setPage('visit', 'Saved');
  try {
    const catalog = await api('/catalog/artworks');
    const page = new window.Cinnarios.SavedPage(catalog, window.Rooms, { esc, money });
    place(page.html(), false, () => page.bind());
  } catch (error) {
    place(formError(error), false);
  }
}

async function renderAccount() {
  carriedWork = null;
  setPage('visit', 'Account');
  if (!signedIn()) {
    location.hash = '#enter';
    return;
  }
  try {
    const [me, collector, orders, catalog, addresses] = await Promise.all([
      api('/me'), api('/me/collector'), api('/orders'), api('/catalog/artworks'), api('/me/addresses'),
    ]);
    const page = new window.Cinnarios.AccountPage({
      email: me.email,
      displayName: collector.displayName,
      orders,
      catalog,
      addresses,
      tries: window.Rooms.tries(),
      savedIds: window.Rooms.savedIds(),
    }, {
      rename: (displayName) => api('/me/collector', { method: 'PATCH', body: JSON.stringify({ displayName }) }),
      removeAddress: async (id) => {
        await api(`/me/addresses/${id}`, { method: 'DELETE' });
        renderAccount();
      },
      signOut: async () => {
        try {
          await api('/auth/logout', { method: 'POST', body: '{}' });
        } catch {
          /* The local session still ends. */
        }
        sessionStorage.removeItem(tokenKey);
        cartCount.textContent = '';
        location.hash = '#enter';
      },
    }, { esc, money });
    place(page.html(), false, () => page.bind());
  } catch (error) {
    place(formError(error), false);
  }
}

if (location.pathname === '/reset-password') {
  const token = new URLSearchParams(location.search).get('token');
  if (token) sessionStorage.setItem('marketplace.reset', token);
  history.replaceState(null, '', '/#reset');
}

window.Shop = {
  api, esc, money, rateNote, place, setPage, signedIn, formError, refreshCartCount, sessionId, openPieceInSpace,
};

window.addEventListener('hashchange', () => {
  render();
  refreshCartCount();
});
render();
refreshCartCount();
