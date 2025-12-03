let currentServer = null;
let userData = null;
let currentPage = "overview";
let refreshInterval = null;

// Load user data
async function loadUser() {
  try {
    const response = await fetch("/api/user");
    userData = await response.json();

    document.getElementById("userName").textContent = userData.username;
    document.getElementById(
      "userAvatar"
    ).src = `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`;
  } catch (error) {
    console.error("Failed to load user:", error);
  }
}

// Load servers
async function loadServers() {
  try {
    const response = await fetch("/api/servers");
    const servers = await response.json();

    if (servers.length === 0) {
      showServerSelection([]);
      return;
    }

    showServerSelection(servers);
  } catch (error) {
    console.error("Failed to load servers:", error);
    document.getElementById("serverSelector").innerHTML =
      '<p style="color:#ff4444;">Failed to load servers</p>';
  }
}

function showServerSelection(servers) {
  const contentArea = document.getElementById("contentArea");

  if (servers.length === 0) {
    contentArea.innerHTML = `
      <div class="server-selection-page">
        <h1>SERVERS</h1>
        <p class="selection-subtitle">No servers found where you have admin permissions</p>
        <div class="empty-state">
          <div class="empty-icon">🛡️</div>
          <h2>Invite Nexus to Your Server</h2>
          <p>You need to be an administrator in a server with Nexus to access the dashboard.</p>
          <a href="https://discord.com/oauth2/authorize?client_id=1444739230679957646&permissions=8&scope=bot%20applications.commands" 
             target="_blank" 
             class="invite-server-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
            Invite Nexus Bot
          </a>
        </div>
      </div>
    `;
    // Hide sidebar when no servers
    document.querySelector(".sidebar").style.display = "none";
    return;
  }

  // Separate servers with bot vs without
  const serversWithBot = servers.filter((s) => s.hasBot);
  const serversWithoutBot = servers.filter((s) => !s.hasBot);

  contentArea.innerHTML = `
    <div class="server-selection-page">
      <h1>SERVERS</h1>
      <p class="selection-subtitle">Select the server you want to manage</p>
      
      <div class="server-filter">
        <input type="text" id="serverSearch" placeholder="Search servers..." class="server-search-input">
      </div>

      ${
        serversWithBot.length > 0
          ? `
        <h3 style="margin: 30px 0 20px 0; opacity: 0.9;">Servers with Nexus</h3>
        <div class="servers-grid">
          ${serversWithBot
            .map(
              (s) => `
            <div class="server-card" onclick="selectServer('${
              s.id
            }')" data-searchable="${s.name.toLowerCase()}">
              <div class="server-icon">
                ${
                  s.icon
                    ? `<img src="${s.icon}" alt="${s.name}">`
                    : `<div class="server-icon-placeholder">${s.name.charAt(
                        0
                      )}</div>`
                }
              </div>
              <div class="server-info">
                <h3 class="server-name">${s.name}</h3>
                <p class="server-members">${
                  s.memberCount
                    ? s.memberCount.toLocaleString() + " members"
                    : "Unknown members"
                }</p>
              </div>
              <div class="server-arrow">→</div>
            </div>
          `
            )
            .join("")}
        </div>
      `
          : ""
      }

      ${
        serversWithoutBot.length > 0
          ? `
        <h3 style="margin: 40px 0 20px 0; opacity: 0.9;">Invite Nexus to Your Servers</h3>
        <div class="servers-grid">
          ${serversWithoutBot
            .map(
              (s) => `
            <div class="server-card server-card-invite" data-searchable="${s.name.toLowerCase()}">
              <div class="server-icon">
                ${
                  s.icon
                    ? `<img src="${s.icon}" alt="${s.name}">`
                    : `<div class="server-icon-placeholder">${s.name.charAt(
                        0
                      )}</div>`
                }
              </div>
              <div class="server-info">
                <h3 class="server-name">${s.name}</h3>
                <p class="server-members" style="opacity: 0.6;">Bot not added</p>
              </div>
              <a href="https://discord.com/oauth2/authorize?client_id=1444739230679957646&permissions=8&scope=bot%20applications.commands&guild_id=${
                s.id
              }" 
                 target="_blank" 
                 class="invite-btn-small"
                 onclick="event.stopPropagation()">
                Invite Bot
              </a>
            </div>
          `
            )
            .join("")}
        </div>
      `
          : ""
      }

      ${
        serversWithBot.length === 0 && serversWithoutBot.length === 0
          ? `
        <div class="empty-state">
          <div class="empty-icon">🔒</div>
          <h2>No Admin Permissions</h2>
          <p>You don't have administrator permissions in any servers.</p>
        </div>
      `
          : ""
      }
    </div>
  `;

  // Add search functionality
  document.getElementById("serverSearch").addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const serverCards = document.querySelectorAll(
      ".server-card[data-searchable]"
    );

    serverCards.forEach((card) => {
      const serverName = card.getAttribute("data-searchable");
      if (serverName.includes(searchTerm)) {
        card.style.display = "";
      } else {
        card.style.display = "none";
      }
    });
  });

  // Hide sidebar when selecting server
  document.querySelector(".sidebar").style.display = "none";
}

