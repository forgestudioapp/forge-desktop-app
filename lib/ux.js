// ══════════════════════════════════════════════
// FORGE — UX Enhancements
// ══════════════════════════════════════════════

// ── Toast Notifications ──
function forgeToast(msg, type) {
  type = type || 'info';
  var existing = document.querySelector('.forge-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.className = 'forge-toast forge-toast-' + type;
  var icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '!' : 'i';
  toast.innerHTML = '<span class="forge-toast-icon">' + icon + '</span><span>' + msg + '</span>';
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.classList.add('show'); });
  setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

// ── Copy to clipboard with feedback ──
function forgeCopy(text, label) {
  navigator.clipboard.writeText(text).then(function() {
    forgeToast((label || t('copied')), 'success');
  }).catch(function() {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    forgeToast((label || t('copied')), 'success');
  });
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', function(e) {
  // Escape — close panels/modals
  if (e.key === 'Escape') {
    var panel = document.querySelector('.notif-panel.open');
    if (panel) { panel.classList.remove('open'); return; }
    var modal = document.querySelector('.modal-overlay.open');
    if (modal) { modal.classList.remove('open'); return; }
    var sidebar = document.getElementById('assetsSidebar');
    if (sidebar && sidebar.classList.contains('open')) { sidebar.classList.remove('open'); return; }
  }
  // Ctrl+K — focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    var search = document.querySelector('#toolboxSearch, #searchInput, input[type="search"]');
    if (search) search.focus();
  }
});

// ── Hover glow effect for cards ──
function initCardGlow() {
  document.querySelectorAll('.agent-card, .api-card, .acc-card, .proj-card').forEach(function(card) {
    card.addEventListener('mousemove', function(e) {
      var rect = card.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      card.style.background = 'radial-gradient(600px circle at ' + x + 'px ' + y + 'px, rgba(59,130,246,0.06), transparent 40%)';
    });
    card.addEventListener('mouseleave', function() {
      card.style.background = '';
    });
  });
}

// ── Smooth page transitions ──
function navigateTo(url) {
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.2s ease';
  setTimeout(function() { window.location.href = url; }, 200);
}

// ── Tooltip on hover (lightweight) ──
function initTooltips() {
  document.querySelectorAll('[data-tooltip]').forEach(function(el) {
    var tip = null;
    el.addEventListener('mouseenter', function() {
      tip = document.createElement('div');
      tip.className = 'forge-tooltip';
      tip.textContent = el.getAttribute('data-tooltip');
      document.body.appendChild(tip);
      var rect = el.getBoundingClientRect();
      tip.style.left = rect.left + rect.width / 2 - tip.offsetWidth / 2 + 'px';
      tip.style.top = rect.top - tip.offsetHeight - 8 + 'px';
      requestAnimationFrame(function() { tip.classList.add('show'); });
    });
    el.addEventListener('mouseleave', function() {
      if (tip) { tip.remove(); tip = null; }
    });
  });
}

// ── Connection status dot ──
function updateConnectionDot(el, connected) {
  if (!el) return;
  el.style.background = connected ? 'var(--success)' : 'var(--smoke-dim)';
  el.title = connected ? t('connected') : t('not_connected');
}

// ── Skeleton loader ──
function showSkeleton(el, lines) {
  if (!el) return;
  lines = lines || 3;
  var html = '<div class="forge-skeleton">';
  for (var i = 0; i < lines; i++) {
    var w = 40 + Math.random() * 50;
    html += '<div class="forge-skeleton-line" style="width:' + w + '%"></div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

// ── Init all ──
document.addEventListener('DOMContentLoaded', function() {
  initCardGlow();
  initTooltips();
});
