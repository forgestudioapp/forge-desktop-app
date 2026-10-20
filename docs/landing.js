'use strict';
(() => {
  const WINDOWS_DOWNLOAD = 'https://github.com/forgestudioapp/forge-desktop-app/releases/latest/download/Forge-Windows-x64.exe';
  const userAgent = navigator.userAgent || '';
  const isWindows = /Windows/i.test(userAgent);
  const isIPad = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
  const isMac = !isIPad && /Macintosh|Mac OS X/i.test(userAgent);
  const downloadDialog = document.querySelector('#download-dialog');
  const primaryDownloads = [...document.querySelectorAll('.js-download-primary')];

  primaryDownloads.forEach(link => {
    const label = link.querySelector('[data-download-label]');
    const icon = link.querySelector('[data-download-icon]');
    if (isMac) {
      if (label) label.textContent = 'Télécharger pour Mac';
      if (icon) icon.setAttribute('href', '#i-mac');
      link.addEventListener('click', event => { event.preventDefault(); downloadDialog.showModal(); });
    } else if (isWindows) {
      link.href = WINDOWS_DOWNLOAD;
      if (label) label.textContent = 'Télécharger pour Windows';
    } else {
      if (label) label.textContent = 'Choisir ma version';
      link.addEventListener('click', event => { event.preventDefault(); downloadDialog.showModal(); });
    }
  });
  document.querySelectorAll('[data-open-download]').forEach(button => button.addEventListener('click', () => downloadDialog.showModal()));
  downloadDialog.querySelector('.dialog-close').addEventListener('click', () => downloadDialog.close());
  downloadDialog.addEventListener('click', event => {
    if (event.target !== downloadDialog) return;
    const rect = downloadDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) downloadDialog.close();
  });

  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('#navigation');
  function closeMenu() { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Ouvrir le menu'); }
  menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; nav.classList.toggle('open', open); menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu'); });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });
  const video = document.querySelector('#demo-video');
  const image = document.querySelector('#demo-image');
  const toggle = document.querySelector('#play-toggle');
  const tabs = [...document.querySelectorAll('[data-demo]')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = navigator.connection && navigator.connection.saveData;
  let active = 'dragon';
  let manuallyPaused = false;
  let isVisible = false;
  const demos = {
    dragon: { prompt: '« Améliore l’animation du dragon. »', tag: 'MODÈLES & ANIMATIONS', caption: 'Extrait de notre projet Steal an Egg, après plusieurs itérations.', label: 'Extrait enregistré : dragon violet animé dans Roblox' },
    shop: { prompt: '« Crée une boutique pour mon jeu. »', tag: 'INTERFACES & ACHATS', caption: 'Boutique et fenêtre d’achat testées dans Roblox Studio.', label: 'Extrait enregistré : boutique et achat de test dans Roblox Studio' },
    thumbnail: { prompt: '« Remplace le personnage par un skin bacon. »', tag: 'MINIATURES & ICÔNES', caption: 'Miniature de Steal an Egg, générée puis modifiée avec Forge.' }
  };
  function updatePlayback() { const paused = video.paused; toggle.textContent = paused ? 'Lire l’extrait ▷' : 'Pause Ⅱ'; toggle.setAttribute('aria-label', paused ? 'Lire la démonstration' : 'Mettre la démonstration en pause'); }
  function playIfAllowed() { if (active !== 'thumbnail' && isVisible && !manuallyPaused && !reduceMotion.matches && !saveData && !document.hidden && !document.querySelector('#tutorial-dialog').open) video.play().catch(updatePlayback); }
  function selectDemo(key, focus = false) {
    if (!demos[key]) return;
    video.pause(); active = key;
    const d = demos[key];
    tabs.forEach(tab => { const selected = tab.dataset.demo === key; tab.classList.toggle('active', selected); tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; if (selected && focus) tab.focus(); });
    document.querySelector('#demo-panel').setAttribute('aria-labelledby', `tab-${key}`);
    document.querySelector('#demo-prompt').textContent = d.prompt;
    document.querySelector('#demo-tag').textContent = d.tag;
    document.querySelector('#demo-caption').textContent = d.caption;
    const still = key === 'thumbnail';
    video.hidden = still; image.hidden = !still; toggle.hidden = still;
    if (!still) { video.poster = `assets/showcase/${key}.webp`; video.src = `assets/showcase/${key}.mp4`; video.setAttribute('aria-label', d.label); video.load(); playIfAllowed(); }
    updatePlayback();
  }
  tabs.forEach((tab, index) => { tab.addEventListener('click', () => selectDemo(tab.dataset.demo)); tab.addEventListener('keydown', e => { let next; if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % tabs.length; if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index + tabs.length - 1) % tabs.length; if (e.key === 'Home') next = 0; if (e.key === 'End') next = tabs.length - 1; if (next !== undefined) { e.preventDefault(); selectDemo(tabs[next].dataset.demo, true); } }); });
  document.querySelectorAll('[data-select-demo]').forEach(link => link.addEventListener('click', () => selectDemo(link.dataset.selectDemo)));
  toggle.addEventListener('click', () => { if (video.paused) { manuallyPaused = false; video.play().catch(updatePlayback); } else { manuallyPaused = true; video.pause(); } });
  video.addEventListener('play', updatePlayback); video.addEventListener('pause', updatePlayback);
  video.addEventListener('error', () => { toggle.textContent = 'Relancer l’extrait ▷'; });
  new IntersectionObserver(entries => { isVisible = entries[0].isIntersecting; if (!isVisible) video.pause(); else playIfAllowed(); }, { threshold: .2 }).observe(video.parentElement);
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); else playIfAllowed(); });
  reduceMotion.addEventListener('change', () => { if (reduceMotion.matches) video.pause(); else playIfAllowed(); });
  const dialog = document.querySelector('#tutorial-dialog');
  let returnFocus;
  document.querySelectorAll('[data-open-tutorial]').forEach(button => button.addEventListener('click', () => {
    returnFocus = button; video.pause();
    dialog.showModal();
  }));
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { returnFocus?.focus(); playIfAllowed(); });
})();