function selectServer(serverId) {
  if (!serverId) return;
  currentServer = serverId;

  // Show sidebar and load server data
  document.querySelector(".sidebar").style.display = "";
  document.getElementById("currentPage").textContent = "Overview";

  // Reset to overview page
  currentPage = "overview";
  document
    .querySelectorAll(".nav-item")
    .forEach((i) => i.classList.remove("active"));
  document.querySelector('[data-page="overview"]').classList.add("active");

  // Load server data
  loadServerData(serverId);

  // Restart auto-refresh for new server
  startAutoRefresh();
}

// Load server data
async function loadServerData(serverId) {
  try {
    const response = await fetch(`/api/server/${serverId}`);
    const server = await response.json();

    // Update current server display in sidebar
    updateCurrentServerDisplay(server);

    loadOverview(server);
  } catch (error) {
    console.error("Failed to load server data:", error);
  }
}

function updateCurrentServerDisplay(server) {
  const display = document.getElementById("currentServerDisplay");
  display.innerHTML = `
    <div class="current-server-info">
      <div class="current-server-icon">
        ${
          server.icon
            ? `<img src="${server.icon}" alt="${server.name}">`
            : server.name.charAt(0)
        }
      </div>
      <div class="current-server-details">
        <h3>${server.name}</h3>
        <p>${server.memberCount.toLocaleString()} members</p>
      </div>
    </div>
  `;
}

// Load overview page
async function loadOverview(server) {
  const contentArea = document.getElementById("contentArea");

  const config = server.config || {};
  const securityScore = calculateSecurityScore(config);

  // Fetch real stats
  let stats = {
    memberCount: server.memberCount,
    modActions: 0,
    warnings: 0,
    threatsDetected: 0,
    raidsBlocked: 0,
  };

  try {
    const statsResponse = await fetch(`/api/server/${server.id}/stats`);
    if (statsResponse.ok) {
      stats = await statsResponse.json();
    }
  } catch (error) {
    console.error("Failed to load stats:", error);
  }

  contentArea.innerHTML = `
        <div class="security-score">
            <h2>Security Score</h2>
            <div class="score-circle">${securityScore}%</div>
            <p>Your server protection level</p>
        </div>

        <h2 style="margin-bottom: 25px;">Server Statistics</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${stats.memberCount.toLocaleString()}</div>
                <div class="stat-label">Members</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.modActions.toLocaleString()}</div>
                <div class="stat-label">Mod Actions</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.warnings.toLocaleString()}</div>
                <div class="stat-label">Warnings Issued</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.threatsDetected.toLocaleString()}</div>
                <div class="stat-label">Threats Detected</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.raidsBlocked.toLocaleString()}</div>
                <div class="stat-label">Raids Blocked</div>
            </div>
        </div>

        <h2 style="margin-top: 40px; margin-bottom: 25px;">Quick Systems Overview</h2>
        <div class="systems-grid">
            <div class="system-card">
                <div class="system-header">
                    <div class="system-title">
                        <span class="system-icon">🛡️</span>
                        <span>Anti-Nuke</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" ${
                          config.anti_nuke_enabled !== 0 ? "checked" : ""
                        } 
                               onchange="toggleSetting('anti_nuke_enabled', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
                <p class="system-description">
                    Monitors staff actions and prevents server nuking attempts with role hierarchy protection.
                </p>
                <div class="system-footer">
                    <button class="settings-btn" onclick="loadPage('anti-nuke')">SETTINGS</button>
                </div>
            </div>

            <div class="system-card">
                <div class="system-header">
                    <div class="system-title">
                        <span class="system-icon">⚔️</span>
                        <span>Anti-Raid</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" ${
                          config.anti_raid_enabled !== 0 ? "checked" : ""
                        } 
                               onchange="toggleSetting('anti_raid_enabled', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
                <p class="system-description">
                    4 concurrent algorithms detecting mass joins, bot raids, and coordinated attacks.
                </p>
                <div class="system-footer">
                    <button class="settings-btn" onclick="loadPage('anti-raid')">SETTINGS</button>
                </div>
            </div>

            <div class="system-card">
                <div class="system-header">
                    <div class="system-title">
                        <span class="system-icon">🤖</span>
                        <span>Auto-Mod</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" ${
                          config.auto_mod_enabled !== 0 ? "checked" : ""
                        } 
                               onchange="toggleSetting('auto_mod_enabled', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
                <p class="system-description">
                    AI-powered content filtering, spam detection, and automated moderation.
                </p>
                <div class="system-footer">
                    <button class="settings-btn" onclick="loadPage('auto-mod')">SETTINGS</button>
                </div>
            </div>

            <div class="system-card">
                <div class="system-header">
                    <div class="system-title">
                        <span class="system-icon">📸</span>
                        <span>Auto-Recovery</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" ${
                          config.auto_recovery_enabled !== 0 ? "checked" : ""
                        } 
                               onchange="toggleSetting('auto_recovery_enabled', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
                <p class="system-description">
                    Hourly snapshots with point-in-time recovery. Restore deleted channels/roles instantly.
                </p>
                <div class="system-footer">
                    <button class="settings-btn" onclick="loadPage('recovery')">SETTINGS</button>
                </div>
            </div>

            <div class="system-card">
                <div class="system-header">
                    <div class="system-title">
                        <span class="system-icon">📝</span>
                        <span>Logging</span>
                    </div>
                    <span class="status-badge ${
                      config.mod_log_channel
                        ? "status-active"
                        : "status-inactive"
                    }">
                        ${config.mod_log_channel ? "ACTIVE" : "INACTIVE"}
                    </span>
                </div>
                <p class="system-description">
                    Comprehensive audit logs for all moderation actions and security events.
                </p>
                <div class="system-footer">
                    <button class="settings-btn" onclick="loadPage('logging')">CONFIGURE</button>
                </div>
            </div>
        </div>
    `;
}

