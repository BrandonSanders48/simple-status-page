<!DOCTYPE html>
<html lang="<?= htmlspecialchars($lang) ?>">
<head>
    <meta charset="UTF-8">
    <title>Simple Status Page – Configuration & Usage Instructions</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="images/favicon.ico">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" crossorigin="anonymous">
    <link href="https://fonts.googleapis.com/css?family=Roboto:400,500,700&display=swap" rel="stylesheet">
    <meta charset="UTF-8">
    <style>
body {
    background: #f8f9fa;
    font-family: 'Roboto', Arial, sans-serif;
}
.tip {
    background: #e9f7ef;
    border-left: 5px solid #28a745;
    padding: 1rem 1.5rem;
    border-radius: 0.5rem;
    margin-top: 2rem;
    font-size: 1.1em;
}
.section-card {
    border-radius: 1rem;
    margin-bottom: 2rem;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    height: 100%;
    display: flex;
    flex-direction: column;
}
.section-card .card-header {
    background: #212529;
    color: #fff;
    border-radius: 1rem 1rem 0 0;
    font-size: 1.15em;
    font-weight: 500;
}
.section-card .card-body {
    background: #fff;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
}
pre {
    background: #f1f3f5;
    border-radius: 0.5rem;
    padding: 1rem;
}
/* Make columns flex so cards in the same row match height */
.row.g-4 > [class^="col-"] {
    display: flex;
    flex-direction: column;
}
@media (max-width: 991.98px) {
    .row.g-4 > [class^="col-"] {
        display: block;
    }
    .section-card {
        height: auto;
    }
}
@media (max-width: 576px) {
    .section-card {
        margin-bottom: 1rem;
    }
}
    </style>
    <script>
    // Browser Notification Help
    document.addEventListener('DOMContentLoaded', function() {
        // Only show the demo button if browser supports notifications
        if ("Notification" in window) {
            const btn = document.getElementById('test-notify-btn');
            if (btn) {
                btn.style.display = '';
                btn.onclick = function() {
                    if (Notification.permission === "default") {
                        Notification.requestPermission().then(function(permission) {
                            if (permission === "granted") {
                                new Notification("Test Notification", {
                                    body: "Browser notifications are enabled and working!",
                                    icon: "images/favicon.ico"
                                });
                            }
                        });
                    } else if (Notification.permission === "granted") {
                        new Notification("Test Notification", {
                            body: "Browser notifications are enabled and working!",
                            icon: "images/favicon.ico"
                        });
                    } else {
                        alert("Notifications are blocked in your browser.");
                    }
                };
            }
        }
    });
    </script>
