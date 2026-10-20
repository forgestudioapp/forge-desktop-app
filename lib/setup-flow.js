(function(root, factory) {
  const flow = factory();
  if (typeof module === 'object' && module.exports) module.exports = flow;
  else {
    root.forgeSetup = flow;
    document.addEventListener('DOMContentLoaded', () => {
      const page = location.pathname.split('/').pop();
      const index = flow.pages.indexOf(page);
      if(index < 0) return;
      const enabled = flow.active(location.search);
      for(const element of document.querySelectorAll('.dots,.step-footer')) element.hidden = !enabled;
      if(!enabled) {
        if(page==='api-keys.html') { const button=document.getElementById('continueBtn');button?.removeAttribute('data-i18n');if(button)button.textContent=localStorage.getItem('forge_lang')==='en'?'Back to settings →':'Retour aux paramètres →'; }
        return;
      }
      document.body.classList.add('forge-setup');
      const en = localStorage.getItem('forge_lang') === 'en';
      const dots = document.getElementById('dots');
      if(dots) { dots.replaceChildren(); flow.pages.forEach((_,i)=>{const dot=document.createElement('i');dot.className=i===index?'on':'';dots.append(dot);}); }
      const footer=document.querySelector('.step-footer');
      if(footer) { footer.removeAttribute('data-i18n');footer.textContent=en?`Step ${index+1} of 5`:`Étape ${index+1} sur 5`; }
      const button=document.getElementById('continueBtn');
      if(button) { button.removeAttribute('data-i18n');button.textContent=index===4?(en?'Open my projects →':'Ouvrir mes projets →'):(en?'Continue →':'Continuer →'); }
      const explanation=document.createElement('p');explanation.style.cssText='text-align:center;margin:12px 20px;color:var(--smoke);font-size:12px;line-height:1.6';
      explanation.textContent=en?'Device check → Roblox → Account → AI agent → Optional services':'Vérification → Roblox → Compte → Agent IA → Services optionnels';
      document.querySelector('.step-footer')?.before(explanation);
    });
  }
})(typeof window === 'object' ? window : globalThis, function() {
  const pages=['onboarding.html','roblox-studio.html','login.html','agents.html','api-keys.html'];
  const active=search=>new URLSearchParams(search).get('setup')==='1';
  function next(page,search) {
    if(!active(search)) return page==='api-keys.html'?'settings.html#connections':'projects.html';
    const index=pages.indexOf(page);
    return index>=0&&index<pages.length-1?pages[index+1]+'?setup=1':'projects.html';
  }
  return {pages,active,next};
});