function calculateSecurityScore(config) {
  let score = 0;
  if (config.anti_nuke_enabled !== 0) score += 20;
  if (config.anti_raid_enabled !== 0) score += 20;
  if (config.auto_mod_enabled !== 0) score += 15;
  if (config.auto_recovery_enabled !== 0) score += 20;
  if (config.mod_log_channel) score += 15;
  if (config.vote_rewards_enabled !== 0) score += 10;
  return Math.min(score, 100);
}

async function toggleSetting(setting, enabled) {
  if (!currentServer) return;

  try {
    const updates = {};
    updates[setting] = enabled ? 1 : 0;

    await fetch(`/api/server/${currentServer}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    // Show success feedback
    const toast = document.createElement("div");
    toast.textContent = "✅ Setting updated!";
    toast.style.cssText =
      "position:fixed; bottom:20px; right:20px; background:#43b581; color:white; padding:15px 25px; border-radius:8px; font-weight:bold; z-index:9999;";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);

    // Reload server data to refresh
    setTimeout(() => loadServerData(currentServer), 500);
  } catch (error) {
    console.error("Failed to toggle setting:", error);
    alert("Failed to update setting");
  }
}

function loadPage(page) {
  // Bulk operations doesn't require a server selection
  if (page === "bulk") {
    loadBulkOperations();
    return;
  }

  if (!currentServer) {
    alert("Please select a server first!");
    return;
  }

  switch (page) {
    case "modlogs":
      loadModLogs();
      break;
    case "security":
      loadSecurityLogs();
      break;
    case "anti-nuke":
      loadAntiNukePage();
      break;
    case "anti-raid":
      loadAntiRaidPage();
      break;
    case "auto-mod":
      loadAutoModPage();
      break;
    case "logging":
      loadLoggingPage();
      break;
    case "recovery":
      loadRecoveryPage();
      break;
    case "bulk":
      loadBulkOperations();
      break;
    default:
      alert(`${page} page coming soon!`);
  }
}

// Bulk Operations Page (EXCEEDS WICK!)
async function loadBulkOperations() {
  const contentArea = document.getElementById("contentArea");
  
  contentArea.innerHTML = `
    <div class="content-header">
      <h1>⚡ Bulk Operations</h1>
      <p>Manage settings across multiple servers at once</p>
      <p style="color: #ffd700; font-size: 0.9rem;">⭐ Feature not available in Wick!</p>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px;">
      <div>
        <h3 style="margin-bottom: 20px;">📋 Select Servers</h3>
        <div style="margin-bottom: 15px;">
          <button class="btn-secondary" style="margin-right: 10px;" onclick="selectAllServers()">✓ Select All</button>
          <button class="btn-secondary" onclick="deselectAllServers()">✗ Deselect All</button>
        </div>
        <div id="bulk-server-list" style="max-height: 600px; overflow-y: auto;">
          <div class="loading">Loading servers...</div>
        </div>
      </div>

      <div>
        <h3 style="margin-bottom: 20px;">⚡ Bulk Actions</h3>
        
        <div class="setting-card" style="margin-bottom: 20px;">
          <div class="setting-header">
            <span>🛡️ Anti-Nuke Protection</span>
          </div>
          <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button class="btn" style="flex: 1; background: #00d1b2;" onclick="bulkToggle('anti_nuke_enabled', true)">
              ✓ Enable on Selected
            </button>
            <button class="btn" style="flex: 1; background: #ff4444;" onclick="bulkToggle('anti_nuke_enabled', false)">
              ✗ Disable on Selected
            </button>
          </div>
        </div>

        <div class="setting-card" style="margin-bottom: 20px;">
          <div class="setting-header">
            <span>⚔️ Anti-Raid Protection</span>
          </div>
          <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button class="btn" style="flex: 1; background: #00d1b2;" onclick="bulkToggle('anti_raid_enabled', true)">
              ✓ Enable on Selected
            </button>
            <button class="btn" style="flex: 1; background: #ff4444;" onclick="bulkToggle('anti_raid_enabled', false)">
              ✗ Disable on Selected
            </button>
          </div>
        </div>

        <div class="setting-card" style="margin-bottom: 20px;">
          <div class="setting-header">
            <span>🤖 Auto-Moderation</span>
          </div>
          <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button class="btn" style="flex: 1; background: #00d1b2;" onclick="bulkToggle('auto_mod_enabled', true)">
              ✓ Enable on Selected
            </button>
            <button class="btn" style="flex: 1; background: #ff4444;" onclick="bulkToggle('auto_mod_enabled', false)">
              ✗ Disable on Selected
            </button>
          </div>
        </div>

        <div class="setting-card" style="margin-bottom: 20px;">
          <div class="setting-header">
            <span>🔄 Auto-Recovery</span>
          </div>
          <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button class="btn" style="flex: 1; background: #00d1b2;" onclick="bulkToggle('auto_recovery_enabled', true)">
              ✓ Enable on Selected
            </button>
            <button class="btn" style="flex: 1; background: #ff4444;" onclick="bulkToggle('auto_recovery_enabled', false)">
              ✗ Disable on Selected
            </button>
          </div>
        </div>

        <div id="bulk-result" style="margin-top: 20px; display: none; padding: 20px; background: rgba(0, 209, 178, 0.2); border-radius: 10px; border: 2px solid #00d1b2;">
          <div id="bulk-status"></div>
        </div>
      </div>
    </div>
  `;

  // Load servers for bulk selection
  try {
    const response = await fetch("/api/servers");
    const servers = await response.json();
    const serversWithBot = servers.filter(s => s.hasBot);
    
    const listEl = document.getElementById("bulk-server-list");
    if (serversWithBot.length === 0) {
      listEl.innerHTML = '<p style="opacity: 0.7;">No servers available</p>';
      return;
    }

    listEl.innerHTML = serversWithBot.map(server => `
      <label style="display: flex; align-items: center; padding: 15px; background: rgba(255, 255, 255, 0.05); border-radius: 10px; margin-bottom: 10px; cursor: pointer; transition: all 0.3s;" 
             onmouseover="this.style.background='rgba(255, 255, 255, 0.1)'" 
             onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'">
        <input type="checkbox" class="server-checkbox" value="${server.id}" data-name="${server.name}" 
               style="margin-right: 15px; width: 20px; height: 20px; cursor: pointer;">
        <img src="${server.icon || 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
             alt="${server.name}" 
             style="width: 40px; height: 40px; border-radius: 50%; margin-right: 15px;">
        <div style="flex: 1;">
          <div style="font-weight: 700;">${server.name}</div>
          <div style="font-size: 0.85rem; opacity: 0.7;">${server.memberCount} members</div>
        </div>
      </label>
    `).join("");
  } catch (error) {
    console.error("Failed to load servers for bulk:", error);
  }
}

function selectAllServers() {
  document.querySelectorAll('.server-checkbox').forEach(cb => cb.checked = true);
}

function deselectAllServers() {
  document.querySelectorAll('.server-checkbox').forEach(cb => cb.checked = false);
}

async function bulkToggle(setting, value) {
  const selectedServers = Array.from(document.querySelectorAll('.server-checkbox:checked'))
    .map(cb => ({ id: cb.value, name: cb.dataset.name }));

  if (selectedServers.length === 0) {
    alert("Please select at least one server!");
    return;
  }

  const settingName = setting.replace(/_enabled/g, '').replace(/_/g, ' ');
  if (!confirm(`${value ? 'Enable' : 'Disable'} ${settingName} on ${selectedServers.length} server(s)?`)) {
    return;
  }

  const resultEl = document.getElementById("bulk-result");
  const statusEl = document.getElementById("bulk-status");
  resultEl.style.display = "block";
  statusEl.innerHTML = `<div class="loading">⚡ Processing ${selectedServers.length} servers...</div>`;

  let succeeded = 0;
  let failed = 0;
  const failedServers = [];

  for (const server of selectedServers) {
    try {
      const response = await fetch(`/api/server/${server.id}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [setting]: value ? 1 : 0 })
      });

      if (response.ok) {
        succeeded++;
        statusEl.innerHTML = `<div class="loading">⚡ Processing... (${succeeded}/${selectedServers.length})</div>`;
      } else {
        failed++;
        failedServers.push(server.name);
      }
    } catch (error) {
      failed++;
      failedServers.push(server.name);
    }
  }

  statusEl.innerHTML = `
    <h3 style="color: #00d1b2; margin-bottom: 10px;">✅ Bulk Operation Complete!</h3>
    <p style="font-size: 1.1rem; margin: 5px 0;">✅ Successfully updated: <strong>${succeeded}</strong> servers</p>
    ${failed > 0 ? `
      <p style="color: #ff4444; margin: 5px 0;">❌ Failed: <strong>${failed}</strong> servers</p>
      <details style="margin-top: 10px;">
        <summary style="cursor: pointer; opacity: 0.8;">Show failed servers</summary>
        <ul style="margin-top: 10px; opacity: 0.8;">
          ${failedServers.map(name => `<li>${name}</li>`).join('')}
        </ul>
      </details>
    ` : ''}
  `;

  setTimeout(() => {
    resultEl.style.display = "none";
  }, 10000);
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadUser();
  loadServers();

  // Handle navigation
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();

      // Update active state
      document
        .querySelectorAll(".nav-item")
        .forEach((i) => i.classList.remove("active"));
      item.classList.add("active");

      const page = item.dataset.page;
      currentPage = page;

      // Update page title
      const pageTitle = item.querySelector("span:last-child").textContent;
      document.getElementById("currentPage").textContent = pageTitle;

      // Load page content
      if (page === "overview") {
        if (currentServer) loadServerData(currentServer);
      } else {
        loadPage(page);
      }
    });
  });

  // Mobile menu toggle
  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");

  function toggleMobileMenu() {
    sidebar.classList.toggle("active");
    overlay.classList.toggle("active");
  }

  mobileMenuToggle.addEventListener("click", toggleMobileMenu);
  overlay.addEventListener("click", toggleMobileMenu);
});

