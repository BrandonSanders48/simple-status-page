// Execution trace — readable by the ?debug=1 overlay
window._spLog = [];
function _log(msg) {
    var t = new Date().toISOString().substr(11,12);
    window._spLog.push('[' + t + '] ' + msg);
}
_log('script-start');

// Read page-localized strings / flags from data attributes
const csrfToken    = document.body.getAttribute('data-csrf') || '';
const isAdmin      = (document.body.getAttribute('data-admin') || 'false') === 'true';

const allSystemsOperational = document.body.dataset.allSystemsOperational || 'All Systems Operational';
const issuesDetected        = document.body.dataset.issuesDetected        || 'Issues Detected';
const lightMode             = document.body.dataset.lightMode             || 'Light Mode';
const darkMode              = document.body.dataset.darkMode              || 'Dark Mode';
const loadingText           = document.body.dataset.loading               || 'Loading...';
const serviceText           = document.body.dataset.service               || 'Service';
const alertSoundEnabled     = document.body.dataset.alertSound === 'true';

let lastServiceStates = {};
let _statusLoading = false, _incidentsLoading = false, _rssLoading = false;
var _lastUpdated = 0;

function _updateLastUpdated() {
    if (!_lastUpdated) return;
    var el = document.getElementById('last-updated-text');
    if (!el) return;
    var secs = Math.floor((Date.now() - _lastUpdated) / 1000);
    el.textContent = secs < 10 ? 'just now'
                   : secs < 60 ? secs + 's ago'
                   : Math.floor(secs / 60) + 'm ago';
}

const alertAudio = new Audio('audio/alert.wav');
function playAlertSound() {
    if (alertSoundEnabled) { alertAudio.currentTime = 0; alertAudio.play(); }
}

// --- Modal helpers (replaces Bootstrap modal JS) ---
function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Reset manage-sub buttons on open
    if (id === 'manageSubModal') {
        const s = document.getElementById('manageSubSubmitBtn');
        const b = document.getElementById('manageSubBackBtn');
        if (s) s.style.display = '';
        if (b) b.style.display = '';
    }
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
    if (!document.querySelector('.sp-modal:not(.hidden)')) {
        document.body.style.overflow = '';
    }
}

// --- Utility ---
function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function cacheBust(url) {
    return url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
}

// --- Vanilla helpers so display works without jQuery ---
function _get(url, onSuccess, onFail, onAlways) {
    if (window.jQuery) {
        $.getJSON(url, onSuccess)
            .fail(onFail   || function() {})
            .always(onAlways || function() {});
        return;
    }
    fetch(url)
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function(d) { onSuccess(d); if (onAlways) onAlways(); })
        .catch(function(e) { if (onFail) onFail(e); if (onAlways) onAlways(); });
}
function _html(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
}
function _show(id) { var el = document.getElementById(id); if (el) el.style.display = ''; }
function _hide(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }
function _addClass(id, cls)    { var el = document.getElementById(id); if (el) el.classList.add(cls); }
function _removeClass(id, cls) { var el = document.getElementById(id); if (el) el.classList.remove(cls); }

// --- Incidents ---
function loadIncidents() {
    if (_incidentsLoading) return;
    _incidentsLoading = true;
    _log('loadIncidents: fired');
    _get(cacheBust('include/incidents.json'), function(data) {
        _log('loadIncidents: success, items=' + (data ? data.length : 'null'));
        if (!data || !data.length) {
            _addClass('incidents_container', 'hidden');
            _html('incidents_area', '');
            return;
        }
        _removeClass('incidents_container', 'hidden');
        var html = '';
        data.forEach(function(incident, idx) {
            html += `
            <div class="rounded-xl p-4 mb-3 shadow-sm" style="background:rgba(251,191,36,0.12);border:1px solid rgba(245,158,11,0.35)">
                <div class="flex justify-between items-start gap-2 mb-1">
                    <div class="flex items-center gap-2">
                        <i class="fa-solid fa-circle-exclamation" style="color:#f59e0b"></i>
                        <span class="font-semibold text-sm text-slate-900 dark:text-slate-100">${escapeHtml(incident.title)}</span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="text-xs text-slate-400">${escapeHtml(incident.time || '')}</span>
                        ${isAdmin ? `<button class="remove-incident-btn p-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs" data-idx="${idx}" title="Remove"><i class="fa fa-trash"></i></button>` : ''}
                    </div>
                </div>
                <p class="text-sm text-slate-600 dark:text-slate-300 ml-6">${escapeHtml(incident.description || '')}</p>
            </div>`;
        });
        _html('incidents_area', html);
    }, function(e) {
        _log('loadIncidents: FAIL — ' + (e && e.message || e));
        _addClass('incidents_container', 'hidden');
    }, function() { _incidentsLoading = false; });
}

