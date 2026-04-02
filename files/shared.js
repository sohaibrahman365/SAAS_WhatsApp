/* ============================================================
   GeniSearch — Shared JS Utilities
   Version 2.0
   ============================================================ */

/* ── API Configuration ── */
const API_BASE = 'https://saaswhatsapp.up.railway.app/api';

/* ============================================================
   AUTH MANAGEMENT
   ============================================================ */

function getToken() {
  return localStorage.getItem('gs_token');
}

function getUser() {
  try {
    const raw = localStorage.getItem('gs_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setAuth(token, user) {
  localStorage.setItem('gs_token', token);
  localStorage.setItem('gs_user', JSON.stringify(user));
}

function logout() {
  localStorage.removeItem('gs_token');
  localStorage.removeItem('gs_user');
  window.location.href = 'login.html';
}

function requireLogin() {
  const token = getToken();
  if (!token) {
    window.location.href = 'login.html';
    return null;
  }
  return getUser();
}

/* ============================================================
   API CLIENT
   ============================================================ */

async function api(path, options = {}) {
  const url = API_BASE + path;
  const headers = {};

  const token = getToken();
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  const method = (options.method || 'GET').toUpperCase();
  if ((method === 'POST' || method === 'PATCH' || method === 'PUT') && options.body) {
    headers['Content-Type'] = 'application/json';
    if (typeof options.body === 'object') {
      options.body = JSON.stringify(options.body);
    }
  }

  const fetchOpts = {
    method: method,
    headers: { ...headers, ...(options.headers || {}) },
  };
  if (options.body) {
    fetchOpts.body = options.body;
  }

  const res = await fetch(url, fetchOpts);

  if (res.status === 401) {
    logout();
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    let errorMsg = 'Request failed';
    try {
      const errBody = await res.json();
      errorMsg = errBody.error || errBody.message || errorMsg;
    } catch (e) {
      errorMsg = res.statusText || errorMsg;
    }
    throw new Error(errorMsg);
  }

  // Handle 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

async function apiGet(path) {
  return api(path, { method: 'GET' });
}

async function apiPost(path, body) {
  return api(path, { method: 'POST', body: body });
}

async function apiPatch(path, body) {
  return api(path, { method: 'PATCH', body: body });
}

async function apiDelete(path) {
  return api(path, { method: 'DELETE' });
}

/* ============================================================
   UI HELPERS
   ============================================================ */

/* ── Toast Notifications ── */
function toast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = 'toast toast-' + type;

  // Icon based on type
  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    danger:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  el.innerHTML = (icons[type] || icons.info) + '<span>' + escapeHtml(message) + '</span>';
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 250);
  }, 3000);
}

/* ── Modal Helpers ── */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// Close modal on backdrop click
document.addEventListener('click', function (e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// Close modal on Escape key
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(function (m) {
      m.classList.remove('open');
    });
  }
});

