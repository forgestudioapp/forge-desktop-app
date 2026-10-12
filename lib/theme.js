/* ============================================
   FORGE — Theme loader
   Inclure via <script src="lib/theme.js"></script>
   Avant tout autre <style> pour eviter le flash.
   ============================================ */
(function() {
  try {
    var s = JSON.parse(localStorage.getItem('forge_settings') || '{}');
    if (s.theme === 'light' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches)) {
      document.documentElement.classList.add('light-theme');
    }
  } catch(e) {}
})();

/* Fonction globale pour changer le theme depuis n'importe quelle page */
function forgeToggleTheme() {
  var isLight = document.documentElement.classList.toggle('light-theme');
  try {
    var s = JSON.parse(localStorage.getItem('forge_settings') || '{}');
    s.theme = isLight ? 'light' : 'dark';
    localStorage.setItem('forge_settings', JSON.stringify(s));
  } catch(e) {}
}

function forgeGetTheme() {
  return document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
}

function forgePreferences() {
  try { return JSON.parse(localStorage.getItem('forge_settings') || '{}') || {}; } catch (_) { return {}; }
}
function forgeApplyPreferences() {
  const s = forgePreferences(), root = document.documentElement;
  root.classList.toggle('light-theme', s.theme === 'light' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches));
  root.classList.toggle('reduce-motion', !!s.reduceMotion);
  root.dataset.density = s.density === 'compact' ? 'compact' : 'comfortable';
  root.style.zoom = String([100,110,125].includes(Number(s.interfaceScale)) ? Number(s.interfaceScale)/100 : 1);
}
forgeApplyPreferences();
matchMedia('(prefers-color-scheme: light)').addEventListener('change', forgeApplyPreferences);
window.addEventListener('storage', forgeApplyPreferences);
document.addEventListener('DOMContentLoaded', () => {
  const page = location.pathname.split('/').pop();
  if (!['projects.html','workspace.html','thumbnail.html','settings.html','accounts.html','api-keys.html','agents.html'].includes(page)) return;
  const en = localStorage.getItem('forge_lang') === 'en';
  const nav = document.createElement('nav'); nav.className = 'forge-navigation'; nav.setAttribute('aria-label', en ? 'Main navigation' : 'Navigation principale');
  const brand = document.createElement('a'); brand.href='projects.html'; brand.target='_self'; brand.className='forge-brand'; brand.textContent='FORGE'; nav.append(brand);
  [['projects.html','Projets','Projects'],['workspace.html','Espace de travail','Workspace'],['thumbnail.html','Médias','Media'],['settings.html','Paramètres','Settings']].forEach(([href,fr,eng]) => {
    const a = document.createElement('a'); a.href = href; a.target='_self'; a.textContent=en?eng:fr;
    if (page === href || (href === 'settings.html' && ['accounts.html','api-keys.html'].includes(page))) a.setAttribute('aria-current','page');
    nav.append(a);
  });
  document.body.classList.add('forge-shell');
  document.body.classList.toggle('forge-workspace',page==='workspace.html');
  document.body.classList.toggle('forge-media',page==='thumbnail.html');
  document.body.prepend(nav);
});