// --- Network Status & Services ---
function loadStatus() {
    if (_statusLoading) return;
    _statusLoading = true;
    _log('loadStatus: fired');
    _get(cacheBust('include/status_ajax.php'), function(data) {
        _log('loadStatus: success, local_ok=' + data.local_ok + ' wide_ok=' + data.wide_ok + ' errors=' + data.errors);
        var local_color = data.local_color || '#94a3b8';
        var local_text  = data.local_text  || 'Unknown';
        var wide_color  = data.wide_color  || '#94a3b8';
        var wide_text   = data.wide_text   || 'Unknown';
        var localArea   = document.body.dataset.localArea || 'Local-Area Network';
        var wideArea    = document.body.dataset.wideArea  || 'Wide-Area Network';

        _html('network_status_placeholder', `
            <div class="flex flex-wrap justify-between items-center gap-4">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-slate-500 dark:text-slate-400">${localArea}:</span>
                    <span class="text-sm font-bold" style="color:${local_color}">${escapeHtml(local_text)}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-slate-500 dark:text-slate-400">${wideArea}:</span>
                    <span class="text-sm font-bold" style="color:${wide_color}">${escapeHtml(wide_text)}</span>
                </div>
            </div>`);

        var html = '';
        (data.services || []).forEach(function(service) {
            var title   = service.title || '';
            var type    = service.type  || '';
            var desc    = service.desc  || '';
            var isUp    = /check/.test(service.status_icon);
            var tipParts = [];
            if (service.host) tipParts.push(service.host);
            if (service.port) tipParts.push(service.port === 'ping' ? 'ICMP ping' : 'port ' + service.port);
            var tip = tipParts.join('  ·  ');
            html += `
            <div class="service-card" style="border-left:3px solid ${isUp ? '#10b981' : '#ef4444'}"${tip ? ` data-tooltip="${escapeHtml(tip)}"` : ''}>
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-2xl leading-none">${service.status_icon}</span>
                    <h5 class="font-semibold text-sm text-slate-800 dark:text-slate-100 leading-tight">${escapeHtml(title)}</h5>
                </div>
                <div class="mb-2">
                    <span class="service-badge">${escapeHtml(type)} ${serviceText}</span>
                </div>
                ${desc ? `<p class="text-xs text-slate-400 dark:text-slate-500 leading-snug mt-auto">${escapeHtml(desc)}</p>` : ''}
            </div>`;
        });
        _html('services_placeholder', html);

        var ok = data.local_ok && data.wide_ok && (data.errors || 0) === 0;
        var banner = document.getElementById('all_status');
        if (banner) banner.dataset.status = ok ? 'ok' : 'error';
        _html('webTicker', `<b>${ok ? allSystemsOperational : issuesDetected}</b>`);
        var si = document.getElementById('statusIcon');
        if (si) {
            si.innerHTML = ok
                ? '<i class="fa-solid fa-circle-check"></i>'
                : '<i class="fa-solid fa-circle-xmark"></i>';
            si.style.display = '';
        }

        // Live indicator
        var li = document.getElementById('live-indicator');
        if (li) li.style.display = 'flex';

        // Last updated
        _lastUpdated = Date.now();
        _updateLastUpdated();
        var luw = document.getElementById('last-updated-wrap');
        if (luw) luw.style.display = 'flex';

        if (data.services) {
            data.services.forEach(function(service) {
                var key  = service.title;
                var isUp = /check/.test(service.status_icon);
                if (lastServiceStates.hasOwnProperty(key) && lastServiceStates[key] !== isUp) {
                    playAlertSound();
                    showServiceNotification(key, isUp);
                }
                lastServiceStates[key] = isUp;
            });
        }
    }, function(e) {
        _log('loadStatus: FAIL — ' + (e && e.message || e));
        _html('network_status_placeholder', '<p class="text-sm text-red-500">Unable to load network status.</p>');
        var banner = document.getElementById('all_status');
        if (banner) banner.dataset.status = 'error';
        _hide('statusIcon');
    }, function() { _statusLoading = false; });
}