/* ── Loading Spinner ── */
function showLoading(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  // Avoid duplicates
  if (container.querySelector('.spinner-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'spinner-wrap';
  wrap.innerHTML = '<div class="spinner"></div>';
  container.appendChild(wrap);
}

function hideLoading(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const wrap = container.querySelector('.spinner-wrap');
  if (wrap) wrap.remove();
}

/* ============================================================
   FORMATTERS
   ============================================================ */

function fmtNum(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US');
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '0.0%';
  // If the value looks like a ratio (0-1 range and not already a percentage)
  const val = Math.abs(n) <= 1 && Math.abs(n) !== 0 ? n * 100 : n;
  return val.toFixed(1) + '%';
}

function fmtDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtDateTime(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + ' ' + date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtCurrency(n) {
  if (n == null || isNaN(n)) return '\u20A8 0';
  return '\u20A8 ' + Number(n).toLocaleString('en-PK');
}

/* ============================================================
   HTML ESCAPE
   ============================================================ */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
   NAVIGATION
   ============================================================ */

function initNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach(function (link) {
    const href = link.getAttribute('href');
    if (href === page) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

function initSidebar() {
  const user = getUser();
  if (!user) return;

  const nameEl = document.querySelector('.sidebar-user .user-name');
  const roleEl = document.querySelector('.sidebar-user .user-role');
  const avatarEl = document.querySelector('.sidebar-user .avatar');

  if (nameEl) nameEl.textContent = user.name || user.email || 'User';
  if (roleEl) roleEl.textContent = user.role || 'Admin';
  if (avatarEl) {
    const name = user.name || user.email || 'U';
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  // Topbar avatar
  const topAvatar = document.querySelector('.topbar-avatar');
  if (topAvatar) {
    const name = user.name || user.email || 'U';
    topAvatar.textContent = name.charAt(0).toUpperCase();
  }
}

function initPage(pageTitle) {
  requireLogin();
  initNav();
  initSidebar();

  // Set topbar title
  if (pageTitle) {
    const titleEl = document.querySelector('.topbar-title');
    if (titleEl) titleEl.textContent = pageTitle;
  }

  // Mobile sidebar toggle
  const toggle = document.querySelector('.sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.querySelector('.sidebar-backdrop');

  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('open');
    });
  }
  if (backdrop && sidebar) {
    backdrop.addEventListener('click', function () {
      sidebar.classList.remove('open');
      backdrop.classList.remove('open');
    });
  }
}

/* ============================================================
   SIDEBAR HTML GENERATOR
   ============================================================ */

function sidebarHTML(activePage) {
  const page = activePage || location.pathname.split('/').pop() || 'index.html';

  function navItem(href, label, icon, badge) {
    const isActive = page === href ? ' active' : '';
    const badgeHtml = badge ? '<span class="nav-badge">' + badge + '</span>' : '';
    return '<a href="' + href + '" class="nav-item' + isActive + '">' +
      '<span class="nav-icon">' + icon + '</span>' +
      '<span>' + label + '</span>' +
      badgeHtml +
      '</a>';
  }

  // SVG Icons
  const icons = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    products: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    customers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    campaigns: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    conversations: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    bi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  };

  const user = getUser();
  const userName = user ? (user.name || user.email || 'User') : 'User';
  const userRole = user ? (user.role || 'Admin') : 'Admin';
  const userInitial = userName.charAt(0).toUpperCase();

  return '' +
    '<div class="sidebar-logo">' +
      '<div class="logo-icon">' + icons.logo + '</div>' +
      '<div>' +
        '<div class="logo-text">GeniSearch</div>' +
        '<div class="logo-sub">WhatsApp SaaS</div>' +
      '</div>' +
    '</div>' +

    '<nav class="sidebar-nav">' +
      '<div class="sidebar-section">Main</div>' +
      navItem('index.html', 'Dashboard', icons.dashboard) +
      navItem('inventory.html', 'Products', icons.products) +
      navItem('engagement.html', 'Customers', icons.customers) +
      navItem('campaigns.html', 'Campaigns', icons.campaigns) +
      navItem('conversations.html', 'Conversations', icons.conversations) +

      '<div class="sidebar-section">Analytics</div>' +
      navItem('bi.html', 'BI Dashboard', icons.bi) +
      navItem('reports.html', 'Reports', icons.reports) +

      '<div class="sidebar-section">System</div>' +
      navItem('settings.html', 'Settings', icons.settings) +
    '</nav>' +

    '<div class="sidebar-footer">' +
      '<div class="sidebar-user">' +
        '<div class="avatar">' + userInitial + '</div>' +
        '<div class="user-info">' +
          '<div class="user-name">' + escapeHtml(userName) + '</div>' +
          '<div class="user-role">' + escapeHtml(userRole) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

/* ============================================================
   TOPBAR HTML GENERATOR
   ============================================================ */

function topbarHTML(title, breadcrumbs) {
  let breadcrumbHtml = '';
  if (breadcrumbs && breadcrumbs.length > 0) {
    const parts = breadcrumbs.map(function (bc, i) {
      if (i < breadcrumbs.length - 1) {
        return '<a href="' + (bc.href || '#') + '">' + escapeHtml(bc.label) + '</a><span class="sep">/</span>';
      }
      return '<span>' + escapeHtml(bc.label) + '</span>';
    });
    breadcrumbHtml = '<div class="topbar-breadcrumb">' + parts.join('') + '</div>';
  }

  const user = getUser();
  const initial = user ? (user.name || user.email || 'U').charAt(0).toUpperCase() : 'U';

  return '' +
    '<button class="sidebar-toggle" aria-label="Toggle sidebar">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>' +
    '</button>' +
    '<div class="topbar-left">' +
      '<div class="topbar-title">' + escapeHtml(title || '') + '</div>' +
      breadcrumbHtml +
    '</div>' +
    '<div class="topbar-actions">' +
      '<div class="topbar-search">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input type="text" placeholder="Search...">' +
      '</div>' +
      '<button class="topbar-btn" title="Notifications">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
      '</button>' +
      '<div class="topbar-avatar" title="Profile">' + initial + '</div>' +
    '</div>';
}

/* ============================================================
   BADGE HELPERS
   ============================================================ */

function statusBadge(status) {
  if (!status) return '<span class="badge badge-neutral">Unknown</span>';
  const s = status.toLowerCase();

  const map = {
    active:     'badge-success badge-dot',
    running:    'badge-success badge-dot',
    sent:       'badge-success',
    completed:  'badge-primary',
    delivered:  'badge-info',
    draft:      'badge-neutral',
    paused:     'badge-warning',
    pending:    'badge-warning',
    scheduled:  'badge-info badge-dot',
    failed:     'badge-danger',
    cancelled:  'badge-danger',
    canceled:   'badge-danger',
    archived:   'badge-neutral',
    read:       'badge-accent',
    replied:    'badge-success',
  };

  const cls = map[s] || 'badge-neutral';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return '<span class="badge ' + cls + '">' + escapeHtml(label) + '</span>';
}

function sentimentBadge(sentiment) {
  if (!sentiment) return '<span class="badge badge-neutral">N/A</span>';
  const s = sentiment.toLowerCase();

  const map = {
    positive: 'badge-success',
    neutral:  'badge-warning',
    negative: 'badge-danger',
    mixed:    'badge-info',
  };

  const cls = map[s] || 'badge-neutral';
  const label = sentiment.charAt(0).toUpperCase() + sentiment.slice(1);
  return '<span class="badge ' + cls + '">' + escapeHtml(label) + '</span>';
}

function roleBadge(role) {
  if (!role) return '<span class="badge badge-neutral">Unknown</span>';
  const r = role.toLowerCase();

  const map = {
    'super admin': 'badge-danger',
    superadmin:    'badge-danger',
    admin:         'badge-primary',
    manager:       'badge-info',
    analyst:       'badge-neutral',
    viewer:        'badge-neutral',
  };

  const cls = map[r] || 'badge-neutral';
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  return '<span class="badge ' + cls + '">' + escapeHtml(label) + '</span>';
}

/* ============================================================
   TAB SWITCHING
   ============================================================ */

function initTabs(containerSelector) {
  document.querySelectorAll(containerSelector || '.tabs').forEach(function (tabBar) {
    tabBar.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.dataset.tab;
        // Deactivate siblings
        tabBar.querySelectorAll('.tab').forEach(function (t) {
          t.classList.remove('active');
        });
        tab.classList.add('active');
        // Hide/show panels
        var tabGroup = tab.closest('[data-tab-group]');
        var panelGroup = tabGroup ? tabGroup.parentElement : document;
        panelGroup.querySelectorAll('[data-panel]').forEach(function (p) {
          p.style.display = p.dataset.panel === target ? '' : 'none';
        });
      });
    });
  });
}