// Anti-Nuke Settings Page
async function loadAntiNukePage() {
  const contentArea = document.getElementById("contentArea");
  const response = await fetch(`/api/server/${currentServer}`);
  const server = await response.json();
  const config = server.config || {};

  contentArea.innerHTML = `
    <h2>Anti-Nuke Protection</h2>
    <p style="opacity:0.8; margin-bottom:30px;">Protect your server from malicious attacks that could destroy channels, roles, and bans.</p>

    <div class="settings-section">
      <div class="setting-row">
        <div class="setting-info">
          <h3>Anti-Nuke System</h3>
          <p>Automatically detects and stops mass deletion/creation of channels, roles, bans, and kicks</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${
            config.anti_nuke_enabled !== 0 ? "checked" : ""
          } onchange="updateConfig('anti_nuke_enabled', this.checked ? 1 : 0)">
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <h3>Alert Channel</h3>
          <p>Channel where anti-nuke alerts will be sent</p>
        </div>
        <input type="text" class="setting-input" placeholder="Channel ID" value="${
          config.alert_channel || ""
        }" onchange="updateConfig('alert_channel', this.value)">
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <h3>Threat Threshold</h3>
          <p>How many actions trigger anti-nuke protection (lower = more sensitive)</p>
        </div>
        <input type="number" class="setting-input" min="1" max="100" value="${
          config.alert_threshold || 60
        }" onchange="updateConfig('alert_threshold', parseInt(this.value))">
      </div>
    </div>

    <div class="info-box" style="margin-top:30px;">
      <strong>🛡️ How it works:</strong><br>
      Nexus monitors all server changes and automatically detects suspicious patterns. When a threat is detected, the bot will:
      <ul style="margin-top:10px; margin-left:20px;">
        <li>Immediately stop the attacker</li>
        <li>Remove dangerous permissions</li>
        <li>Send alerts to your alert channel</li>
        <li>Create a recovery snapshot</li>
      </ul>
    </div>
  `;
}

