/** PWA install helper — detects Aaron's Apps hub false "already installed" and opens Chrome. */
(function () {
  'use strict';

  const cfg = window.PWA_INSTALL || {};
  const APP_NAME = cfg.name ||
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content ||
    document.title.split(/[—–|]/)[0].trim() ||
    'App';

  function appSlug() {
    if (cfg.slug) return cfg.slug;
    const parts = location.pathname.split('/').filter(Boolean);
    return parts[0] || '';
  }

  const INSTALL_URL = cfg.installUrl || (() => {
    const u = new URL('.', location.href);
    u.searchParams.set('install', '1');
    return u.href;
  })();

  let deferredInstallPrompt = null;

  function isStandaloneDisplay() {
    if (window.navigator.standalone === true) return true;
    return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  function launchedFromThisPwa() {
    try {
      return new URLSearchParams(location.search).get('homescreen') === '1';
    } catch {
      return false;
    }
  }

  function insideHubWindow() {
    if (!isStandaloneDisplay()) return false;
    if (launchedFromThisPwa()) return false;
    const slug = appSlug();
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === location.origin && slug) {
        if (!ref.pathname.includes('/' + slug + '/')) return true;
      }
    } catch {}
    if (!document.referrer) return true;
    return false;
  }

  function isThisAppStandalone() {
    return isStandaloneDisplay() && launchedFromThisPwa();
  }

  function isAndroidLike() {
    return /Android/i.test(navigator.userAgent || '');
  }

  function isIosLike() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function ensureUi() {
    if (document.getElementById('pwaInstallPrompt')) return;
    const style = document.createElement('style');
    style.textContent = `
      #pwaInstallPrompt{position:fixed;inset:0;background:rgba(4,8,16,.72);display:none;align-items:flex-end;justify-content:center;padding:16px;z-index:9999}
      #pwaInstallPrompt.show{display:flex}
      #pwaInstallCard{width:min(420px,100%);background:#141d30;border:1px solid #243149;border-radius:20px;padding:18px;color:#e8eefc;font:450 14px system-ui,sans-serif}
      #pwaInstallCard h3{margin:0 0 8px;font-size:1.1rem}
      #pwaInstallCard p{margin:0 0 12px;color:#8b9bb8;line-height:1.45}
      #pwaInstallCard .row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
      #pwaInstallCard button{cursor:pointer;border:0;border-radius:12px;min-height:44px;font:inherit;font-weight:700}
      #pwaInstallOpen{width:100%;margin-bottom:8px;background:linear-gradient(180deg,#2bb8aa,#1f8f84);color:#041714}
      #pwaInstallCopy{background:#1a2438;border:1px solid #243149;color:#e8eefc}
      #pwaInstallClose{background:#1a2438;border:1px solid #243149;color:#8b9bb8}
      #pwaInstallToast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%) translateY(120%);background:#1a2438;border:1px solid #243149;color:#e8eefc;padding:12px 16px;border-radius:14px;font:450 13px system-ui,sans-serif;z-index:10000;opacity:0;transition:.2s ease;max-width:92vw;text-align:center}
      #pwaInstallToast.show{transform:translateX(-50%) translateY(0);opacity:1}
    `;
    document.head.appendChild(style);
    const wrap = document.createElement('div');
    wrap.id = 'pwaInstallPrompt';
    wrap.innerHTML = `
      <div id="pwaInstallCard" role="dialog" aria-modal="true">
        <h3 id="pwaInstallTitle">Install ${APP_NAME}</h3>
        <p id="pwaInstallBody"></p>
        <button type="button" id="pwaInstallOpen">Open in Chrome</button>
        <div class="row">
          <button type="button" id="pwaInstallCopy">Copy link</button>
          <button type="button" id="pwaInstallClose">Got it</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const toast = document.createElement('div');
    toast.id = 'pwaInstallToast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
    document.getElementById('pwaInstallOpen').addEventListener('click', openInChrome);
    document.getElementById('pwaInstallCopy').addEventListener('click', copyInstallLink);
    document.getElementById('pwaInstallClose').addEventListener('click', closeHelp);
    wrap.addEventListener('click', e => { if (e.target === wrap) closeHelp(); });
  }

  function helpHtml(mode) {
    if (mode === 'hub') {
      return 'Opened from the <strong>Aaron\'s Apps</strong> hub — that installed app is the hub, not <strong>' + APP_NAME + '</strong>.<br><br>' +
        '1. Tap <strong>Open in Chrome</strong><br>2. Address bar must show this app\'s URL<br>3. <strong>⋮</strong> → <strong>Install app</strong> or <strong>Add to Home screen</strong>';
    }
    if (mode === 'running') {
      return 'This is the installed <strong>' + APP_NAME + '</strong> app.';
    }
    if (isIosLike()) {
      return 'Use <strong>Safari</strong>: copy link → paste → Share → <strong>Add to Home Screen</strong>.';
    }
    if (isAndroidLike()) {
      return 'In <strong>Chrome</strong> (address bar visible): <strong>⋮</strong> → <strong>Install app</strong> or <strong>Add to Home screen</strong>.';
    }
    return 'Use Chrome\'s install icon in the address bar, or the browser menu → Install app.';
  }

  function openHelp(mode) {
    ensureUi();
    const titles = { hub: 'Need Chrome to install', running: APP_NAME + ' installed', install: 'Install ' + APP_NAME };
    document.getElementById('pwaInstallTitle').textContent = titles[mode] || ('Install ' + APP_NAME);
    document.getElementById('pwaInstallBody').innerHTML = helpHtml(mode);
    document.getElementById('pwaInstallOpen').style.display = mode === 'running' ? 'none' : '';
    document.getElementById('pwaInstallPrompt').classList.add('show');
  }

  function closeHelp() {
    document.getElementById('pwaInstallPrompt')?.classList.remove('show');
  }

  function showToast(msg) {
    ensureUi();
    const el = document.getElementById('pwaInstallToast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove('show'), 4500);
  }

  function openInChrome() {
    const w = window.open(INSTALL_URL, '_blank', 'noopener,noreferrer');
    if (!w) {
      copyInstallLink();
      showToast('Popup blocked — link copied. Paste in Chrome.');
      return;
    }
    showToast('Opened in Chrome — then ⋮ → Install app');
  }

  async function copyInstallLink() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(INSTALL_URL);
      else throw new Error('no clipboard');
      showToast('Copied install link');
    } catch {
      showToast(INSTALL_URL);
    }
  }

  function updateUi() {
    const hub = insideHubWindow();
    const ours = isThisAppStandalone();
    const selectors = ['#btn-install', '#btnInstall', '#btn-install-app', '#btnInstallTop', '#btnInstallSettings', '#installBtn', '#qrInstall', '[data-pwa-install]'];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(btn => {
        if (ours && !deferredInstallPrompt && !hub) {
          btn.hidden = false;
          if (btn.dataset.pwaHideWhenInstalled !== 'false') btn.hidden = true;
          return;
        }
        btn.hidden = false;
        if (hub && !deferredInstallPrompt) {
          btn.textContent = cfg.hubLabel || 'Open in Chrome';
        } else if (deferredInstallPrompt) {
          btn.textContent = cfg.installLabel || 'Install';
        } else if (!btn.dataset.pwaKeepLabel) {
          btn.textContent = cfg.helpLabel || 'Install app';
        }
      });
    });
  }

  async function promptInstallApp() {
    if (insideHubWindow() && !deferredInstallPrompt) {
      openInChrome();
      openHelp('hub');
      return;
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      try {
        const choice = await deferredInstallPrompt.userChoice;
        if (choice?.outcome === 'accepted') showToast('Installing ' + APP_NAME + '…');
        else openHelp(insideHubWindow() ? 'hub' : 'install');
      } catch {
        openHelp('install');
      }
      deferredInstallPrompt = null;
      updateUi();
      return;
    }
    if (isThisAppStandalone()) {
      openHelp('running');
      return;
    }
    openHelp(insideHubWindow() ? 'hub' : 'install');
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    updateUi();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateUi();
    showToast(APP_NAME + ' installed');
  });

  ['btn-install', 'btnInstall', 'btn-install-app', 'btnInstallTop', 'btnInstallSettings', 'installBtn', 'qrInstall'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      e.preventDefault();
      promptInstallApp();
    });
  });

  document.querySelectorAll('[data-pwa-install]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); promptInstallApp(); });
  });

  try {
    if (new URLSearchParams(location.search).get('install') === '1') {
      const tryInstall = () => {
        if (insideHubWindow() && !deferredInstallPrompt) openHelp('hub');
        else promptInstallApp();
      };
      window.addEventListener('beforeinstallprompt', () => setTimeout(tryInstall, 50), { once: true });
      setTimeout(tryInstall, 700);
    }
  } catch {}

  window.PWAInstall = {
    prompt: promptInstallApp,
    openInChrome,
    copyLink: copyInstallLink,
    insideHubWindow,
    isThisAppStandalone,
    updateUi
  };

  updateUi();
})();