// --- RSS Notices ---
function loadRSS() {
    if (_rssLoading) return;
    _rssLoading = true;
    var medium = ["unavailable","inaccessible","difficulty","difficulties","slow","slowness","trouble","degraded","delay","delays","partial","unstable","intermittent"];
    var high   = ["error","errors","problem","problems","issue","issues","outage","outages","critical","fault","down","failure","failures","disruption","disruptions","major"];
    _log('loadRSS: fired');
    var isDark = document.documentElement.classList.contains('dark');
    _get(cacheBust('include/rss_ajax.php'), function(data) {
        _log('loadRSS: success, feeds=' + (data ? data.length : 'null'));
        var html = '';
        (data || []).forEach(function(feed, idx) {
            var item       = (feed.item || '').toString();
            var item_short = item.length > 75 ? item.substring(0, 72) + '...' : item;
            var lower      = item_short.toLowerCase();
            var bg, color;
            if (isDark) {
                bg = '#0c1a2e'; color = '#7c8fa8';
                if (medium.some(function(w) { return lower.includes(w); })) { bg = '#1c1400'; color = '#d97706'; }
                if (high.some(function(w)   { return lower.includes(w); })) { bg = '#1e0a0a'; color = '#f87171'; }
            } else {
                bg = '#f1f5f9'; color = '#475569';
                if (medium.some(function(w) { return lower.includes(w); })) { bg = '#fffbeb'; color = '#78350f'; }
                if (high.some(function(w)   { return lower.includes(w); })) { bg = '#fff1f2'; color = '#881337'; }
            }
            html += `
            <div class="rss-feed-box p-3 text-center h-28 flex flex-col justify-center" data-feed-idx="${idx}"
                 style="background:${bg};color:${color}">
                <h5 class="font-semibold text-sm mb-1 leading-tight">${escapeHtml(feed.name || '')}</h5>
                <p class="text-sm leading-snug" title="${escapeHtml(feed.item || '')}">${escapeHtml(item_short)}</p>
                ${feed.desc ? `<p class="text-xs opacity-60 mt-1">${escapeHtml(feed.desc)}</p>` : ''}
            </div>`;
        });
        _html('rss_area', html);
        window._allRssFeeds = data || [];
    }, function(e) {
        _log('loadRSS: FAIL — ' + (e && e.message || e));
        _html('rss_area', '<p class="text-sm text-red-500 col-span-3">Unable to load notices.</p>');
    }, function() { _rssLoading = false; });
}