// Anti-Raid Settings Page
async function loadAntiRaidPage() {
  const contentArea = document.getElementById("contentArea");
  const response = await fetch(`/api/server/${currentServer}`);
  const server = await response.json();
  const config = server.config || {};

  contentArea.innerHTML = `
    <h2>Anti-Raid Protection</h2>
    <p style="opacity:0.8; margin-bottom:30px;">Protect your server from coordinated attacks with mass joins, spam, and raids.</p>

    <div class="settings-section">
      <div class="setting-row">
        <div class="setting-info">
          <h3>Anti-Raid System</h3>
          <p>Automatically detects and stops raid attempts with intelligent pattern recognition</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${
            config.anti_raid_enabled !== 0 ? "checked" : ""
          } onchange="updateConfig('anti_raid_enabled', this.checked ? 1 : 0)">
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <h3>Join Gate</h3>
          <p>Advanced verification for new members (blocks bots, new accounts, suspicious usernames)</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" onchange="alert('Join Gate settings require setup command. Use /joingate in your server')">
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <div class="stats-grid" style="margin-top:40px;">
      <div class="stat-card">
        <div class="stat-value" id="raidsBlocked">...</div>
        <div class="stat-label">Raids Blocked</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="suspiciousJoins">0</div>
        <div class="stat-label">Suspicious Joins</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="botsBlocked">0</div>
        <div class="stat-label">Bots Blocked</div>
      </div>
    </div>

    <div class="info-box" style="margin-top:30px;">
      <strong>⚔️ Protection Features:</strong><br>
      <ul style="margin-top:10px; margin-left:20px;">
        <li>Detects mass join patterns and raid coordination</li>
        <li>Blocks suspicious accounts (new, no avatar, spam usernames)</li>
        <li>Intelligent behavior analysis using AI</li>
        <li>Automatic lockdown during active raids</li>
      </ul>
    </div>
  `;

  // Load raid stats
  fetch(`/api/server/${currentServer}/antiraid`)
    .then((r) => r.json())
    .then((data) => {
      document.getElementById("raidsBlocked").textContent =
        data.raidsBlocked || 0;
    });
}

