/* ============================================
   FORGE — Theme loader
   Inclure via <script src="lib/theme.js"></script>
   Avant tout autre <style> pour eviter le flash.
   ============================================ */
(function() {
  try {
    var s = JSON.parse(localStorage.getItem('forge_settings') || '{}');
    if (s.theme === 'light') {
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
