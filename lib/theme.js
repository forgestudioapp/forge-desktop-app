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
  try {
    const settings = JSON.parse(localStorage.getItem('forge_settings') || '{}') || {};
    let changed = false;
    if (!['claude','codex'].includes(settings.preferredAgent)) {
      if (settings.preferredAgent !== undefined) changed = true;
      settings.preferredAgent = 'claude';
    }
    if (settings.startupAgents && Object.prototype.hasOwnProperty.call(settings.startupAgents, 'antigravity')) {
      settings.startupAgents = { ...settings.startupAgents };
      delete settings.startupAgents.antigravity;
      changed = true;
    }
    if (changed) localStorage.setItem('forge_settings', JSON.stringify(settings));
    return settings;
  } catch (_) { return { preferredAgent: 'claude' }; }
}
function forgeApplyPreferences() {
  const s = forgePreferences(), root = document.documentElement;
  root.classList.toggle('light-theme', s.theme === 'light' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches));
  root.classList.toggle('reduce-motion', !!s.reduceMotion);
  root.dataset.density = s.density === 'compact' ? 'compact' : 'comfortable';
  root.style.zoom = String([100,110,125].includes(Number(s.interfaceScale)) ? Number(s.interfaceScale)/100 : 1);
}

const FORGE_SETTINGS_RETURN_KEY = 'forge-settings-return';
const FORGE_SETTINGS_RETURN_PAGES = new Set(['projects.html','project-create.html','workspace.html','thumbnail.html','project-settings.html','roblox-studio.html']);
function forgeSafeReturnTarget(value) {
  if (typeof value !== 'string' || !value) return '';
  const match = value.match(/^([a-z0-9-]+\.html)([?#][^\\]*)?$/i);
  return match && FORGE_SETTINGS_RETURN_PAGES.has(match[1]) ? value : '';
}
function forgeRememberSettingsReturn(value) {
  const safe = forgeSafeReturnTarget(value);
  if (safe) try { sessionStorage.setItem(FORGE_SETTINGS_RETURN_KEY, safe); } catch (_) {}
  return safe;
}
function forgeSettingsReturnTarget() {
  const explicit = forgeSafeReturnTarget(new URLSearchParams(location.search).get('from') || '');
  if (explicit) return forgeRememberSettingsReturn(explicit);
  try { return forgeSafeReturnTarget(sessionStorage.getItem(FORGE_SETTINGS_RETURN_KEY) || '') || 'projects.html'; }
  catch (_) { return 'projects.html'; }
}
forgeApplyPreferences();
matchMedia('(prefers-color-scheme: light)').addEventListener('change', forgeApplyPreferences);
window.addEventListener('storage', forgeApplyPreferences);
document.addEventListener('DOMContentLoaded', () => {
  const page = location.pathname.split('/').pop();
  if(window.forgeSetup?.active(location.search)) return;
  if (!['projects.html','project-create.html','project-settings.html','workspace.html','thumbnail.html','settings.html','accounts.html','api-keys.html','agents.html','onboarding.html'].includes(page)) return;
  const en = localStorage.getItem('forge_lang') === 'en';
  document.body.classList.add('forge-shell');
  document.body.classList.toggle('forge-workspace',page==='workspace.html');
  document.body.classList.toggle('forge-media',page==='thumbnail.html');
  if (page === 'settings.html') forgeSettingsReturnTarget();
  else if (FORGE_SETTINGS_RETURN_PAGES.has(page)) forgeRememberSettingsReturn(page + location.search + location.hash);
  if (['accounts.html','agents.html','onboarding.html','api-keys.html'].includes(page)) {
    document.body.classList.add('forge-connections');
    const back=document.createElement('a');
    back.className='forge-simple-back';
    back.href=page==='onboarding.html'?'settings.html#guide':'settings.html#connections';
    back.textContent=en?'← Back to settings':'← Retour aux paramètres';
    document.body.prepend(back);
  }
  if (['workspace.html','thumbnail.html','project-settings.html'].includes(page)) {
    window.forgeAPI?.getActiveProjectInfo().then(result=>{
      if(!result.project){location.replace('projects.html?choose=1');return;}
      const links=document.createElement('nav');links.className='forge-context-navigation';links.setAttribute('aria-label',en?'Current project':'Projet actif');
      const back=document.createElement('a');back.href='projects.html';back.className='forge-project-back';back.textContent=en?'← Projects':'← Projets';links.append(back);
      const name=document.createElement('strong');name.textContent=result.project.name;links.append(name);
      [['workspace.html','Agents','Agents'],['thumbnail.html','Médias','Media'],['project-settings.html','Studio','Studio']].forEach(([href,fr,eng])=>{const a=document.createElement('a');a.href=href;a.textContent=en?eng:fr;if(page===href)a.setAttribute('aria-current','page');links.append(a);});
      document.body.prepend(links);
    }).catch(()=>{});
  }
});
window.addEventListener('hashchange',()=>{
  const page=location.pathname.split('/').pop();
  if(FORGE_SETTINGS_RETURN_PAGES.has(page))forgeRememberSettingsReturn(page+location.search+location.hash);
});