/* ============================================================
   CHART.JS DEFAULTS
   ============================================================ */

function initChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#6B7280';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.plugins.tooltip.backgroundColor = '#1E1E2E';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
}

/* ── Palette helpers ── */
var GS = {
  primary:   '#6C5CE7',
  accent:    '#00CEC9',
  success:   '#00B894',
  danger:    '#E17055',
  warning:   '#FDCB6E',
  info:      '#74B9FF',

  palette: ['#6C5CE7', '#00CEC9', '#00B894', '#E17055', '#FDCB6E', '#74B9FF', '#A29BFE', '#55EFC4'],

  gradientLine: function (ctx, colorA, colorB) {
    if (!ctx) return colorA;
    var g = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
    g.addColorStop(0, colorA);
    g.addColorStop(1, colorB || colorA);
    return g;
  },

  gradientFill: function (ctx, color) {
    if (!ctx) return color;
    var g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    g.addColorStop(0, color + '33');
    g.addColorStop(1, color + '00');
    return g;
  },
};

/* ============================================================
   DATE HELPERS
   ============================================================ */

function daysAgo(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function timeAgo(dateStr) {
  if (!dateStr) return '-';
  var now = Date.now();
  var then = new Date(dateStr).getTime();
  var diff = Math.floor((now - then) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return fmtDate(dateStr);
}

/* ============================================================
   INIT ON DOM READY
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
  initTabs();
  initChartDefaults();
});

/* ============================================================
   EXPOSE GLOBALS
   ============================================================ */

window.API_BASE      = API_BASE;
window.getToken      = getToken;
window.getUser       = getUser;
window.setAuth       = setAuth;
window.logout        = logout;
window.requireLogin  = requireLogin;
window.api           = api;
window.apiGet        = apiGet;
window.apiPost       = apiPost;
window.apiPatch      = apiPatch;
window.apiDelete     = apiDelete;
window.toast         = toast;
window.openModal     = openModal;
window.closeModal    = closeModal;
window.showLoading   = showLoading;
window.hideLoading   = hideLoading;
window.fmtNum        = fmtNum;
window.fmtPct        = fmtPct;
window.fmtDate       = fmtDate;
window.fmtDateTime   = fmtDateTime;
window.fmtCurrency   = fmtCurrency;
window.escapeHtml    = escapeHtml;
window.initNav       = initNav;
window.initSidebar   = initSidebar;
window.initPage      = initPage;
window.sidebarHTML   = sidebarHTML;
window.topbarHTML    = topbarHTML;
window.statusBadge   = statusBadge;
window.sentimentBadge = sentimentBadge;
window.roleBadge     = roleBadge;
window.initTabs      = initTabs;
window.GS            = GS;
window.daysAgo       = daysAgo;
window.timeAgo       = timeAgo;