// --- RSS Modal ---
function showRssFeedModal(idx) {
    const feed = (window._allRssFeeds || [])[idx];
    if (!feed) return;
    const lang        = document.documentElement.lang || 'en';
    const rssLatest   = lang === 'es' ? 'Último elemento:'  : 'Latest Item:';
    const rssDesc     = lang === 'es' ? 'Descripción:'      : 'Description:';
    const rssSource   = lang === 'es' ? 'Ver fuente'        : 'View Source';
    const rssAll      = lang === 'es' ? 'Todos los elementos:' : 'All Items:';

    $('#rssFeedModalTitle').text(feed.name || '');
    let html = `<div class="mb-3"><p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">${rssLatest}</p><p class="text-sm text-gray-800 dark:text-gray-200">${escapeHtml(feed.item || '')}</p></div>`;
    if (feed.desc) html += `<div class="mb-3"><p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">${rssDesc}</p><p class="text-sm text-gray-700 dark:text-gray-300">${escapeHtml(feed.desc)}</p></div>`;
    if (feed.link) html += `<div class="mb-3"><a href="${escapeHtml(feed.link)}" target="_blank" rel="noopener" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">${rssSource} &rarr;</a></div>`;
    if (Array.isArray(feed.items) && feed.items.length) {
        html += `<hr class="my-3 border-gray-200 dark:border-gray-700"><p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">${rssAll}</p><ul class="space-y-1">`;
        feed.items.forEach(itm => { html += `<li class="text-sm text-gray-700 dark:text-gray-300">${escapeHtml(itm)}</li>`; });
        html += '</ul>';
    }
    $('#rssFeedModalBody').html(html);
    openModal('rssFeedModal');
}

// --- Remove Incident ---
let removeIncidentIdx = null;
$(document).on('click', '.remove-incident-btn', function() {
    removeIncidentIdx = $(this).data('idx');
    openModal('removeIncidentModal');
});

$(document).on('click', '#confirmRemoveIncident', function() {
    if (removeIncidentIdx === null) return;
    $.ajax({
        url: '', type: 'POST',
        data: { remove_incident: removeIncidentIdx, csrf_token: csrfToken },
        success: function() {
            closeModal('removeIncidentModal');
            loadIncidents();
            removeIncidentIdx = null;
        },
        error: function(xhr) {
            alert(xhr.responseText || 'Failed to remove incident.');
        }
    });
});

// --- Dark Mode Toggle ---
document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('darkModeToggle');
    if (!btn) return;

    function applyDark(isDark) {
        document.documentElement.classList.toggle('dark', isDark);
        document.cookie = 'dark_mode=' + (isDark ? 'on' : 'off') + ';path=/;max-age=31536000';
        const icon = btn.querySelector('i');
        const lbl  = btn.querySelector('.dm-label');
        if (icon) { icon.classList.toggle('fa-sun', isDark); icon.classList.toggle('fa-moon', !isDark); }
        if (lbl)  lbl.textContent = isDark ? lightMode : darkMode;
        btn.title = isDark ? lightMode : darkMode;
    }

    btn.addEventListener('click', function() {
        applyDark(!document.documentElement.classList.contains('dark'));
    });
    // Sync icon with current state on load
    if (document.documentElement.classList.contains('dark')) {
        const icon = btn.querySelector('i');
        const lbl  = btn.querySelector('.dm-label');
        if (icon) { icon.classList.add('fa-sun'); icon.classList.remove('fa-moon'); }
        if (lbl)  lbl.textContent = lightMode;
        btn.title = lightMode;
    }

    // Mobile menu toggle
    const menuBtn  = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', function() {
            mobileMenu.classList.toggle('hidden');
        });
    }
});

// --- Create Incident ---
$('#createIncidentForm').on('submit', function(e) {
    e.preventDefault();
    $.post('include/create_incident.php', $(this).serialize() + '&csrf_token=' + encodeURIComponent(csrfToken), function() {
        $('#createIncidentMsg').html('<p class="text-sm text-emerald-600 font-medium">Incident created!</p>');
        $('#createIncidentForm')[0].reset();
        setTimeout(function() {
            closeModal('createIncidentModal');
            $('#createIncidentMsg').html('');
            loadIncidents();
        }, 900);
    }).fail(function(xhr) {
        $('#createIncidentMsg').html('<p class="text-sm text-red-500">' + escapeHtml(xhr.responseText || 'Failed to create incident.') + '</p>');
    });
});

