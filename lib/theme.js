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
  if (!['projects.html','project-create.html','project-settings.html','workspace.html','thumbnail.html','settings.html','accounts.html','api-keys.html','agents.html','onboarding.html'].includes(page)) return;
  const en = localStorage.getItem('forge_lang') === 'en';
  const nav = document.createElement('nav'); nav.className = 'forge-navigation'; nav.setAttribute('aria-label', en ? 'Main navigation' : 'Navigation principale');
  const brand = document.createElement('a'); brand.href='projects.html'; brand.target='_self'; brand.className='forge-brand'; brand.textContent='FORGE'; nav.append(brand);
  [['projects.html','Projets','Projects'],['accounts.html','Connexions','Connections'],['settings.html','Paramètres','Settings']].forEach(([href,fr,eng]) => {
    const a = document.createElement('a'); a.href = href; a.target='_self'; a.textContent=en?eng:fr;
    if (page === href || (href === 'accounts.html' && ['agents.html','api-keys.html','onboarding.html'].includes(page))) a.setAttribute('aria-current','page');
    nav.append(a);
  });
  document.body.classList.add('forge-shell');
  document.body.classList.toggle('forge-workspace',page==='workspace.html');
  document.body.classList.toggle('forge-media',page==='thumbnail.html');
  document.body.prepend(nav);
  if (['accounts.html','agents.html','api-keys.html','onboarding.html'].includes(page)) {
    document.body.classList.add('forge-connections');
    const links=document.createElement('nav');links.className='forge-context-navigation';
    links.setAttribute('aria-label',en?'Connection settings':'Réglages des connexions');
    [['accounts.html','Comptes','Accounts'],['agents.html','Agents IA','AI agents'],['api-keys.html','Services médias','Media services'],['onboarding.html','Installation et diagnostic','Setup and diagnostics']].forEach(([href,fr,eng])=>{const a=document.createElement('a');a.href=href;a.textContent=en?eng:fr;if(page===href)a.setAttribute('aria-current','page');links.append(a);});
    nav.after(links);
  }
  if (['workspace.html','thumbnail.html','project-settings.html'].includes(page)) {
    window.forgeAPI?.getActiveProjectInfo().then(result=>{
      if(!result.project){location.replace('projects.html?choose=1');return;}
      const links=document.createElement('nav');links.className='forge-context-navigation';links.setAttribute('aria-label',en?'Current project':'Projet actif');
      const name=document.createElement('strong');name.textContent=result.project.name;links.append(name);
      [['workspace.html','Agents','Agents'],['thumbnail.html','Médias','Media'],['project-settings.html','Réglages du projet','Project settings']].forEach(([href,fr,eng])=>{const a=document.createElement('a');a.href=href;a.textContent=en?eng:fr;if(page===href)a.setAttribute('aria-current','page');links.append(a);});nav.after(links);
      if(page==='workspace.html'){
        const state=document.createElement('a');state.href='project-settings.html';state.className='forge-project-state';
        state.textContent=!result.project.linkedStudio?(en?'Local project · Link Studio →':'Projet local · Associer Studio →'):result.project.syncPaused!==false?(en?'File sync paused · Manage →':'Synchronisation en pause · Gérer →'):(en?'Manage Studio connection →':'Gérer la connexion Studio →');links.append(state);
        const setup=document.createElement('a');setup.href='agents.html';setup.textContent=en?'Install / sign in to agents':'Installer / connecter les agents';links.append(setup);
      }
    }).catch(()=>{});
  }
});