// Auto-Mod Settings Page
async function loadAutoModPage() {
  const contentArea = document.getElementById("contentArea");
  const response = await fetch(`/api/server/${currentServer}`);
  const server = await response.json();
  const config = server.config || {};

  contentArea.innerHTML = `
    <h2>Auto-Moderation</h2>
    <p style="opacity:0.8; margin-bottom:30px;">Automated content filtering and spam protection.</p>

    <div class="settings-section">
      <div class="setting-row">
        <div class="setting-info">
          <h3>Auto-Mod System</h3>
          <p>Automatically detects and removes spam, inappropriate content, and rule violations</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${
            config.auto_mod_enabled !== 0 ? "checked" : ""
          } onchange="updateConfig('auto_mod_enabled', this.checked ? 1 : 0)">
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <h3>Heat System</h3>
          <p>Track user behavior and assign "heat scores" for suspicious activity</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${
            config.heat_system_enabled !== 0 ? "checked" : ""
          } onchange="updateConfig('heat_system_enabled', this.checked ? 1 : 0)">
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <h3>Mod Log Channel</h3>
          <p>Channel where moderation actions will be logged</p>
        </div>
        <input type="text" class="setting-input" placeholder="Channel ID" value="${
          config.mod_log_channel || ""
        }" onchange="updateConfig('mod_log_channel', this.value)">
      </div>
    </div>

    <div class="info-box" style="margin-top:30px;">
      <strong>🤖 Auto-Mod Features:</strong><br>
      <ul style="margin-top:10px; margin-left:20px;">
        <li>Spam detection and prevention</li>
        <li>Link filtering and phishing protection</li>
        <li>Bad word filtering</li>
        <li>Mention spam protection</li>
        <li>Behavioral analysis and heat scores</li>
      </ul>
    </div>
  `;
}