// --- Subscribe ---
$('#subscribeForm').on('submit', function(e) {
    e.preventDefault();
    var formData = $(this).serializeArray().filter(f => f.name !== 'service[]');
    ($('#subscribeService').val() || []).forEach(s => formData.push({name: 'service[]', value: s}));
    formData.push({name: 'csrf_token', value: csrfToken});
    $.post('include/subscriptions.php', $.param(formData), function(response) {
        $('#subscribeMsg').html('<p class="text-sm text-emerald-600 font-medium">' + escapeHtml(response.message || 'Subscribed!') + '</p>');
        $('#subscribeForm')[0].reset();
    }, 'json').fail(function(xhr) {
        const msg = (xhr.responseJSON && xhr.responseJSON.message) ? xhr.responseJSON.message : 'Failed to subscribe.';
        $('#subscribeMsg').html('<p class="text-sm text-red-500">' + escapeHtml(msg) + '</p>');
    });
});

// --- Manage Subscription ---
$('#manageSubForm').on('submit', function(e) {
    e.preventDefault();
    const action = $('#manageAction').val();
    const url    = action === 'view' ? 'include/manage_subscribe.php' : 'include/unsubscribe.php';
    $('#manageSubMsg').html(''); $('#manageSubResults').html('');

    $.post(url, $(this).serialize() + '&csrf_token=' + encodeURIComponent(csrfToken), function(response) {
        const submitBtn = document.getElementById('manageSubSubmitBtn');
        const backBtn   = document.getElementById('manageSubBackBtn');
        if (action === 'view') {
            if (submitBtn) submitBtn.style.display = 'none';
            if (backBtn)   backBtn.style.display   = 'none';
        } else {
            if (submitBtn) submitBtn.style.display = '';
            if (backBtn)   backBtn.style.display   = '';
        }

        if (response.status === 'success' && response.subscriptions) {
            let html = '<ul class="space-y-2 mt-2">';
            response.subscriptions.forEach(sub => {
                html += `<li class="flex items-center justify-between bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2">
                    <span class="text-sm text-slate-800 dark:text-slate-200">${escapeHtml(sub)}</span>
                    <button class="unsubscribe-service-btn text-xs bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-600 dark:text-red-400 px-2 py-1 rounded-md" data-service="${encodeURIComponent(sub)}">Unsubscribe</button>
                </li>`;
            });
            html += '</ul>';
            $('#manageSubResults').html(html);
        }

        const cls = response.status === 'success'
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-red-500';
        $('#manageSubMsg').html(`<p class="text-sm mt-2 ${cls}">${escapeHtml(response.message || '')}</p>`);
        if (response.status === 'success' && response.action === 'unsubscribe') $('#manageSubResults').html('');
    }, 'json').fail(function(xhr) {
        const msg = (xhr.responseJSON && xhr.responseJSON.message) ? xhr.responseJSON.message : 'Failed to process request.';
        $('#manageSubMsg').html('<p class="text-sm text-red-500">' + escapeHtml(msg) + '</p>');
    });
});

$('#manageAction').on('change', function() {
    const isView  = $(this).val() === 'view';
    const submit  = document.getElementById('manageSubSubmitBtn');
    const back    = document.getElementById('manageSubBackBtn');
    if (submit) submit.style.display = isView ? 'none' : '';
    if (back)   back.style.display   = isView ? 'none' : '';
});

// --- Language selector ---
$('#langSelect').on('change', function() {
    document.cookie = 'lang=' + this.value + ';path=/;max-age=31536000';
    const params = new URLSearchParams(window.location.search);
    params.set('lang', this.value);
    window.location.search = '?' + params.toString();
});

// --- Auto-Refresh ---
var refreshInterval = 30000; // updated by loadRefreshInterval()
var incidentsTimer = null, statusTimer = null, rssTimer = null;
var MIN_REFRESH_INTERVAL = 3000;