</head>
<body>
  <div class="container py-4">
    <div class="mb-3">
      <a href="index.php" class="btn btn-outline-secondary">
        <i class="fa fa-arrow-left me-1"></i> Back
      </a>
    </div>
    <div class="mb-4 text-center">
      <h1 class="display-5 fw-bold mb-2"><span class="text-success"><i class="fa-solid fa-circle-check"></i></span> simple-status-page</h1>
      <p class="lead">Configuration &amp; Usage Instructions</p>
      <hr>
    </div>

    <div class="row g-4">
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-info-circle me-2"></i>1. General Information</div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b>Business Name:</b><br>
                Set in <code>"business_name"</code>, this appears in the navbar and page title.
              </li>
              <li class="list-group-item"><b>Logo:</b><br>
                Set <code>"business_logo"</code> to the path of your logo image (e.g., <code>images/logo.png</code>).
              </li>
              <li class="list-group-item"><b>Footer Message:</b><br>
                The <code>"footer_message"</code> is shown at the bottom of the page.
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-user-shield me-2"></i>2. Authentication</div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b>Admin Login:</b><br>
                Credentials are set in the <code>"auth"</code> section:
                <ul>
                  <li><b>Username:</b> <code>"username"</code></li>
                  <li><b>Password:</b> <code>"password"</code></li>
                </ul>
                <span class="badge bg-warning text-dark mt-2">Change these values to secure your status page.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-envelope me-2"></i>3. Email Settings</div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b>Purpose:</b><br>
                Used for subscription notifications.
              </li>
              <li class="list-group-item"><b>Configuration:</b>
                <ul>
                  <li><code>"from"</code>: The sender address for outgoing emails.</li>
                  <li><code>"reply_to"</code>: The reply-to address.</li>
                  <li><code>"smtp"</code>: SMTP server details (host, port, username, password, secure).</li>
                </ul>
                <span class="badge bg-info text-dark mt-2">Update these values to match your organization's email server.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-network-wired me-2"></i>4. Network Checks</div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b>Local Area Network (LAN):</b>
                <ul>
                  <li><code>"gateway"</code>: The IP address of your network gateway (e.g., <code>192.168.1.1</code>).<br>
                    The status page will ping this address to check LAN connectivity.
                  </li>
                  <li><code>"domain"</code>: Your internal domain name (optional, for display).</li>
                </ul>
              </li>
              <li class="list-group-item"><b>Wide Area Network (WAN):</b>
                <ul>
                  <li><code>"public_dns"</code>: A public DNS server (e.g., <code>8.8.8.8</code>) to check internet connectivity.</li>
                  <li><code>"isp_map"</code>: Map public IPs to ISP names for display.</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-server me-2"></i>5. Internal Hosts Monitoring</div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b>Purpose:</b><br>
                Monitor internal or external services (servers, websites, etc.).
              </li>
              <li class="list-group-item"><b>Configuration:</b><br>
                Each entry in <code>"internal_hosts"</code> should include:
                <ul>
                  <li><code>"host"</code>: Hostname or IP to check.</li>
                  <li><code>"port"</code>: Port number (use <code>null</code> for ICMP ping).</li>
                  <li><code>"type"</code>: Service type (e.g., <code>DNS</code>, <code>HTTPS</code>, <code>Ping</code>).</li>
                  <li><code>"name"</code>: Display name for the service.</li>
                  <li><code>"description"</code>: Short description.</li>
                </ul>
                <div class="mt-2"><b>Example:</b></div>
                <pre><code>{
  "host": "8.8.8.8",
  "port": null,
  "type": "Ping",
  "name": "DR Site",
  "description": "Disaster Recovery Site ping test."
}</code></pre>
                If <code>"port"</code> is <code>null</code>, the service will be checked with a ping (ICMP).
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-rss me-2"></i>6. RSS Feeds</div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b>Purpose:</b><br>
                Display status from third-party providers.
              </li>
              <li class="list-group-item"><b>Configuration:</b><br>
                Each entry in <code>"RSS"</code> should include:
                <ul>
                  <li><code>"host"</code>: RSS feed URL.</li>
                  <li><code>"name"</code>: Provider name.</li>
                  <li><code>"tag"</code>: XML tag to parse (usually <code>item</code> or <code>entry</code>).</li>
                  <li><code>"description"</code>: Short description.</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-clock-rotate-left me-2"></i>7. Refresh Rate</div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b>Key:</b> <code>"refresh_rate"</code></li>
              <li class="list-group-item"><b>Value:</b> Time in milliseconds between automatic status checks (e.g., <code>30000</code> for 30 seconds).</li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-bell me-2"></i>8. Alerts: Sound &amp; Browser Notifications</div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item">
                <b>Alert Sound (<code>"alert_sound"</code>):</b><br>
                <code>true</code> or <code>false</code> to enable/disable sound on service status change.
              </li>
              <li class="list-group-item">
                <b>Browser Notifications (<code>"browser_notify"</code>):</b><br>
                <code>true</code> or <code>false</code> to enable/disable browser notifications on service status change.
              </li>
              <li class="list-group-item">
                <b>How it works:</b><br>
                When enabled, your browser will play a sound and/or show a notification if a monitored service goes up or down.<br>
                <button id="test-notify-btn" class="btn btn-info btn-sm mt-2" style="display:none;">
                  <i class="fa fa-bell"></i> Test Notification
                </button>
                <div class="form-text mt-2">
                  You may need to allow notifications in your browser when prompted.<br>
                  <b>Note:</b> Sound may only play after you interact with the page due to browser security.
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-file-lines me-2"></i>9. Meta Information</div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b>Purpose:</b><br>
                For versioning and documentation.
              </li>
              <li class="list-group-item"><b>Fields:</b>
                <ul>
                  <li><code>"version"</code>: Config version.</li>
                  <li><code>"description"</code>: Description of the config.</li>
                  <li><code>"author"</code>: Author or team.</li>
                  <li><code>"page_url"</code>: URL of your status page.</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-pen-to-square me-2"></i>10. How to Edit Configuration</div>
          <div class="card-body">
            <ol class="list-group list-group-numbered">
              <li class="list-group-item">Log in as admin.</li>
              <li class="list-group-item">Click the gear icon to open the configuration editor.</li>
              <li class="list-group-item">Edit the JSON as needed.</li>
              <li class="list-group-item">Save changes and refresh the page.</li>
            </ol>
          </div>
        </div>
      </div>
      <div class="col-12">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-lightbulb me-2"></i>11. Tips</div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b>For Docker/Kubernetes:</b><br>
                Ensure the <code>ping</code> utility is installed in your container for ICMP checks.
              </li>
              <li class="list-group-item"><b>Security:</b><br>
                Change default admin credentials and SMTP passwords.
              </li>
              <li class="list-group-item"><b>Testing:</b><br>
                Use the "Test" services to verify your setup.
              </li>
              <li class="list-group-item"><b>Hide Navbar:</b><br>
                Add <code>?hide_navbar=1</code> to the URL to hide the navigation bar. <br>
                Example: <code>index.php?hide_navbar=1</code>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div class="tip mt-4">
      <i class="fa-solid fa-wrench me-2"></i>
      For further customization, edit the <code>configuration.json</code> file directly or use the web editor as admin.
    </div>
  </div>
</body>
</html>