// Logging Settings Page
async function loadLoggingPage() {
  const contentArea = document.getElementById("contentArea");
  const response = await fetch(`/api/server/${currentServer}`);
  const server = await response.json();
  const config = server.config || {};

  contentArea.innerHTML = `
    <h2>Logging Configuration</h2>
    <p style="opacity:0.8; margin-bottom:30px;">Configure where and what to log in your server.</p>

    <div class="settings-section">
      <div class="setting-row">
        <div class="setting-info">
          <h3>Mod Log Channel</h3>
          <p>All moderation actions (bans, kicks, warnings, mutes)</p>
        </div>
        <input type="text" class="setting-input" placeholder="Channel ID" value="${
          config.mod_log_channel || ""
        }" onchange="updateConfig('mod_log_channel', this.value)">
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <h3>Alert Channel</h3>
          <p>Security alerts and threat notifications</p>
        </div>
        <input type="text" class="setting-input" placeholder="Channel ID" value="${
          config.alert_channel || ""
        }" onchange="updateConfig('alert_channel', this.value)">
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <h3>Welcome Channel</h3>
          <p>Welcome messages for new members</p>
        </div>
        <input type="text" class="setting-input" placeholder="Channel ID" value="${
          config.welcome_channel || ""
        }" onchange="updateConfig('welcome_channel', this.value)">
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <h3>Leave Channel</h3>
          <p>Goodbye messages when members leave</p>
        </div>
        <input type="text" class="setting-input" placeholder="Channel ID" value="${
          config.leave_channel || ""
        }" onchange="updateConfig('leave_channel', this.value)">
      </div>
    </div>
  `;
}

// Recovery Settings Page
async function loadRecoveryPage() {
  const contentArea = document.getElementById("contentArea");
  const response = await fetch(`/api/server/${currentServer}`);
  const server = await response.json();
  const config = server.config || {};

  contentArea.innerHTML = `
    <h2>Auto-Recovery System</h2>
    <p style="opacity:0.8; margin-bottom:30px;">Automatic server backups and restoration capabilities.</p>

    <div class="settings-section">
      <div class="setting-row">
        <div class="setting-info">
          <h3>Auto-Recovery</h3>
          <p>Automatically creates snapshots of your server (channels, roles, settings)</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${
            config.auto_recovery_enabled !== 0 ? "checked" : ""
          } onchange="updateConfig('auto_recovery_enabled', this.checked ? 1 : 0)">
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <h3 style="margin-top:40px; margin-bottom:20px;">Recent Snapshots</h3>
    <div id="snapshotsContainer">
      <div class="loading">Loading snapshots...</div>
    </div>
  `;

  // Load recent snapshots
  fetch(`/api/server/${currentServer}/snapshots`)
    .then((r) => (r.ok ? r.json() : []))
    .then((snapshots) => {
      const container = document.getElementById("snapshotsContainer");
      if (!snapshots || snapshots.length === 0) {
        container.innerHTML =
          '<p style="opacity:0.7;">No snapshots yet. They will be created automatically.</p>';
        return;
      }

      container.innerHTML = snapshots
        .map(
          (snap) => `
        <div class="snapshot-card">
          <div class="snapshot-header">
            <strong>${snap.snapshot_type}</strong>
            <span style="opacity:0.7;">${new Date(
              snap.created_at
            ).toLocaleString()}</span>
          </div>
          <p style="opacity:0.8; margin-top:10px;">${
            snap.reason || "Automatic snapshot"
          }</p>
        </div>
      `
        )
        .join("");
    })
    .catch(() => {
      document.getElementById("snapshotsContainer").innerHTML =
        '<p style="color:#ff4444;">Failed to load snapshots</p>';
    });
}