function saveRefreshInterval(val) {
    try { localStorage.setItem('refreshInterval', val); } catch(e) {}
}
function loadRefreshInterval() {
    var el = document.getElementById('refreshInterval');
    if (el) refreshInterval = parseInt(el.value, 10) || 30000;
    try {
        var saved = localStorage.getItem('refreshInterval');
        if (saved && !isNaN(saved)) {
            refreshInterval = parseInt(saved, 10);
            if (el) el.value = saved;
        }
    } catch(e) { _log('loadRefreshInterval: localStorage blocked (' + e.message + ')'); }
}
function startAutoRefresh() {
    clearInterval(incidentsTimer); clearInterval(statusTimer); clearInterval(rssTimer);
    var toggle = document.getElementById('refreshToggle');
    if (!toggle || toggle.checked) {
        incidentsTimer = setInterval(loadIncidents, refreshInterval);
        statusTimer    = setInterval(loadStatus,    refreshInterval);
        rssTimer       = setInterval(loadRSS,       refreshInterval);
    }
}

// Refresh controls only need jQuery when the navbar is interactive (non-kiosk)
if (window.jQuery) {
    $('#refreshInterval').on('change keyup', function(e) {
        var val = parseInt($(this).val(), 10) || 30000;
        if (val < MIN_REFRESH_INTERVAL) { val = MIN_REFRESH_INTERVAL; $(this).val(val); }
        if (e.type === 'change' || e.key === 'Enter') {
            refreshInterval = val;
            saveRefreshInterval(val);
            startAutoRefresh();
        }
    });
    $('#refreshToggle').on('change', startAutoRefresh);
}

// --- Unsubscribe single service ---
$(document).on('click', '.unsubscribe-service-btn', function() {
    const service = decodeURIComponent($(this).data('service'));
    const email   = $('#manageEmail').val();
    if (!email || !service) return;
    const $li = $(this).closest('li');
    $.post('include/unsubscribe.php', { email, action: 'unsubscribe_single', service, csrf_token: csrfToken }, function(response) {
        if (response.status === 'success') {
            $li.remove();
            $('#manageSubMsg').html('<p class="text-sm text-emerald-600">' + escapeHtml(response.message) + '</p>');
        } else {
            $('#manageSubMsg').html('<p class="text-sm text-red-500">' + escapeHtml(response.message) + '</p>');
        }
    }, 'json').fail(function(xhr) {
        const msg = (xhr.responseJSON && xhr.responseJSON.message) ? xhr.responseJSON.message : 'Failed to unsubscribe.';
        $('#manageSubMsg').html('<p class="text-sm text-red-500">' + escapeHtml(msg) + '</p>');
    });
});

