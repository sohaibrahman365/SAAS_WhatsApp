/* ============================================================
   GeniSearch — Shared JS Utilities
   ============================================================ */

/* ── Navigation: mark active link ── */
(function () {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach(link => {
    const href = link.getAttribute('href');
    if (href === page || (page === 'index.html' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
})();

/* ── Modal helpers ── */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// Close on backdrop click
document.addEventListener('click', function (e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// Close on Escape
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

/* ── Tab switching ── */
function initTabs(containerSelector) {
  document.querySelectorAll(containerSelector || '.tabs').forEach(tabBar => {
    tabBar.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        // deactivate siblings
        tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // hide/show panels
        const panelGroup = tab.closest('[data-tab-group]') || document;
        panelGroup.querySelectorAll('[data-panel]').forEach(p => {
          p.style.display = p.dataset.panel === target ? '' : 'none';
        });
      });
    });
  });
}
document.addEventListener('DOMContentLoaded', () => initTabs());

/* ── Chart.js defaults ── */
if (typeof Chart !== 'undefined') {
  Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#7f8c8d';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.plugins.tooltip.backgroundColor = '#2c3e50';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
}

/* ── Palette helpers ── */
const GS = {
  primary:   '#667eea',
  secondary: '#764ba2',
  success:   '#27ae60',
  danger:    '#e74c3c',
  warning:   '#f39c12',
  info:      '#3498db',

  gradientLine(ctx, colorA, colorB) {
    if (!ctx) return colorA;
    const g = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
    g.addColorStop(0, colorA);
    g.addColorStop(1, colorB || colorA);
    return g;
  },

  gradientFill(ctx, color) {
    if (!ctx) return color;
    const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    g.addColorStop(0, color + '33');
    g.addColorStop(1, color + '00');
    return g;
  },

  palette: ['#667eea','#27ae60','#e74c3c','#f39c12','#3498db','#764ba2','#1abc9c','#e67e22'],
};

/* ── Number formatters ── */
function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n;
}
function fmtPKR(n) {
  return 'PKR ' + Number(n).toLocaleString();
}
function fmtPct(n) {
  return (+n).toFixed(1) + '%';
}

/* ── Date helpers ── */
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

/* ── Notification toast ── */
function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; bottom:1.5rem; right:1.5rem; z-index:9999;
    background:${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
    color:#fff; padding:.75rem 1.25rem; border-radius:8px;
    font-size:.875rem; font-weight:500; box-shadow:0 4px 16px rgba(0,0,0,.2);
    animation: slideIn .2s ease;
  `;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ── Expose globals ── */
window.openModal  = openModal;
window.closeModal = closeModal;
window.GS         = GS;
window.fmtNum     = fmtNum;
window.fmtPKR     = fmtPKR;
window.fmtPct     = fmtPct;
window.fmtDate    = fmtDate;
window.toast      = toast;
