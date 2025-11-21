// status-page.js (fixed)

// Read page-localized strings / flags from data attributes
const csrfToken = document.body.getAttribute('data-csrf') || '';
const isAdmin = (document.body.getAttribute('data-admin') || 'false') === 'true';

const allSystemsOperational = document.body.dataset.allSystemsOperational || 'All Systems Operational';
const issuesDetected = document.body.dataset.issuesDetected || 'Issues Detected';
const lightMode = document.body.dataset.lightMode || 'Light Mode';
const darkMode = document.body.dataset.darkMode || 'Dark Mode';
const localArea = document.body.dataset.localArea || 'Local-Area Network';
const wideArea = document.body.dataset.wideArea || 'Wide-Area Network';


// --- Utility: simple HTML escape
function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- Cache Busting ---
function cacheBust(url) {
    const sep = url.includes('?') ? '&' : '?';
    return url + sep + 'cb=' + Date.now();
}

// --- Dynamic: Incidents ---
function loadIncidents() {
    $.getJSON(cacheBust('include/incidents.json'), function(data) {
        if (!data || !data.length) {
            $('#incidents_area').html(`<div class="alert alert-success">${allSystemsOperational}</div>`);
            return;
        }

        let html = '';
        data.forEach(function(incident, idx) {
            html += `
            <div class="alert alert-warning shadow-sm mb-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <div class="d-flex align-items-center">
                        <i class="fa-solid fa-circle-exclamation text-warning me-2"></i>
                        <b>${escapeHtml(incident.title)}</b>
                    </div>
                    <div class="d-flex align-items-center">
                        <div class="text-end text-muted me-2" style="font-size:12px; min-width: 120px;">
                            <small>${escapeHtml(incident.time || '')}</small>
                        </div>
                        ${isAdmin ? `
                            <button class="btn btn-sm btn-danger remove-incident-btn" data-idx="${idx}" title="Remove Incident">
                                <i class="fa fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div>${escapeHtml(incident.description || '')}</div>
            </div>`;
        });
        $('#incidents_area').html(html);
    }).fail(function() {
        $('#incidents_area').html('<div class="text-center text-danger">Failed to load incidents.</div>');
    });
}

// --- Dynamic: Network Status and Services ---
function loadStatus() {
    $.getJSON(cacheBust('include/status_ajax.php'), function(data) {
        // Protect against missing fields
        const local_color = data.local_color || 'gray';
        const local_text = data.local_text || 'Unknown';
        const wide_color = data.wide_color || 'gray';
        const wide_text = data.wide_text || 'Unknown';

        $('#network_status_placeholder').html(
            `<div class="d-flex justify-content-between align-items-center flex-wrap" style="gap: 16px;">
                <h6 class="mb-0" style="font-weight:500; color:#444;">
                    ${localArea}
                    <span style="color:${local_color}; margin-left:8px;" id="local_area_status">${escapeHtml(local_text)}</span>
                </h6>
                <h6 class="mb-0" style="font-weight:500; color:#444;">
                    ${wideArea}
                    <span style="color:${wide_color}; margin-left:8px;" id="wide_area_status">${escapeHtml(wide_text)}</span>
                </h6>
            </div>`
        );

        let html = '';
        (data.services || []).forEach(function(service) {
            const title = service.title || '';
            const type = service.type || '';
            const desc = service.desc || '';
            html += `
            <div class="col-md-4 col-lg-3 col-sm-6 col-12">
                <div class="card shadow-sm h-100" style="border-radius: 14px;">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-2">
                            <span style="font-size:1.5em;">${service.status_icon}</span>
                            <h5 class="card-title ms-2 mb-0">${escapeHtml(title)}</h5>
                        </div>
                        <div class="mb-1">
                            <span class="badge bg-secondary">${escapeHtml(type)} Service</span>
                        </div>
                        ${desc ? `<div class="text-muted" style="font-size:13px;">${escapeHtml(desc)}</div>` : ''}
                    </div>
                </div>
            </div>`;
        });
        $('#services_placeholder').html(html);

        if ((data.errors || 0) === 0) {
            $('#all_status').removeClass('alert-danger').addClass('alert-success');
            $('#webTicker').html(`<b>${allSystemsOperational}</b>`);
            $('#statusIcon')
                .html('<i class="fa-solid fa-circle-check text-success"></i>')
                .show();
        } else {
            $('#all_status').removeClass('alert-success').addClass('alert-danger');
            $('#webTicker').html(`<b>${issuesDetected}</b>`);
            $('#statusIcon')
                .html('<i class="fa-solid fa-circle-xmark text-danger"></i>')
                .show();
        }
    }).fail(function() {
        $('#network_status_placeholder').html('<div class="text-center text-danger">Unable to load network status. Please check your connection or try again later.</div>');
        $('#statusIcon').hide();
    });
}

// --- Dynamic: RSS Notices ---
function loadRSS() {
    $.getJSON(cacheBust('include/rss_ajax.php'), function(data) {
        let html = '';
        (data || []).forEach(function(feed, idx) {
            let bg2 = "background:#e2e3e5;color:#41464b;border-radius:10px;";
            const low = ["maintenance","scheduled","planned","notice","update","info","informational"];
            const medium = ["unavailable","inaccessible","difficulty","difficulties","slow","slowness","trouble","degraded","delay","delays","partial","unstable","intermittent"];
            const high = ["error","errors","problem","problems","issue","issues","outage","outages","critical","fault","down","failure","failures","disruption","disruptions","major"];

            const item = (feed.item || '').toString();
            const item_short = item.length > 75 ? item.substring(0,72) + "..." : item;

            const lower = item_short.toLowerCase();
            if (medium.some(w => lower.includes(w))) bg2 = "background:#fff3cd;color:#856404;border-radius:10px;";
            if (high.some(w => lower.includes(w))) bg2 = "background:#fddddd;color:maroon;border-radius:10px;";

            html += `
                <div class="col-md-4 col-lg-4 col-sm-6 col-xl-4">
                    <div class="rss-feed-box" data-feed-idx="${idx}" style="margin:5px;height:110px;padding:10px;text-align:center;cursor:pointer;${bg2}">
                        <div><h5>${escapeHtml(feed.name || '')}&nbsp;</h5></div>
                        <div title="${escapeHtml(feed.item || '')}">${escapeHtml(item_short)}</div>
                        ${feed.desc ? `<div style="font-size:12px;color:#888">${escapeHtml(feed.desc)}</div>` : ''}
                    </div>
                </div>`;
        });
        $('#rss_area').html(html);

        $('.rss-feed-box').off('click').on('click', function() {
            const idx = $(this).data('feed-idx');
            showRssFeedModal(idx);
        });

        window._allRssFeeds = data || [];
    }).fail(function() {
        $('#rss_area').html('<div class="text-center text-danger">Unable to load notices. Please try again later.</div>');
    });
}

// Display RSS in modal
function showRssFeedModal(idx) {
    const feeds = window._allRssFeeds || [];
    const feed = feeds[idx];
    if (!feed) return;
    $('#rssFeedModalTitle').text(feed.name || '');

    let html = '';
    html += `<div><strong>Latest Item:</strong><br>${escapeHtml(feed.item || '')}</div>`;
    if (feed.desc) html += `<div class="mt-2"><strong>Description:</strong><br>${escapeHtml(feed.desc)}</div>`;
    if (feed.link) html += `<div class="mt-2"><a href="${escapeHtml(feed.link)}" target="_blank" rel="noopener">View Source</a></div>`;

    if (Array.isArray(feed.items) && feed.items.length) {
        html += `<hr><div><strong>All Items:</strong><ul>`;
        feed.items.forEach(function(itm) {
            html += `<li>${escapeHtml(itm)}</li>`;
        });
        html += `</ul></div>`;
    }

    $('#rssFeedModalBody').html(html);
    const modalEl = document.getElementById('rssFeedModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

// --- Remove Incident Modal ---
let removeIncidentIdx = null;
$(document).on('click', '.remove-incident-btn', function() {
    removeIncidentIdx = $(this).data('idx');
    const modalEl = document.getElementById('removeIncidentModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
});

$(document).on('click', '#confirmRemoveIncident', function() {
    if (removeIncidentIdx === null) return;
    const $incidentDiv = $('.remove-incident-btn[data-idx="' + removeIncidentIdx + '"]').closest('.alert');
    $.ajax({
        url: '', // same page
        type: 'POST',
        data: {
            remove_incident: removeIncidentIdx,
            csrf_token: csrfToken
        },
        success: function() {
            const modalEl = document.getElementById('removeIncidentModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }
            $incidentDiv.fadeOut(400, function() {
                $(this).remove();
                if ($('#incidents_area').children('.alert').length === 0) {
                    loadIncidents();
                }
            });
            removeIncidentIdx = null;
        },
        error: function(xhr) {
            alert(xhr.responseText || 'Failed to remove incident.');
        }
    });
});

// --- Dark Mode Toggle ---
const toggleDarkBtn = document.getElementById('toggle-dark');
if (toggleDarkBtn) {
    toggleDarkBtn.addEventListener('click', function() {
        document.body.classList.toggle('dark-mode');
        document.cookie = 'dark_mode=' + (document.body.classList.contains('dark-mode') ? 'on' : 'off') + ';path=/;max-age=31536000';
        toggleDarkBtn.textContent = document.body.classList.contains('dark-mode') ? lightMode : darkMode;
    });
}

// --- Create Incident ---
$('#createIncidentForm').on('submit', function(e) {
    e.preventDefault();
    $.post('include/create_incident.php', $(this).serialize() + '&csrf_token=' + encodeURIComponent(csrfToken), function(data) {
        $('#createIncidentMsg').html('<div class="alert alert-success">Incident created!</div>');
        $('#createIncidentForm')[0].reset();
        setTimeout(function() {
            $('#createIncidentModal').modal('hide');
            $('#createIncidentMsg').html('');
            loadIncidents();
        }, 1000);
    }).fail(function(xhr) {
        $('#createIncidentMsg').html('<div class="alert alert-danger">'+(xhr.responseText || 'Failed to create incident.')+'</div>');
    });
});

// --- Subscribe Form Submission ---
$('#subscribeForm').on('submit', function(e) {
    e.preventDefault();
    var form = $(this);
    var formData = form.serializeArray();
    var services = $('#subscribeService').val() || [];
    formData = formData.filter(f => f.name !== 'service[]');
    services.forEach(function(s) {
        formData.push({name: 'service[]', value: s});
    });
    formData.push({name: 'csrf_token', value: csrfToken});
    $.post('include/subscriptions.php', $.param(formData), function(response) {
        $('#subscribeMsg').html('<div class="alert alert-success">' + escapeHtml(response.message || 'Subscribed') + '</div>');
        $('#subscribeForm')[0].reset();
    }, 'json').fail(function(xhr) {
        let msg = 'Failed to subscribe.';
        if (xhr.responseJSON && xhr.responseJSON.message) msg = xhr.responseJSON.message;
        $('#subscribeMsg').html('<div class="alert alert-danger">' + escapeHtml(msg) + '</div>');
    });
});

// --- Manage Subscription Form Submission ---
$('#manageSubForm').on('submit', function(e) {
    e.preventDefault();
    var data = $(this).serialize() + '&csrf_token=' + encodeURIComponent(csrfToken);
    $('#manageSubMsg').html('');
    $('#manageSubResults').html('');
    const action = $('#manageAction').val();
    const url = (action === 'view') ? 'include/manage_subscribe.php' : 'include/unsubscribe.php';

    $.post(url, data, function(response) {
        if (action === 'view') {
            $('#manageSubForm button[type="submit"]').hide();
            $('#manageSubForm button[data-bs-target="#subscribeModal"]').hide();
        } else {
            $('#manageSubForm button[type="submit"]').show();
            $('#manageSubForm button[data-bs-target="#subscribeModal"]').show();
        }

        if (response.status === 'success' && response.subscriptions) {
            let html = '<ul class="list-unstyled">';
            response.subscriptions.forEach(function(sub) {
                html += `
                <li class="d-flex align-items-center justify-content-between" style="background:#e2e3e5;border: 1px solid #888;border-radius:5px;padding-left:7px;margin-bottom:5px;">
                    <span>${escapeHtml(sub)}</span>
                    <button class="btn btn-sm btn-danger unsubscribe-service-btn" data-service="${encodeURIComponent(sub)}">Unsubscribe</button>
                </li>`;
            });
            html += '</ul>';
            $('#manageSubResults').html(html);
        }
        $('#manageSubMsg').html('<div class="alert alert-' + (response.status === 'success' ? 'success' : 'danger') + '">' + escapeHtml(response.message || '') + '</div>');
        if (response.status === 'success' && response.action === 'unsubscribe') {
            $('#manageSubResults').html('');
        }
    }, 'json').fail(function(xhr) {
        let msg = 'Failed to process request.';
        if (xhr.responseJSON && xhr.responseJSON.message) msg = xhr.responseJSON.message;
        $('#manageSubMsg').html('<div class="alert alert-danger">' + escapeHtml(msg) + '</div>');
    });
});

// Language selection
$('#langSelect').on('change', function() {
    document.cookie = 'lang=' + this.value + ';path=/;max-age=31536000';
    const params = new URLSearchParams(window.location.search);
    params.set('lang', this.value);
    window.location.search = '?' + params.toString();
});

// Show/hide buttons when action changes
$('#manageAction').on('change', function() {
    if ($(this).val() === 'view') {
        $('#manageSubForm button[type="submit"]').hide();
        $('#manageSubForm button[data-bs-target="#subscribeModal"]').hide();
    } else {
        $('#manageSubForm button[type="submit"]').show();
        $('#manageSubForm button[data-bs-target="#subscribeModal"]').show();
    }
});

// On modal open, reset buttons to visible
$('#manageSubModal').on('show.bs.modal', function() {
    $('#manageSubForm button[type="submit"]').show();
    $('#manageSubForm button[data-bs-target="#subscribeModal"]').show();
});

// Auto-Refresh Logic
let refreshInterval = parseInt($('#refreshInterval').val(), 10) || 60000;
let incidentsTimer = null, statusTimer = null, rssTimer = null;

function saveRefreshInterval(val) {
    localStorage.setItem('refreshInterval', val);
}
function loadRefreshInterval() {
    const saved = localStorage.getItem('refreshInterval');
    if (saved && !isNaN(saved)) {
        $('#refreshInterval').val(saved);
        refreshInterval = parseInt(saved, 10);
    }
}

function startAutoRefresh() {
    if (incidentsTimer) clearInterval(incidentsTimer);
    if (statusTimer) clearInterval(statusTimer);
    if (rssTimer) clearInterval(rssTimer);

    if ($('#refreshToggle').is(':checked')) {
        incidentsTimer = setInterval(loadIncidents, refreshInterval);
        statusTimer = setInterval(loadStatus, refreshInterval);
        rssTimer = setInterval(loadRSS, refreshInterval);
    }
}

const MIN_REFRESH_INTERVAL = 3000;

$('#refreshInterval').on('change keyup', function(e) {
    let val = parseInt($(this).val(), 10) || 60000;
    if (val < MIN_REFRESH_INTERVAL) {
        val = MIN_REFRESH_INTERVAL;
        $(this).val(val);
    }
    if (e.type === 'change' || e.key === 'Enter') {
        refreshInterval = val;
        saveRefreshInterval(refreshInterval);
        startAutoRefresh();
    }
});
$('#refreshToggle').on('change', function() {
    startAutoRefresh();
});

$(document).ready(function() {
    loadRefreshInterval();
    loadIncidents();
    loadStatus();
    loadRSS();
    startAutoRefresh();

    // Show loginModal if the server asked for it (server should expose window.showLoginModal = true)
    if (window.showLoginModal) {
        const modalEl = document.getElementById('loginModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    }
});

// Unsubscribe single service handler
$(document).on('click', '.unsubscribe-service-btn', function() {
    const service = decodeURIComponent($(this).data('service'));
    const email = $('#manageEmail').val();
    if (!email || !service) return;

    const button = this;
    $.post('include/unsubscribe.php', {
        email: email,
        action: 'unsubscribe_single',
        service: service,
        csrf_token: csrfToken
    }, function(response) {
        if (response.status === 'success') {
            $(button).closest('li').remove();
            $('#manageSubMsg').html('<div class="alert alert-success">' + escapeHtml(response.message) + '</div>');
        } else {
            $('#manageSubMsg').html('<div class="alert alert-danger">' + escapeHtml(response.message) + '</div>');
        }
    }, 'json').fail(function(xhr) {
        let msg = 'Failed to unsubscribe.';
        if (xhr.responseJSON && xhr.responseJSON.message) msg = xhr.responseJSON.message;
        $('#manageSubMsg').html('<div class="alert alert-danger">' + escapeHtml(msg) + '</div>');
    });
});