// --- Browser notifications ---
const browserNotifyEnabled = document.body.dataset.browserNotify === 'true';
if (browserNotifyEnabled && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
}
function showServiceNotification(serviceName, isUp) {
    if (!browserNotifyEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
    new Notification(isUp ? `${serviceName} is UP` : `${serviceName} is DOWN`, {
        body: isUp ? `${serviceName} has recovered.` : `${serviceName} is currently down.`,
        icon: isUp ? 'images/up.png' : 'images/down.png'
    });
}

// --- Help FAB drag ---
(function() {
    const fab = document.getElementById('help-fab');
    if (!fab) return;
    let isDragging = false, offsetX = 0, offsetY = 0, startX = 0, startY = 0, moved = false;

    function lsGet(k)    { try { return localStorage.getItem(k); }    catch(e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); }        catch(e) {} }

    function restoreFabPosition() {
        const pos = lsGet('helpFabPos');
        if (pos) {
            const { left, top } = JSON.parse(pos);
            fab.style.left = left; fab.style.top = top;
            fab.style.right = 'auto'; fab.style.bottom = 'auto';
        }
    }
    restoreFabPosition();

    fab.addEventListener('mousedown', function(e) {
        isDragging = true; moved = false;
        startX = e.clientX; startY = e.clientY;
        offsetX = e.clientX - fab.getBoundingClientRect().left;
        offsetY = e.clientY - fab.getBoundingClientRect().top;
        fab.style.transition = 'none';
        document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        moved = true;
        let x = Math.max(0, Math.min(window.innerWidth  - fab.offsetWidth,  e.clientX - offsetX));
        let y = Math.max(0, Math.min(window.innerHeight - fab.offsetHeight, e.clientY - offsetY));
        fab.style.left = x + 'px'; fab.style.top = y + 'px';
        fab.style.right = 'auto'; fab.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', function(e) {
        if (!isDragging) return;
        isDragging = false; fab.style.transition = ''; document.body.style.userSelect = '';
        if (fab.style.left && fab.style.top) {
            lsSet('helpFabPos', JSON.stringify({ left: fab.style.left, top: fab.style.top }));
        }
        if (!moved && Math.abs(e.clientX - startX) < 5 && Math.abs(e.clientY - startY) < 5) {
            window.open('help.php', '_blank');
        }
    });
    fab.addEventListener('touchstart', function(e) {
        isDragging = true; moved = false;
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY;
        offsetX = t.clientX - fab.getBoundingClientRect().left;
        offsetY = t.clientY - fab.getBoundingClientRect().top;
        fab.style.transition = 'none';
    });
    document.addEventListener('touchmove', function(e) {
        if (!isDragging) return; moved = true;
        const t = e.touches[0];
        let x = Math.max(0, Math.min(window.innerWidth  - fab.offsetWidth,  t.clientX - offsetX));
        let y = Math.max(0, Math.min(window.innerHeight - fab.offsetHeight, t.clientY - offsetY));
        fab.style.left = x + 'px'; fab.style.top = y + 'px';
        fab.style.right = 'auto'; fab.style.bottom = 'auto';
    });
    document.addEventListener('touchend', function(e) {
        if (!isDragging) return;
        isDragging = false; fab.style.transition = '';
        if (fab.style.left && fab.style.top) {
            lsSet('helpFabPos', JSON.stringify({ left: fab.style.left, top: fab.style.top }));
        }
        if (!moved) window.open('help.php', '_blank');
    });
    window.addEventListener('resize', function() {
        const pos = lsGet('helpFabPos');
        if (!pos) return;
        let { left, top } = JSON.parse(pos);
        let x = parseInt(left), y = parseInt(top), changed = false;
        if (x > window.innerWidth  - fab.offsetWidth)  { x = window.innerWidth  - fab.offsetWidth;  changed = true; }
        if (y > window.innerHeight - fab.offsetHeight) { y = window.innerHeight - fab.offsetHeight; changed = true; }
        if (changed) {
            fab.style.left = x + 'px'; fab.style.top = y + 'px';
            fab.style.right = 'auto'; fab.style.bottom = 'auto';
            lsSet('helpFabPos', JSON.stringify({ left: fab.style.left, top: fab.style.top }));
        }
    });
})();

// --- Boot ---
function _try(label, fn) {
    try { fn(); } catch(e) { _log('ERROR in ' + label + ': ' + e.message); }
}

function _boot() {
    _log('_boot: called (jQuery=' + !!window.jQuery + ' readyState=' + document.readyState + ')');
    _try('loadRefreshInterval', loadRefreshInterval);
    _try('loadIncidents',       loadIncidents);
    _try('loadStatus',          loadStatus);
    _try('loadRSS',             loadRSS);
    _try('startAutoRefresh',    startAutoRefresh);
    setInterval(_updateLastUpdated, 10000);
    if (window.showLoginModal) openModal('loginModal');

    var rssArea = document.getElementById('rss_area');
    if (rssArea) {
        rssArea.addEventListener('click', function(e) {
            var box = e.target.closest('[data-feed-idx]');
            if (box) showRssFeedModal(parseInt(box.dataset.feedIdx, 10));
        });
    }
    _log('_boot: complete');
}

if (window.jQuery) {
    $(document).ready(_boot);
} else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
} else {
    _boot();
}