// Update config helper function
async function updateConfig(key, value) {
  if (!currentServer) return;

  try {
    const updates = {};
    updates[key] = value;

    await fetch(`/api/server/${currentServer}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    // Show success feedback
    const toast = document.createElement("div");
    toast.textContent = "✅ Settings saved!";
    toast.style.cssText =
      "position:fixed; bottom:20px; right:20px; background:#43b581; color:white; padding:15px 25px; border-radius:8px; font-weight:bold; z-index:9999;";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  } catch (error) {
    console.error("Failed to update config:", error);
    alert("Failed to save settings");
  }
}

// Load moderation logs page
async function loadModLogs() {
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <h2>Moderation Logs</h2>
    <div id="modLogsContainer" style="margin-top: 20px;">
      <div class="loading">Loading moderation logs...</div>
    </div>
  `;

  try {
    const response = await fetch(
      `/api/server/${currentServer}/modlogs?limit=50`
    );
    const logs = await response.json();

    const container = document.getElementById("modLogsContainer");

    if (logs.length === 0) {
      container.innerHTML =
        '<p style="opacity:0.7;">No moderation logs yet.</p>';
      return;
    }

    container.innerHTML = `
      <div class="logs-table">
        <div class="logs-header">
          <div>Date</div>
          <div>Action</div>
          <div>User</div>
          <div>Moderator</div>
          <div>Reason</div>
        </div>
        ${logs
          .map(
            (log) => `
          <div class="log-row">
            <div>${new Date(log.timestamp).toLocaleString()}</div>
            <div><span class="action-badge action-${log.action.toLowerCase()}">${log.action.toUpperCase()}</span></div>
            <div><code>${log.user_id}</code></div>
            <div><code>${log.moderator_id}</code></div>
            <div>${log.reason || "No reason provided"}</div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  } catch (error) {
    console.error("Failed to load mod logs:", error);
    document.getElementById("modLogsContainer").innerHTML =
      '<p style="color:#ff4444;">Failed to load moderation logs</p>';
  }
}

// Load security logs page
async function loadSecurityLogs() {
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <h2>Security Logs</h2>
    <div id="securityLogsContainer" style="margin-top: 20px;">
      <div class="loading">Loading security logs...</div>
    </div>
  `;

  try {
    const response = await fetch(
      `/api/server/${currentServer}/security?limit=50`
    );
    const logs = await response.json();

    const container = document.getElementById("securityLogsContainer");

    if (logs.length === 0) {
      container.innerHTML = '<p style="opacity:0.7;">No security logs yet.</p>';
      return;
    }

    container.innerHTML = `
      <div class="logs-table">
        <div class="logs-header">
          <div>Date</div>
          <div>Event Type</div>
          <div>User</div>
          <div>Threat Score</div>
          <div>Details</div>
        </div>
        ${logs
          .map(
            (log) => `
          <div class="log-row">
            <div>${new Date(log.timestamp).toLocaleString()}</div>
            <div><span class="threat-badge threat-${
              log.threat_type || "unknown"
            }">${log.event_type}</span></div>
            <div><code>${log.user_id || "N/A"}</code></div>
            <div><span class="score-badge score-${
              log.threat_score >= 70
                ? "high"
                : log.threat_score >= 40
                ? "medium"
                : "low"
            }">${log.threat_score || 0}</span></div>
            <div>${log.details || "No details"}</div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  } catch (error) {
    console.error("Failed to load security logs:", error);
    document.getElementById("securityLogsContainer").innerHTML =
      '<p style="color:#ff4444;">Failed to load security logs</p>';
  }
}

// Auto-refresh for live updates
function startAutoRefresh() {
  // Clear existing interval
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  // Refresh every 30 seconds
  refreshInterval = setInterval(() => {
    if (!currentServer) return;

    // Refresh based on current page
    switch (currentPage) {
      case "overview":
        loadServerData(currentServer);
        break;
      case "modlogs":
        loadModLogs();
        break;
      case "security":
        loadSecurityLogs();
        break;
    }
  }, 30000); // 30 seconds
}

// Navigation
document.addEventListener("DOMContentLoaded", () => {
  loadUser();
  loadServers();
  startAutoRefresh();

  // Nav item click handling
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      document
        .querySelectorAll(".nav-item")
        .forEach((i) => i.classList.remove("active"));
      item.classList.add("active");

      const pageTitle = item.querySelector("span:last-child").textContent;
      const pageName = item.dataset.page;

      currentPage = pageName;
      document.getElementById("currentPage").textContent = pageTitle;

      // Load the appropriate page
      if (pageName === "overview") {
        if (currentServer) loadServerData(currentServer);
      } else {
        loadPage(pageName);
      }
    });
  });

  // Mobile menu functionality
  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      sidebarOverlay.classList.toggle("active");
    });

    // Close sidebar when overlay is clicked
    sidebarOverlay.addEventListener("click", () => {
      sidebar.classList.remove("open");
      sidebarOverlay.classList.remove("active");
    });

    // Close sidebar when a nav item is clicked on mobile
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => {
        if (window.innerWidth <= 968) {
          sidebar.classList.remove("open");
          sidebarOverlay.classList.remove("active");
        }
      });
    });
  }
});
