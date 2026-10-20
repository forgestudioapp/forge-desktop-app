/* Mesure d'audience Forge. Ce fichier ne doit être chargé qu'après consentement. */
(function () {
  try {
    var consent = null;
    try { consent = JSON.parse(localStorage.getItem('forge_consent_v1')); } catch (e) {}
    if (!consent || consent.choice !== 'accepted' || !Number.isFinite(consent.at) || Date.now() - consent.at > 15552000000) return;

    // Une seule visite comptée par session et par page.
    var sessionKey = 'forge_visit_' + location.pathname;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, '1');
    } catch (e) {}

    var sid = null;
    try { sid = sessionStorage.getItem('forge_session_id'); } catch (e) {}
    if (!sid) {
      sid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'session-' + Date.now() + '-' + Math.random().toString(16).slice(2);
      try { sessionStorage.setItem('forge_session_id', sid); } catch (e) {}
    }

    var referrer = '';
    try { referrer = document.referrer ? new URL(document.referrer).hostname.slice(0, 253) : ''; } catch (e) {}

    var ctrl = null;
    try { ctrl = new AbortController(); setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 5000); } catch (e) {}

    fetch('https://quzbsdcjtkmdeuiyyhnv.supabase.co/rest/v1/site_visits', {
      method: 'POST',
      headers: {
        apikey: 'sb_publishable_QW7shrfHfWDhnS8AUC8e5A_y6zxMCIx',
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        page: location.pathname,
        referrer: referrer || null,
        session_id: sid
      }),
      signal: ctrl ? ctrl.signal : undefined,
      keepalive: true
    }).catch(function () {});
  } catch (e) {}
})();
