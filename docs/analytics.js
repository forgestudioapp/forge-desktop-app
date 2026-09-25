/* Forge analytics — visites anonymes, sans IP ni cookie tiers.
 * Opt-out perso : visiter une page avec ?notrack=1 (mémorisé), ou
 * localStorage.forge_no_track = '1'. Les visites exclues ne sont jamais envoyées.
 */
(function () {
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.has('notrack') || qs.has('no-track')) {
      try { localStorage.setItem('forge_no_track', '1'); } catch (e) {}
      return;
    }
    try {
      if (localStorage.getItem('forge_no_track') === '1') return;
    } catch (e) {}
    // Une seule visite comptée par session et par page.
    var sessionKey = 'forge_visit_' + location.pathname;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, '1');
    } catch (e) {}

    var sid = null;
    try {
      sid = localStorage.getItem('forge_sid');
      if (!sid) {
        sid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
        localStorage.setItem('forge_sid', sid);
      }
    } catch (e) {
      sid = 'session-' + Date.now();
    }

    var ctrl = null;
    try { ctrl = new AbortController(); setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 5000); } catch (e) {}

    fetch('https://quzbsdcjtkmdeuiyyhnv.supabase.co/rest/v1/site_visits', {
      method: 'POST',
      headers: {
        apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1emJzZGNqdGttZGV1aXl5aG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMjAwNTksImV4cCI6MjEwMTU5NjA1OX0.ToM71JAeMxTQNFatqcnSPK2xLQIye8vRU1nDmoyyMbE',
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1emJzZGNqdGttZGV1aXl5aG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMjAwNTksImV4cCI6MjEwMTU5NjA1OX0.ToM71JAeMxTQNFatqcnSPK2xLQIye8vRU1nDmoyyMbE',
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        page: location.pathname,
        referrer: (document.referrer || '').slice(0, 500),
        session_id: sid
      }),
      signal: ctrl ? ctrl.signal : undefined,
      keepalive: true
    }).catch(function () {});
  } catch (e) {}
})();
