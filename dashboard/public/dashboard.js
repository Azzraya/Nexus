let currentServer = null;
let userData = null;
let currentPage = "overview";
let refreshInterval = null;

// Load user data
async function loadUser() {
  try {
    const response = await fetch("/api/user");

    // Auto-redirect on auth errors
    if (!response.ok && (response.status === 401 || response.status === 403)) {
      console.log("Unauthorized access, redirecting to login...");
      window.location.href = "/";
      return;
    }

    userData = await response.json();

    document.getElementById("userName").textContent = userData.username;
    document.getElementById("userAvatar").src =
      `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`;
  } catch (error) {
    console.error("Failed to load user:", error);
  }
}

// Load servers
async function loadServers() {
  try {
    const response = await fetch("/api/servers");

    // Auto-redirect on auth errors
    if (!response.ok && (response.status === 401 || response.status === 403)) {
      console.log("Unauthorized access, redirecting to login...");
      window.location.href = "/";
      return;
    }

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

  // Redirect to server-specific URL for persistence
  window.location.href = `/${serverId}/dashboard`;
}

// Load server data
async function loadServerData(serverId) {
  try {
    const response = await fetch(`/api/server/${serverId}`);
    if (!response.ok) {
      // Auto-redirect on auth errors
      if (response.status === 401 || response.status === 403) {
        console.log("Unauthorized access, redirecting to login...");
        window.location.href = "/";
        return;
      }
      throw new Error(`Server returned ${response.status}`);
    }
    const server = await response.json();

    // Update current server display in sidebar
    updateCurrentServerDisplay(server);

    loadOverview(server);
  } catch (error) {
    console.error("Failed to load server data:", error);
    // Show error in content area but keep sidebar visible
    const contentArea = document.getElementById("contentArea");
    contentArea.innerHTML = `
      <div class="content-section">
        <h2>⚠️ Error Loading Server</h2>
        <p>Failed to load server data. This could mean:</p>
        <ul>
          <li>The bot is not in this server</li>
          <li>You don't have permission to manage this server</li>
          <li>The server ID is invalid</li>
        </ul>
        <button class="btn" onclick="window.location.href='/dashboard'">
          ← Back to Server Selection
        </button>
      </div>
    `;
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
    case "message-logs":
      loadMessageLogsPage();
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
    case "joingate":
      loadJoinGatePage();
      break;
    case "verification":
      loadVerificationPage();
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
    case "templates":
      loadTemplates();
      break;
    case "workflows":
      loadWorkflows();
      break;
    case "analytics":
      loadAdvancedAnalytics();
      break;
    case "leaderboard":
      loadLeaderboard();
      break;
    case "comparison":
      loadServerComparison();
      break;
    case "migration":
      loadMigrationTool();
      break;
    default:
      alert(`${page} page coming soon!`);
  }
}

// Template Library (EXCEEDS WICK!)
async function loadTemplates() {
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <div class="content-header">
      <h1>📋 Configuration Templates</h1>
      <p>One-click server setup with pre-made configs</p>
      <p style="color: #ffd700; font-size: 0.9rem;">⭐ Feature not available in Wick!</p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 25px; margin-top: 30px;">
      <!-- Gaming Server Template -->
      <div class="setting-card" style="height: auto;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 4rem; margin-bottom: 10px;">🎮</div>
          <h2>Gaming Server</h2>
          <p style="opacity: 0.8; margin-bottom: 20px;">Optimized for gaming communities with focus on anti-raid</p>
        </div>
        <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 10px; margin-bottom: 20px;">
          <div style="margin-bottom: 8px;">✅ Anti-Raid: <strong>ON</strong></div>
          <div style="margin-bottom: 8px;">✅ Anti-Nuke: <strong>ON</strong></div>
          <div style="margin-bottom: 8px;">✅ Auto-Mod: <strong>ON</strong></div>
          <div style="margin-bottom: 8px;">✅ Auto-Recovery: <strong>ON</strong></div>
        </div>
        <button class="btn" onclick="applyTemplate('gaming')" style="width: 100%;">
          ⚡ Apply to Current Server
        </button>
      </div>

      <!-- Community Server Template -->
      <div class="setting-card" style="height: auto;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 4rem; margin-bottom: 10px;">💬</div>
          <h2>Community Server</h2>
          <p style="opacity: 0.8; margin-bottom: 20px;">Balanced protection for community servers</p>
        </div>
        <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 10px; margin-bottom: 20px;">
          <div style="margin-bottom: 8px;">✅ Anti-Raid: <strong>ON</strong></div>
          <div style="margin-bottom: 8px;">✅ Anti-Nuke: <strong>ON</strong></div>
          <div style="margin-bottom: 8px;">✅ Auto-Mod: <strong>ON</strong></div>
          <div style="margin-bottom: 8px;">❌ Auto-Recovery: <strong>OFF</strong></div>
        </div>
        <button class="btn" onclick="applyTemplate('community')" style="width: 100%;">
          ⚡ Apply to Current Server
        </button>
      </div>

      <!-- RP Server Template -->
      <div class="setting-card" style="height: auto;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 4rem; margin-bottom: 10px;">🎭</div>
          <h2>Roleplay Server</h2>
          <p style="opacity: 0.8; margin-bottom: 20px;">Light protection with focus on logging</p>
        </div>
        <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 10px; margin-bottom: 20px;">
          <div style="margin-bottom: 8px;">✅ Anti-Nuke: <strong>ON</strong></div>
          <div style="margin-bottom: 8px;">❌ Anti-Raid: <strong>OFF</strong></div>
          <div style="margin-bottom: 8px;">✅ Auto-Mod: <strong>ON</strong></div>
          <div style="margin-bottom: 8px;">❌ Auto-Recovery: <strong>OFF</strong></div>
        </div>
        <button class="btn" onclick="applyTemplate('rp')" style="width: 100%;">
          ⚡ Apply to Current Server
        </button>
      </div>

      <!-- Maximum Security Template -->
      <div class="setting-card" style="height: auto;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 4rem; margin-bottom: 10px;">🔒</div>
          <h2>Maximum Security</h2>
          <p style="opacity: 0.8; margin-bottom: 20px;">All protection features enabled</p>
        </div>
        <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 10px; margin-bottom: 20px;">
          <div style="margin-bottom: 8px;">✅ Anti-Raid: <strong>ON</strong></div>
          <div style="margin-bottom: 8px;">✅ Anti-Nuke: <strong>ON</strong></div>
          <div style="margin-bottom: 8px;">✅ Auto-Mod: <strong>ON</strong></div>
          <div style="margin-bottom: 8px;">✅ Auto-Recovery: <strong>ON</strong></div>
        </div>
        <button class="btn" onclick="applyTemplate('maxsec')" style="width: 100%;">
          ⚡ Apply to Current Server
        </button>
      </div>

      <!-- Minimal Template -->
      <div class="setting-card" style="height: auto;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 4rem; margin-bottom: 10px;">⚪</div>
          <h2>Minimal Protection</h2>
          <p style="opacity: 0.8; margin-bottom: 20px;">Basic protection only</p>
        </div>
        <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 10px; margin-bottom: 20px;">
          <div style="margin-bottom: 8px;">✅ Anti-Nuke: <strong>ON</strong></div>
          <div style="margin-bottom: 8px;">❌ Anti-Raid: <strong>OFF</strong></div>
          <div style="margin-bottom: 8px;">❌ Auto-Mod: <strong>OFF</strong></div>
          <div style="margin-bottom: 8px;">❌ Auto-Recovery: <strong>OFF</strong></div>
        </div>
        <button class="btn" onclick="applyTemplate('minimal')" style="width: 100%;">
          ⚡ Apply to Current Server
        </button>
      </div>

      <!-- Custom Template (Save Current) -->
      <div class="setting-card" style="height: auto;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 4rem; margin-bottom: 10px;">💾</div>
          <h2>Save Current Config</h2>
          <p style="opacity: 0.8; margin-bottom: 20px;">Save this server's settings as a custom template</p>
        </div>
        <input type="text" id="template-name" placeholder="Template name..." style="width: 100%; padding: 12px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white; margin-bottom: 15px;">
        <button class="btn-secondary" onclick="saveTemplate()" style="width: 100%;">
          💾 Save as Template
        </button>
      </div>
    </div>

    <div id="template-result" style="margin-top: 30px; display: none; padding: 20px; background: rgba(0, 209, 178, 0.2); border-radius: 10px; border: 2px solid #00d1b2; text-align: center;">
      <div id="template-message"></div>
    </div>
  `;
}

const templates = {
  gaming: {
    anti_nuke_enabled: 1,
    anti_raid_enabled: 1,
    auto_mod_enabled: 1,
    auto_recovery_enabled: 1,
  },
  community: {
    anti_nuke_enabled: 1,
    anti_raid_enabled: 1,
    auto_mod_enabled: 1,
    auto_recovery_enabled: 0,
  },
  rp: {
    anti_nuke_enabled: 1,
    anti_raid_enabled: 0,
    auto_mod_enabled: 1,
    auto_recovery_enabled: 0,
  },
  maxsec: {
    anti_nuke_enabled: 1,
    anti_raid_enabled: 1,
    auto_mod_enabled: 1,
    auto_recovery_enabled: 1,
  },
  minimal: {
    anti_nuke_enabled: 1,
    anti_raid_enabled: 0,
    auto_mod_enabled: 0,
    auto_recovery_enabled: 0,
  },
};

async function applyTemplate(templateName) {
  if (!currentServer) {
    alert("Please select a server first!");
    return;
  }

  const template = templates[templateName];
  if (!template) return;

  if (
    !confirm(
      `Apply "${templateName}" template to current server? This will override current settings.`
    )
  ) {
    return;
  }

  try {
    const response = await fetch(`/api/server/${currentServer}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template),
    });

    if (response.ok) {
      const resultEl = document.getElementById("template-result");
      const messageEl = document.getElementById("template-message");
      resultEl.style.display = "block";
      messageEl.innerHTML = `
        <h3 style="color: #00d1b2; margin-bottom: 10px;">✅ Template Applied!</h3>
        <p>Configuration updated successfully. Refresh the page to see changes.</p>
      `;
      setTimeout(() => (resultEl.style.display = "none"), 5000);
    } else {
      alert("Failed to apply template");
    }
  } catch (error) {
    console.error("Template apply error:", error);
    alert("Failed to apply template");
  }
}

async function saveTemplate() {
  alert("Custom templates coming soon! For now, use the pre-made templates.");
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
    const serversWithBot = servers.filter((s) => s.hasBot);

    const listEl = document.getElementById("bulk-server-list");
    if (serversWithBot.length === 0) {
      listEl.innerHTML = '<p style="opacity: 0.7;">No servers available</p>';
      return;
    }

    listEl.innerHTML = serversWithBot
      .map(
        (server) => `
      <label style="display: flex; align-items: center; padding: 15px; background: rgba(255, 255, 255, 0.05); border-radius: 10px; margin-bottom: 10px; cursor: pointer; transition: all 0.3s;" 
             onmouseover="this.style.background='rgba(255, 255, 255, 0.1)'" 
             onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'">
        <input type="checkbox" class="server-checkbox" value="${server.id}" data-name="${server.name}" 
               style="margin-right: 15px; width: 20px; height: 20px; cursor: pointer;">
        <img src="${server.icon || "https://cdn.discordapp.com/embed/avatars/0.png"}" 
             alt="${server.name}" 
             style="width: 40px; height: 40px; border-radius: 50%; margin-right: 15px;">
        <div style="flex: 1;">
          <div style="font-weight: 700;">${server.name}</div>
          <div style="font-size: 0.85rem; opacity: 0.7;">${server.memberCount} members</div>
        </div>
      </label>
    `
      )
      .join("");
  } catch (error) {
    console.error("Failed to load servers for bulk:", error);
  }
}

function selectAllServers() {
  document
    .querySelectorAll(".server-checkbox")
    .forEach((cb) => (cb.checked = true));
}

function deselectAllServers() {
  document
    .querySelectorAll(".server-checkbox")
    .forEach((cb) => (cb.checked = false));
}

async function bulkToggle(setting, value) {
  const selectedServers = Array.from(
    document.querySelectorAll(".server-checkbox:checked")
  ).map((cb) => ({ id: cb.value, name: cb.dataset.name }));

  if (selectedServers.length === 0) {
    alert("Please select at least one server!");
    return;
  }

  const settingName = setting.replace(/_enabled/g, "").replace(/_/g, " ");
  if (
    !confirm(
      `${value ? "Enable" : "Disable"} ${settingName} on ${selectedServers.length} server(s)?`
    )
  ) {
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
        body: JSON.stringify({ [setting]: value ? 1 : 0 }),
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
    ${
      failed > 0
        ? `
      <p style="color: #ff4444; margin: 5px 0;">❌ Failed: <strong>${failed}</strong> servers</p>
      <details style="margin-top: 10px;">
        <summary style="cursor: pointer; opacity: 0.8;">Show failed servers</summary>
        <ul style="margin-top: 10px; opacity: 0.8;">
          ${failedServers.map((name) => `<li>${name}</li>`).join("")}
        </ul>
      </details>
    `
        : ""
    }
  `;

  setTimeout(() => {
    resultEl.style.display = "none";
  }, 10000);
}
// Anti-Nuke Settings Page
async function loadAntiNukePage() {
  if (!currentServer) {
    console.error("loadAntiNukePage called without currentServer set");
    return;
  }
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
  if (!currentServer) {
    console.error("loadAntiRaidPage called without currentServer set");
    return;
  }
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

    </div>
    
    <div style="margin-top:40px; padding-top:40px; border-top:2px solid #40444b;">
      <h3 style="margin-bottom:20px;">🛡️ Join Gate</h3>
      <p style="opacity:0.8; margin-bottom:20px;">Advanced verification system to filter new members before they can access your server.</p>
      <a href="#joingate" onclick="loadPage('joingate'); document.querySelector('.nav-item[data-page=\"joingate\"]')?.click();" 
         class="btn btn-primary" 
         style="display:inline-block; padding:12px 24px; background:linear-gradient(135deg, #b794f6 0%, #9333ea 100%); border:none; border-radius:8px; color:white; text-decoration:none; cursor:pointer;">
        Configure Join Gate →
      </a>
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
    <div style="display:flex; gap:20px; margin-bottom:30px;">
      <button class="tab-btn active" onclick="switchAutoModTab('nexus')" id="automod-tab-nexus">Nexus Auto-Mod</button>
      <button class="tab-btn" onclick="switchAutoModTab('discord')" id="automod-tab-discord">Discord AutoMod ⚡</button>
    </div>

    <div id="automod-nexus-content">
      <h2>Nexus Auto-Moderation</h2>
      <p style="opacity:0.8; margin-bottom:30px;">Advanced AI-powered content filtering and spam protection.</p>

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
        <strong>🤖 Nexus Auto-Mod Features:</strong><br>
        <ul style="margin-top:10px; margin-left:20px;">
          <li>AI-powered spam detection</li>
          <li>Link filtering and phishing protection</li>
          <li>Bad word filtering</li>
          <li>Mention spam protection</li>
          <li>Behavioral analysis and heat scores</li>
          <li>Advanced threat detection</li>
        </ul>
      </div>
    </div>

    <div id="automod-discord-content" style="display:none;">
      <h2>Discord AutoMod ⚡</h2>
      <p style="opacity:0.8; margin-bottom:20px;">Manage Discord's native AutoModeration rules directly from the dashboard.</p>
      
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <div>
          <p style="opacity:0.8;">Create, edit, and manage Discord AutoMod rules</p>
        </div>
        <button class="btn btn-primary" onclick="showCreateAutoModRuleModal()" style="padding:10px 20px;">
          + Create Rule
        </button>
      </div>

      <div id="discordAutoModRulesContainer">
        <div class="loading">Loading Discord AutoMod rules...</div>
      </div>
    </div>
  `;

  // Load Discord AutoMod rules
  loadDiscordAutoModRules();
}

function switchAutoModTab(tab) {
  // Update button states
  document
    .getElementById("automod-tab-nexus")
    .classList.toggle("active", tab === "nexus");
  document
    .getElementById("automod-tab-discord")
    .classList.toggle("active", tab === "discord");

  // Show/hide content
  document.getElementById("automod-nexus-content").style.display =
    tab === "nexus" ? "block" : "none";
  document.getElementById("automod-discord-content").style.display =
    tab === "discord" ? "block" : "none";

  if (tab === "discord") {
    loadDiscordAutoModRules();
  }
}

async function loadDiscordAutoModRules() {
  const container = document.getElementById("discordAutoModRulesContainer");
  if (!container) return;

  try {
    const response = await fetch(`/api/server/${currentServer}/automod`);
    if (!response.ok) {
      if (response.status === 403) {
        container.innerHTML = `
          <div class="info-box" style="background:#f59e0b20; border-color:#f59e0b;">
            <strong>⚠️ Discord AutoMod Unavailable</strong><br>
            <p style="margin-top:10px;">Your server needs to have Community features enabled and the bot needs "Manage Server" permission to use Discord AutoMod.</p>
          </div>
        `;
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const rules = await response.json();

    if (rules.length === 0) {
      container.innerHTML = `
        <div class="info-box">
          <strong>No Discord AutoMod rules yet</strong><br>
          <p style="margin-top:10px;">Click "Create Rule" above to add your first Discord AutoMod rule. Discord AutoMod rules work alongside Nexus's custom automod system.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="rules-grid">
        ${rules
          .map(
            (rule) => `
          <div class="rule-card" style="background:#2c2f33; border:1px solid #40444b; border-radius:12px; padding:20px; margin-bottom:15px;">
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:15px;">
              <div>
                <h3 style="margin:0 0 5px 0; color:#fff;">${rule.name}</h3>
                <span class="action-badge" style="background:${rule.enabled ? "#10b981" : "#6b7280"}; color:white;">
                  ${rule.enabled ? "✅ Enabled" : "❌ Disabled"}
                </span>
              </div>
              <div style="display:flex; gap:10px;">
                <button onclick="toggleDiscordAutoModRule('${rule.id}', ${!rule.enabled})" 
                        class="btn btn-small" 
                        style="padding:5px 15px; font-size:0.85rem;">
                  ${rule.enabled ? "Disable" : "Enable"}
                </button>
                <button onclick="editDiscordAutoModRule('${rule.id}')" 
                        class="btn btn-small" 
                        style="padding:5px 15px; font-size:0.85rem; background:#5865f2;">
                  Edit
                </button>
                <button onclick="deleteDiscordAutoModRule('${rule.id}')" 
                        class="btn btn-small" 
                        style="padding:5px 15px; font-size:0.85rem; background:#ef4444;">
                  Delete
                </button>
              </div>
            </div>
            
            <div style="margin-top:15px; padding-top:15px; border-top:1px solid #40444b;">
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.9em; opacity:0.8;">
                <div><strong>Trigger:</strong> ${getTriggerTypeLabel(rule.triggerType)}</div>
                <div><strong>Action:</strong> ${getActionTypeLabel(rule.actions[0]?.type)}</div>
              </div>
              ${
                rule.triggerMetadata?.keywordFilter?.length > 0
                  ? `
                <div style="margin-top:10px;">
                  <strong>Keywords:</strong> ${rule.triggerMetadata.keywordFilter.slice(0, 5).join(", ")}${rule.triggerMetadata.keywordFilter.length > 5 ? "..." : ""}
                </div>
              `
                  : ""
              }
              ${
                rule.exemptRoles?.length > 0 || rule.exemptChannels?.length > 0
                  ? `
                <div style="margin-top:10px; font-size:0.9em; opacity:0.8;">
                  ${rule.exemptRoles?.length > 0 ? `<div>Exempt Roles: ${rule.exemptRoles.length}</div>` : ""}
                  ${rule.exemptChannels?.length > 0 ? `<div>Exempt Channels: ${rule.exemptChannels.length}</div>` : ""}
                </div>
              `
                  : ""
              }
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  } catch (error) {
    console.error("Failed to load Discord AutoMod rules:", error);
    container.innerHTML = `
      <div class="info-box" style="background:#ef444420; border-color:#ef4444;">
        <strong>❌ Error loading rules</strong><br>
        <p style="margin-top:10px;">${error.message}</p>
      </div>
    `;
  }
}

function getTriggerTypeLabel(type) {
  const labels = {
    1: "Keyword",
    3: "Spam",
    4: "Keyword Preset",
    5: "Mention Spam",
  };
  return labels[type] || `Type ${type}`;
}

function getActionTypeLabel(type) {
  const labels = {
    1: "Block Message",
    2: "Send Alert",
    3: "Timeout",
  };
  return labels[type] || `Action ${type}`;
}

async function toggleDiscordAutoModRule(ruleId, enabled) {
  try {
    const response = await fetch(
      `/api/server/${currentServer}/automod/${ruleId}/toggle`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      }
    );

    if (response.ok) {
      loadDiscordAutoModRules();
    } else {
      alert("Failed to toggle rule");
    }
  } catch (error) {
    console.error("Failed to toggle rule:", error);
    alert("Error: " + error.message);
  }
}

async function deleteDiscordAutoModRule(ruleId) {
  if (!confirm("Are you sure you want to delete this AutoMod rule?")) return;

  try {
    const response = await fetch(
      `/api/server/${currentServer}/automod/${ruleId}`,
      {
        method: "DELETE",
      }
    );

    if (response.ok) {
      loadDiscordAutoModRules();
    } else {
      alert("Failed to delete rule");
    }
  } catch (error) {
    console.error("Failed to delete rule:", error);
    alert("Error: " + error.message);
  }
}

async function editDiscordAutoModRule(ruleId) {
  try {
    // Fetch current rule data
    const response = await fetch(`/api/server/${currentServer}/automod`);
    const data = await response.json();
    const rule = data.rules.find((r) => r.id === ruleId);

    if (!rule) {
      alert("❌ Rule not found");
      return;
    }

    // Create modal
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <h2>✏️ Edit AutoMod Rule</h2>
        <form id="editRuleForm" onsubmit="return false;">
          <div class="form-group">
            <label>Rule Type</label>
            <select id="editRuleType" class="form-control" required>
              <option value="spam" ${rule.rule_type === "spam" ? "selected" : ""}>Spam Detection</option>
              <option value="links" ${rule.rule_type === "links" ? "selected" : ""}>Link Blocking</option>
              <option value="invites" ${rule.rule_type === "invites" ? "selected" : ""}>Invite Blocking</option>
              <option value="mentions" ${rule.rule_type === "mentions" ? "selected" : ""}>Mass Mentions</option>
              <option value="caps" ${rule.rule_type === "caps" ? "selected" : ""}>Excessive Caps</option>
              <option value="profanity" ${rule.rule_type === "profanity" ? "selected" : ""}>Profanity Filter</option>
            </select>
          </div>
          <div class="form-group">
            <label>Trigger Pattern (regex or keywords, comma-separated)</label>
            <textarea id="editRuleTrigger" class="form-control" rows="3" required>${rule.trigger || ""}</textarea>
            <small style="opacity:0.7;">Example: discord.gg, bit.ly, .* (any text)</small>
          </div>
          <div class="form-group">
            <label>Action</label>
            <select id="editRuleAction" class="form-control" required>
              <option value="delete" ${rule.action === "delete" ? "selected" : ""}>Delete Message</option>
              <option value="warn" ${rule.action === "warn" ? "selected" : ""}>Warn User</option>
              <option value="timeout" ${rule.action === "timeout" ? "selected" : ""}>Timeout User (5m)</option>
              <option value="kick" ${rule.action === "kick" ? "selected" : ""}>Kick User</option>
              <option value="ban" ${rule.action === "ban" ? "selected" : ""}>Ban User</option>
            </select>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="editRuleEnabled" ${rule.enabled ? "checked" : ""}>
              Enabled
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button type="button" class="btn-primary" onclick="saveAutoModRuleEdit(${ruleId})">Save Changes</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  } catch (error) {
    alert(`❌ Error loading rule: ${error.message}`);
  }
}

async function saveAutoModRuleEdit(ruleId) {
  const ruleType = document.getElementById("editRuleType").value;
  const trigger = document.getElementById("editRuleTrigger").value;
  const action = document.getElementById("editRuleAction").value;
  const enabled = document.getElementById("editRuleEnabled").checked;

  try {
    const response = await fetch(`/api/dashboard/automod/${ruleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rule_type: ruleType,
        trigger,
        action,
        enabled: enabled ? 1 : 0,
      }),
    });

    if (!response.ok) throw new Error("Failed to update rule");

    document.querySelector(".modal-overlay").remove();
    loadAutoModPage();
    showNotification("✅ Rule updated successfully!");
  } catch (error) {
    alert(`❌ Error: ${error.message}`);
  }
}

function showCreateAutoModRuleModal() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <h2>➕ Create AutoMod Rule</h2>
      <form id="createRuleForm" onsubmit="return false;">
        <div class="form-group">
          <label>Rule Type</label>
          <select id="createRuleType" class="form-control" required>
            <option value="">Select a type...</option>
            <option value="spam">Spam Detection</option>
            <option value="links">Link Blocking</option>
            <option value="invites">Invite Blocking</option>
            <option value="mentions">Mass Mentions</option>
            <option value="caps">Excessive Caps</option>
            <option value="profanity">Profanity Filter</option>
          </select>
        </div>
        <div class="form-group">
          <label>Trigger Pattern (regex or keywords, comma-separated)</label>
          <textarea id="createRuleTrigger" class="form-control" rows="3" required placeholder="discord.gg, bit.ly, or .* for any"></textarea>
          <small style="opacity:0.7;">Use .* to match any text, or specific keywords/patterns</small>
        </div>
        <div class="form-group">
          <label>Action</label>
          <select id="createRuleAction" class="form-control" required>
            <option value="">Select an action...</option>
            <option value="delete">Delete Message</option>
            <option value="warn">Warn User</option>
            <option value="timeout">Timeout User (5m)</option>
            <option value="kick">Kick User</option>
            <option value="ban">Ban User</option>
          </select>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="createRuleEnabled" checked>
            Enabled
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button type="button" class="btn-primary" onclick="createAutoModRule()">Create Rule</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
}

async function createAutoModRule() {
  const ruleType = document.getElementById("createRuleType").value;
  const trigger = document.getElementById("createRuleTrigger").value;
  const action = document.getElementById("createRuleAction").value;
  const enabled = document.getElementById("createRuleEnabled").checked;

  if (!ruleType || !trigger || !action) {
    alert("❌ Please fill in all fields");
    return;
  }

  try {
    const response = await fetch(`/api/dashboard/automod`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guild_id: currentServer,
        rule_type: ruleType,
        trigger,
        action,
        enabled: enabled ? 1 : 0,
      }),
    });

    if (!response.ok) throw new Error("Failed to create rule");

    document.querySelector(".modal-overlay").remove();
    loadAutoModPage();
    showNotification("✅ Rule created successfully!");
  } catch (error) {
    alert(`❌ Error: ${error.message}`);
  }
}

function showNotification(message) {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; background: #4CAF50; color: white;
    padding: 15px 25px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000; animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// Join Gate Configuration Page
async function loadJoinGatePage() {
  const contentArea = document.getElementById("contentArea");

  try {
    const response = await fetch(`/api/server/${currentServer}/joingate`);
    const config = (await response.json()) || { enabled: false };

    contentArea.innerHTML = `
      <h2>Join Gate Configuration</h2>
      <p style="opacity:0.8; margin-bottom:30px;">Filter new members before they can access your server. Block bots, new accounts, and suspicious users.</p>

      <div class="settings-section">
        <div class="setting-row">
          <div class="setting-info">
            <h3>Enable Join Gate</h3>
            <p>Turn on join gate filtering for new members</p>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${config.enabled ? "checked" : ""} 
                   onchange="updateJoinGateConfig('enabled', this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Target Unauthorized Bots</h3>
            <p>Block bots added by members without permission</p>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${config.target_unauthorized_bots ? "checked" : ""} 
                   onchange="updateJoinGateConfig('target_unauthorized_bots', this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Target New Accounts</h3>
            <p>Block accounts created recently (set minimum age below)</p>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${config.target_new_accounts ? "checked" : ""} 
                   onchange="updateJoinGateConfig('target_new_accounts', this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Minimum Account Age (Days)</h3>
            <p>Minimum age in days for accounts (applies if "Target New Accounts" is enabled)</p>
          </div>
          <input type="number" class="setting-input" min="0" max="365" value="${config.min_account_age_days || 7}" 
                 onchange="updateJoinGateConfig('min_account_age_days', parseInt(this.value))">
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Target No Avatar</h3>
            <p>Block users without profile pictures</p>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${config.target_no_avatar ? "checked" : ""} 
                   onchange="updateJoinGateConfig('target_no_avatar', this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Target Unverified Bots</h3>
            <p>Block Discord bots that aren't verified by Discord</p>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${config.target_unverified_bots ? "checked" : ""} 
                   onchange="updateJoinGateConfig('target_unverified_bots', this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Target Invite Usernames</h3>
            <p>Block users with Discord invite links in their username/nickname</p>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${config.target_invite_usernames ? "checked" : ""} 
                   onchange="updateJoinGateConfig('target_invite_usernames', this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Target Suspicious Accounts</h3>
            <p>Use AI threat detection to identify suspicious accounts</p>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${config.target_suspicious ? "checked" : ""} 
                   onchange="updateJoinGateConfig('target_suspicious', this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Suspicious Threshold</h3>
            <p>Threat score threshold (0-100) for suspicious detection</p>
          </div>
          <input type="number" class="setting-input" min="0" max="100" value="${config.suspicious_threshold || 60}" 
                 onchange="updateJoinGateConfig('suspicious_threshold', parseInt(this.value))">
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Default Action</h3>
            <p>Action to take when a member is filtered</p>
          </div>
          <select class="setting-input" onchange="updateJoinGateConfig('action', this.value)">
            <option value="kick" ${config.action === "kick" ? "selected" : ""}>Kick</option>
            <option value="ban" ${config.action === "ban" ? "selected" : ""}>Ban</option>
            <option value="timeout" ${config.action === "timeout" ? "selected" : ""}>Timeout</option>
          </select>
        </div>
      </div>

      <div class="info-box" style="margin-top:30px;">
        <strong>🛡️ Join Gate Protection:</strong><br>
        <ul style="margin-top:10px; margin-left:20px;">
          <li>Blocks unauthorized bots before they can access your server</li>
          <li>Filters new accounts based on age requirements</li>
          <li>Removes users with invite links in usernames</li>
          <li>AI-powered suspicious account detection</li>
          <li>Works alongside Nexus verification system</li>
        </ul>
      </div>
    `;
  } catch (error) {
    console.error("Failed to load Join Gate config:", error);
    contentArea.innerHTML = `
      <h2>Join Gate Configuration</h2>
      <p style="color:#ff4444;">Failed to load configuration: ${error.message}</p>
    `;
  }
}

async function updateJoinGateConfig(key, value) {
  try {
    // Get current config
    const currentResponse = await fetch(
      `/api/server/${currentServer}/joingate`
    );
    const current = (await currentResponse.json()) || {};

    // Update specific key
    const updates = { [key]: value };

    // Save
    await fetch(`/api/server/${currentServer}/joingate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...current, ...updates }),
    });

    // Reload page to show updated config
    setTimeout(() => loadJoinGatePage(), 300);
  } catch (error) {
    console.error("Failed to update Join Gate config:", error);
    alert("Failed to update setting: " + error.message);
  }
}

// Verification Settings Page
async function loadVerificationPage() {
  const contentArea = document.getElementById("contentArea");

  try {
    const response = await fetch(`/api/server/${currentServer}`);
    const server = await response.json();
    const config = server.config || {};

    contentArea.innerHTML = `
      <h2>Verification System</h2>
      <p style="opacity:0.8; margin-bottom:30px;">Configure how new members verify their accounts using web verification, captcha, or instant verification.</p>

      <div class="settings-section">
        <div class="setting-row">
          <div class="setting-info">
            <h3>Enable Verification</h3>
            <p>Require new members to verify before accessing the server</p>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${config.verification_enabled ? "checked" : ""} 
                   onchange="updateConfig('verification_enabled', this.checked ? 1 : 0)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Verification Mode</h3>
            <p>Choose how members verify (Web = Turnstile, Captcha = Math/Text, Instant = Button click)</p>
          </div>
          <select class="setting-input" onchange="updateConfig('verification_mode', this.value)">
            <option value="instant" ${config.verification_mode === "instant" ? "selected" : ""}>Instant (Button Click)</option>
            <option value="captcha" ${config.verification_mode === "captcha" ? "selected" : ""}>Captcha (Math/Text)</option>
            <option value="web" ${config.verification_mode === "web" ? "selected" : ""}>Web (Cloudflare Turnstile) ⚡</option>
          </select>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Verification Target</h3>
            <p>Who needs to verify (Everyone or Suspicious accounts only)</p>
          </div>
          <select class="setting-input" onchange="updateConfig('verification_target', this.value)">
            <option value="everyone" ${config.verification_target === "everyone" ? "selected" : ""}>Everyone</option>
            <option value="suspicious" ${config.verification_target === "suspicious" ? "selected" : ""}>Suspicious Accounts Only</option>
          </select>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Verification Role</h3>
            <p>Role to give after successful verification (leave empty for no role)</p>
          </div>
          <input type="text" class="setting-input" placeholder="Role ID" value="${
            config.verification_role || ""
          }" onchange="updateConfig('verification_role', this.value)">
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Verification Channel</h3>
            <p>Channel where verification messages are sent (leave empty for DM)</p>
          </div>
          <input type="text" class="setting-input" placeholder="Channel ID" value="${
            config.verification_channel || ""
          }" onchange="updateConfig('verification_channel', this.value)">
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <h3>Custom Verification Message</h3>
            <p>Custom message to show in verification embed (leave empty for default)</p>
          </div>
          <textarea class="setting-input" placeholder="Custom message..." rows="3" onchange="updateConfig('verification_message', this.value)">${
            config.verification_message || ""
          }</textarea>
        </div>
      </div>

      <div class="info-box" style="margin-top:30px;">
        <strong>🌐 Web Verification (Turnstile):</strong><br>
        <ul style="margin-top:10px; margin-left:20px;">
          <li>Most secure option - Cloudflare Turnstile bot protection</li>
          <li>Better user experience than traditional captchas</li>
          <li>Automatically detects bots and suspicious activity</li>
          <li>Requires Turnstile Site Key and Secret Key in environment variables</li>
          <li>Set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY to enable</li>
        </ul>
      </div>

      <div class="info-box" style="margin-top:20px; background:#fff3cd20; border-color:#ffc107;">
        <strong>⚙️ Configuration:</strong><br>
        <p style="margin-top:10px;">For web verification to work, add these to your environment variables:</p>
        <ul style="margin-top:10px; margin-left:20px;">
          <li><code>TURNSTILE_SITE_KEY</code> - Your Cloudflare Turnstile site key</li>
          <li><code>TURNSTILE_SECRET_KEY</code> - Your Cloudflare Turnstile secret key</li>
          <li><code>DASHBOARD_URL</code> - Your dashboard URL (e.g., https://yourdomain.com)</li>
        </ul>
        <p style="margin-top:10px;">Get Turnstile keys from: <a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" style="color:#667eea;">Cloudflare Dashboard</a></p>
      </div>
    `;
  } catch (error) {
    console.error("Failed to load verification config:", error);
    contentArea.innerHTML = `
      <h2>Verification System</h2>
      <p style="color:#ff4444;">Failed to load configuration: ${error.message}</p>
    `;
  }
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

// Load moderation logs page with charts and filters
async function loadModLogs() {
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <h2>⚖️ Moderation Logs</h2>
    <p style="opacity:0.8; margin-bottom:20px;">Advanced log viewing with charts and filters</p>

    <!-- Chart -->
    <div style="background: rgba(255, 255, 255, 0.05); padding: 25px; border-radius: 12px; margin-bottom: 25px;">
      <h3 style="margin-bottom: 15px;">📊 Activity Chart (Last 7 Days)</h3>
      <div style="height: 250px;">
        <canvas id="modLogsChart"></canvas>
      </div>
    </div>

    <!-- Filters -->
    <div style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 12px; margin-bottom: 25px;">
      <h3 style="margin-bottom: 15px;">🔍 Filters</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 12px;">
        <select id="filter-action" onchange="filterModLogs()" style="padding: 10px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white;">
          <option value="">All Actions</option>
          <option value="ban">Bans</option>
          <option value="kick">Kicks</option>
          <option value="warn">Warns</option>
          <option value="mute">Mutes</option>
        </select>
        <input type="text" id="filter-mod" placeholder="Filter by moderator..." onkeyup="filterModLogs()" style="padding: 10px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white;">
        <input type="text" id="filter-user" placeholder="Filter by user..." onkeyup="filterModLogs()" style="padding: 10px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white;">
        <input type="date" id="filter-date" onchange="filterModLogs()" style="padding: 10px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white;">
      </div>
      <div>
        <button class="btn-secondary" onclick="clearModFilters()">Clear Filters</button>
        <button class="btn" onclick="exportModLogs()" style="margin-left: 10px;">📥 Export CSV</button>
        <span id="filter-count" style="margin-left: 15px; opacity: 0.8;"></span>
      </div>
    </div>

    <div id="modLogsContainer">
      <div class="loading">Loading logs...</div>
    </div>
  `;

  try {
    const response = await fetch(
      `/api/server/${currentServer}/modlogs?limit=100`
    );
    window.allModLogs = await response.json();

    if (window.allModLogs.length === 0) {
      document.getElementById("modLogsContainer").innerHTML =
        '<p style="opacity:0.7;">No logs yet.</p>';
      return;
    }

    createModChart(window.allModLogs);
    displayFilteredModLogs(window.allModLogs);
  } catch (error) {
    console.error("Failed to load mod logs:", error);
  }
}

function createModChart(logs) {
  const ctx = document.getElementById("modLogsChart");
  if (!ctx) return;

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    last7Days.push(date.getTime());
  }

  const counts = last7Days.map((day) => {
    const dayEnd = day + 86400000;
    return logs.filter((l) => l.timestamp >= day && l.timestamp < dayEnd)
      .length;
  });

  const labels = last7Days.map((d) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  );

  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Actions",
          data: counts,
          borderColor: "#667eea",
          backgroundColor: "rgba(102, 126, 234, 0.2)",
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#fff" } } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: "#fff" },
          grid: { color: "rgba(255,255,255,0.1)" },
        },
        x: {
          ticks: { color: "#fff" },
          grid: { color: "rgba(255,255,255,0.1)" },
        },
      },
    },
  });
}

function displayFilteredModLogs(logs) {
  const container = document.getElementById("modLogsContainer");
  document.getElementById("filter-count").textContent =
    `Showing ${logs.length} log(s)`;

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
          <div><span class="action-badge action-${log.action}">${log.action.toUpperCase()}</span></div>
          <div><code>${log.user_id}</code></div>
          <div><code>${log.moderator_id}</code></div>
          <div>${log.reason || "None"}</div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function filterModLogs() {
  if (!window.allModLogs) return;

  const action = document.getElementById("filter-action").value;
  const mod = document.getElementById("filter-mod").value.toLowerCase();
  const user = document.getElementById("filter-user").value.toLowerCase();
  const date = document.getElementById("filter-date").value;

  const filtered = window.allModLogs.filter((log) => {
    if (action && log.action !== action) return false;
    if (mod && !log.moderator_id.toLowerCase().includes(mod)) return false;
    if (user && !log.user_id.toLowerCase().includes(user)) return false;
    if (date) {
      const logDate = new Date(log.timestamp).toISOString().split("T")[0];
      if (logDate !== date) return false;
    }
    return true;
  });

  displayFilteredModLogs(filtered);
}

function clearModFilters() {
  document.getElementById("filter-action").value = "";
  document.getElementById("filter-mod").value = "";
  document.getElementById("filter-user").value = "";
  document.getElementById("filter-date").value = "";
  if (window.allModLogs) displayFilteredModLogs(window.allModLogs);
}

function exportModLogs() {
  if (!window.allModLogs) return;

  const filtered = window.allModLogs; // Or get currently filtered logs
  const csv = [
    "Timestamp,Action,User ID,Moderator ID,Reason",
    ...filtered.map(
      (l) =>
        `"${new Date(l.timestamp).toISOString()}","${l.action}","${l.user_id}","${l.moderator_id}","${l.reason || "None"}"`
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `modlogs-${currentServer}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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

// Load message logs page (deletes, edits, pins, unpins, purges)
async function loadMessageLogsPage() {
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <h2>Message Logs</h2>
    <p style="opacity:0.8; margin-bottom:20px;">Track message deletions, edits, pins, unpins, and purges.</p>

    <div class="filter-section" style="margin-bottom:20px;">
      <div style="display:flex; gap:15px; flex-wrap:wrap;">
        <select id="messageLogTypeFilter" class="filter-select" onchange="filterMessageLogs()">
          <option value="">All Types</option>
          <option value="message_delete">Deletions</option>
          <option value="message_update">Edits</option>
          <option value="message_pin">Pins</option>
          <option value="message_unpin">Unpins</option>
          <option value="message_purge">Purges</option>
        </select>
        <input type="text" id="messageLogSearch" class="filter-input" placeholder="Search by user ID or channel..." oninput="filterMessageLogs()">
        <button onclick="clearMessageFilters()" class="filter-btn">Clear</button>
        <button onclick="exportMessageLogs()" class="filter-btn">Export CSV</button>
      </div>
      <div style="margin-top:10px; opacity:0.8;">
        <span id="messageLogCount">Loading...</span>
      </div>
    </div>

    <div id="messageLogsContainer">
      <div class="loading">Loading message logs...</div>
    </div>
  `;

  try {
    const response = await fetch(
      `/api/server/${currentServer}/message-logs?limit=200`
    );
    const logs = await response.json();

    window.allMessageLogs = logs;
    filterMessageLogs();
  } catch (error) {
    console.error("Failed to load message logs:", error);
    document.getElementById("messageLogsContainer").innerHTML =
      '<p style="color:#ff4444;">Failed to load message logs</p>';
  }
}

function filterMessageLogs() {
  if (!window.allMessageLogs) return;

  const type = document.getElementById("messageLogTypeFilter")?.value || "";
  const search = (
    document.getElementById("messageLogSearch")?.value || ""
  ).toLowerCase();

  let filtered = window.allMessageLogs;

  if (type) {
    filtered = filtered.filter((log) => log.log_type === type);
  }

  if (search) {
    filtered = filtered.filter((log) => {
      const meta = log.metadata || {};
      return (
        log.user_id?.toLowerCase().includes(search) ||
        log.moderator_id?.toLowerCase().includes(search) ||
        meta.channelId?.includes(search) ||
        meta.channelName?.toLowerCase().includes(search) ||
        meta.authorTag?.toLowerCase().includes(search) ||
        log.details?.toLowerCase().includes(search)
      );
    });
  }

  displayMessageLogs(filtered);
}

function displayMessageLogs(logs) {
  const container = document.getElementById("messageLogsContainer");
  const countEl = document.getElementById("messageLogCount");

  if (countEl) {
    countEl.textContent = `Showing ${logs.length} log(s)`;
  }

  if (logs.length === 0) {
    container.innerHTML = '<p style="opacity:0.7;">No message logs found.</p>';
    return;
  }

  const typeIcons = {
    message_delete: "🗑️",
    message_update: "✏️",
    message_pin: "📌",
    message_unpin: "📌",
    message_purge: "🧹",
  };

  const typeLabels = {
    message_delete: "Deleted",
    message_update: "Edited",
    message_pin: "Pinned",
    message_unpin: "Unpinned",
    message_purge: "Purged",
  };

  container.innerHTML = `
    <div class="logs-table">
      <div class="logs-header">
        <div>Date</div>
        <div>Type</div>
        <div>Channel</div>
        <div>Author</div>
        <div>Moderator</div>
        <div>Content Preview</div>
      </div>
      ${logs
        .map((log) => {
          const meta = log.metadata || {};
          const typeIcon = typeIcons[log.log_type] || "💬";
          const typeLabel = typeLabels[log.log_type] || log.log_type;

          let contentPreview = "";
          if (log.log_type === "message_update") {
            contentPreview = meta.oldContent
              ? `<strong>Old:</strong> ${meta.oldContent.substring(0, 50)}...<br><strong>New:</strong> ${meta.newContent?.substring(0, 50) || ""}...`
              : meta.newContent?.substring(0, 100) || "";
          } else if (log.log_type === "message_purge") {
            contentPreview = `Purged ${meta.amount || 0} message(s)`;
          } else {
            contentPreview =
              meta.content?.substring(0, 100) ||
              meta.oldContent?.substring(0, 100) ||
              "N/A";
          }

          return `
          <div class="log-row">
            <div>${new Date(log.timestamp).toLocaleString()}</div>
            <div><span class="action-badge action-${log.log_type}">${typeIcon} ${typeLabel}</span></div>
            <div>#${meta.channelName || "unknown"} <code style="font-size:0.8em; opacity:0.7;">${meta.channelId || ""}</code></div>
            <div><code>${meta.authorTag || log.user_id || "N/A"}</code></div>
            <div><code>${log.moderator_id ? `<@${log.moderator_id}>` : "System"}</code></div>
            <div style="max-width:300px; overflow:hidden; text-overflow:ellipsis;">${contentPreview}</div>
          </div>
        `;
        })
        .join("")}
    </div>
  `;
}

function clearMessageFilters() {
  if (document.getElementById("messageLogTypeFilter")) {
    document.getElementById("messageLogTypeFilter").value = "";
  }
  if (document.getElementById("messageLogSearch")) {
    document.getElementById("messageLogSearch").value = "";
  }
  if (window.allMessageLogs) {
    filterMessageLogs();
  }
}

function exportMessageLogs() {
  if (!window.allMessageLogs) return;

  const filtered = window.allMessageLogs;
  const csv = [
    "Timestamp,Type,Channel,Author,Moderator,Content",
    ...filtered.map((log) => {
      const meta = log.metadata || {};
      const content = meta.content || meta.oldContent || meta.newContent || "";
      return `"${new Date(log.timestamp).toISOString()}","${log.log_type}","${meta.channelName || ""}","${meta.authorTag || log.user_id || ""}","${log.moderator_id || "System"}","${content.replace(/"/g, '""')}"`;
    }),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `message-logs-${currentServer}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
      case "message-logs":
        loadMessageLogsPage();
        break;
      case "security":
        loadSecurityLogs();
        break;
    }
  }, 30000); // 30 seconds
}

// ========== ADVANCED ANALYTICS PAGE ==========
async function loadAdvancedAnalytics() {
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <h2>📊 Advanced Analytics</h2>
    <div class="analytics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px;">
      <div class="stat-card">
        <h3>🔮 Raid Prediction</h3>
        <div id="raidPrediction">Loading...</div>
      </div>
      <div class="stat-card">
        <h3>📈 Growth Forecast</h3>
        <div id="growthForecast">Loading...</div>
      </div>
      <div class="stat-card">
        <h3>🎯 Security Score</h3>
        <div id="securityScore">Loading...</div>
      </div>
    </div>
    <div style="margin-top: 30px;">
      <canvas id="threatHeatmap"></canvas>
    </div>
  `;

  // Fetch analytics data
  try {
    const response = await fetch(
      `/api/analytics/advanced?guild=${currentServer}`
    );
    const data = await response.json();

    document.getElementById("raidPrediction").innerHTML = `
      <div style="font-size: 2rem; font-weight: bold; color: ${data.raidLikelihood > 70 ? "#f44336" : "#4CAF50"};">
        ${data.raidLikelihood}%
      </div>
      <p>Likelihood in next 48h</p>
    `;

    document.getElementById("growthForecast").innerHTML = `
      <div style="font-size: 2rem; font-weight: bold; color: #2196F3;">
        +${data.forecastedGrowth}
      </div>
      <p>Expected members (30 days)</p>
    `;

    document.getElementById("securityScore").innerHTML = `
      <div style="font-size: 2rem; font-weight: bold; color: #9333EA;">
        ${data.securityScore}/100
      </div>
      <p>${data.badge}</p>
    `;
  } catch (error) {
    contentArea.innerHTML += `<p style="color: var(--danger);">❌ Failed to load analytics</p>`;
  }
}

// ========== LEADERBOARD PAGE ==========
async function loadLeaderboard() {
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <h2>🏆 Global Security Leaderboard</h2>
    <p style="opacity: 0.8; margin-bottom: 20px;">Top servers by security score (anonymized)</p>
    
    <div class="leaderboard-container" id="leaderboardContainer">
      <div style="text-align: center; padding: 40px;">
        <div class="spinner"></div>
        <p>Loading leaderboard...</p>
      </div>
    </div>
  `;

  try {
    const response = await fetch(`/api/leaderboard/global`);
    const data = await response.json();

    let html = '<div class="leaderboard-list">';
    data.leaderboard.forEach((entry, index) => {
      const medal =
        index === 0
          ? "🥇"
          : index === 1
            ? "🥈"
            : index === 2
              ? "🥉"
              : `#${index + 1}`;
      html += `
        <div class="leaderboard-entry" style="
          display: flex; justify-content: space-between; align-items: center;
          padding: 15px; margin-bottom: 10px; background: var(--bg-card);
          border-radius: 8px; border-left: 4px solid ${index < 3 ? "#FFD700" : "var(--border-color)"};
        ">
          <div>
            <span style="font-size: 1.5rem; margin-right: 15px;">${medal}</span>
            <span>${entry.badge} ${entry.serverSize}</span>
          </div>
          <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent-primary);">
            ${entry.score}
          </div>
        </div>
      `;
    });
    html += "</div>";

    // Show current server's rank if available
    if (data.yourRank) {
      html += `
        <div style="margin-top: 30px; padding: 20px; background: var(--accent-primary); border-radius: 12px;">
          <h3>Your Server's Rank</h3>
          <div style="font-size: 2rem; font-weight: bold;">
            #${data.yourRank.rank} of ${data.yourRank.total}
          </div>
          <p>Top ${data.yourRank.percentile}%</p>
        </div>
      `;
    }

    document.getElementById("leaderboardContainer").innerHTML = html;
  } catch (error) {
    document.getElementById("leaderboardContainer").innerHTML =
      `<p style="color: var(--danger);">❌ Failed to load leaderboard</p>`;
  }
}

// ========== SERVER COMPARISON PAGE ==========
async function loadServerComparison() {
  const contentArea = document.getElementById("contentArea");

  // Safety check - prevent API calls with undefined guild ID
  if (!currentServer) {
    contentArea.innerHTML = `
      <div style="text-align: center; padding: 60px;">
        <h2>⚠️ No Server Selected</h2>
        <p style="opacity: 0.7; margin: 20px 0;">Please select a server first to view comparison data.</p>
        <button onclick="window.location.href='/dashboard'" style="padding: 12px 24px; background: var(--accent-primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem;">
          Select Server
        </button>
      </div>
    `;
    return;
  }

  contentArea.innerHTML = `
    <h2>📊 Server Comparison</h2>
    <p style="opacity: 0.8; margin-bottom: 20px;">See how your security compares to other servers</p>

    <div id="comparisonData">
      <div style="text-align: center; padding: 40px;">
        <div class="spinner"></div>
        <p>Analyzing your server...</p>
      </div>
    </div>
  `;

  try {
    const response = await fetch(`/api/comparison?guild=${currentServer}`);
    const data = await response.json();

    document.getElementById("comparisonData").innerHTML = `
      <div class="comparison-header" style="text-align: center; padding: 40px; background: var(--bg-card); border-radius: 12px; margin-bottom: 30px;">
        <div style="font-size: 4rem; margin-bottom: 10px;">${data.badge.emoji}</div>
        <h2>${data.badge.name}</h2>
        <div style="font-size: 3rem; font-weight: bold; color: var(--accent-primary); margin: 20px 0;">
          ${data.score}/100
        </div>
        <p style="font-size: 1.2rem;">
          Better than ${data.percentile}% of servers
        </p>
      </div>

      <h3 style="margin-bottom: 20px;">📈 Score Breakdown</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px;">
        ${Object.entries(data.breakdown)
          .map(
            ([key, value]) => `
          <div style="padding: 15px; background: var(--bg-card); border-radius: 8px;">
            <div style="font-size: 1.5rem; font-weight: bold;">${value}</div>
            <p style="opacity: 0.8;">${this.formatKey(key)}</p>
          </div>
        `
          )
          .join("")}
      </div>

      <h3 style="margin-bottom: 20px;">💡 Recommendations</h3>
      ${data.recommendations
        .map(
          (rec) => `
        <div style="padding: 15px; margin-bottom: 10px; background: var(--bg-card); border-radius: 8px; border-left: 4px solid ${rec.priority === "high" ? "var(--danger)" : "var(--info)"};">
          <strong>${rec.title}</strong>
          <p style="opacity: 0.8; margin-top: 5px;">${rec.description}</p>
          <span style="color: var(--success);">${rec.impact}</span>
        </div>
      `
        )
        .join("")}
    `;
  } catch (error) {
    document.getElementById("comparisonData").innerHTML =
      `<p style="color: var(--danger);">❌ Failed to load comparison data</p>`;
  }
}

// ========== WICK MIGRATION TOOL PAGE ==========
async function loadMigrationTool() {
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <h2>🔄 Migrate from Wick</h2>
    <p style="opacity: 0.8; margin-bottom: 20px;">Automatically import your Wick settings and upgrade to Nexus</p>
    
    <div id="migrationStatus">
      <div style="text-align: center; padding: 40px;">
        <div class="spinner"></div>
        <p>Checking for Wick...</p>
      </div>
    </div>
  `;

  try {
    const response = await fetch(
      `/api/migration/analyze?guild=${currentServer}`
    );
    const data = await response.json();

    if (data.hasWick) {
      document.getElementById("migrationStatus").innerHTML = `
        <div style="padding: 30px; background: var(--bg-card); border-radius: 12px; margin-bottom: 20px;">
          <h3>✅ Wick Detected!</h3>
          <p style="margin: 15px 0;">We found Wick in your server. Ready to upgrade?</p>
          
          <h4 style="margin-top: 20px;">🔍 What We Found:</h4>
          <ul style="margin: 10px 0 20px 20px;">
            ${data.detectedSettings.logChannels ? `<li>${data.detectedSettings.logChannels.length} log channel(s)</li>` : ""}
            ${data.detectedSettings.quarantineRoles ? `<li>${data.detectedSettings.quarantineRoles.length} quarantine role(s)</li>` : ""}
          </ul>

          <button onclick="startMigration()" class="btn-primary" style="width: 100%; padding: 15px; margin-top: 20px;">
            🚀 Start Migration
          </button>
        </div>

        <h3>📊 Why Switch to Nexus?</h3>
        <div style="margin-top: 15px;">
          ${data.comparison
            .map(
              (item) => `
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 15px; margin-bottom: 10px; background: var(--bg-card); border-radius: 8px;">
              <div><strong>${item.feature}</strong></div>
              <div style="opacity: 0.7;">Wick: ${item.wick}</div>
              <div style="color: var(--success);">Nexus: ${item.nexus}</div>
            </div>
          `
            )
            .join("")}
        </div>
      `;
    } else {
      document.getElementById("migrationStatus").innerHTML = `
        <div style="text-align: center; padding: 60px; background: var(--bg-card); border-radius: 12px;">
          <div style="font-size: 3rem; margin-bottom: 20px;">ℹ️</div>
          <h3>Wick Not Detected</h3>
          <p style="opacity: 0.8; margin-top: 10px;">
            Wick bot is not in this server. You're already using the best protection!
          </p>
        </div>
      `;
    }
  } catch (error) {
    document.getElementById("migrationStatus").innerHTML =
      `<p style="color: var(--danger);">❌ Failed to check for Wick</p>`;
  }
}

window.startMigration = async function () {
  if (
    !confirm(
      "Start migration from Wick to Nexus? This will import settings and enable advanced features."
    )
  )
    return;

  try {
    const response = await fetch(`/api/migration/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guild_id: currentServer }),
    });

    const result = await response.json();

    if (result.success) {
      alert(
        `✅ Migration complete!\n\n${result.migratedSettings.join("\n")}\n\n${result.improvements.join("\n")}`
      );
      loadMigrationTool();
    } else {
      alert(`❌ Migration failed: ${result.errors.join(", ")}`);
    }
  } catch (error) {
    alert(`❌ Migration error: ${error.message}`);
  }
};

window.formatKey = function (key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase());
};

// Navigation
document.addEventListener("DOMContentLoaded", () => {
  // Theme Toggle System
  const themeToggle = document.getElementById("themeToggle");
  const themeIcon = document.getElementById("themeIcon");
  const savedTheme = localStorage.getItem("theme") || "dark";

  // Apply saved theme
  document.documentElement.setAttribute("data-theme", savedTheme);
  themeIcon.textContent = savedTheme === "dark" ? "🌙" : "☀️";

  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    themeIcon.textContent = newTheme === "dark" ? "🌙" : "☀️";
  });

  // Keyboard Shortcuts System
  document.addEventListener("keydown", (e) => {
    // Ctrl+K or Cmd+K: Command Palette (Quick Navigation)
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      showCommandPalette();
      return;
    }

    // Ctrl+T or Cmd+T: Toggle Theme
    if ((e.ctrlKey || e.metaKey) && e.key === "t") {
      e.preventDefault();
      themeToggle.click();
      return;
    }

    // Ctrl+H or Cmd+H: Go Home
    if ((e.ctrlKey || e.metaKey) && e.key === "h") {
      e.preventDefault();
      window.location.href = "/dashboard";
      return;
    }

    // Escape: Close modals
    if (e.key === "Escape") {
      const modal = document.querySelector(".modal-overlay");
      if (modal) modal.remove();
      const palette = document.getElementById("commandPalette");
      if (palette) palette.remove();
      return;
    }

    // Number keys 1-9: Navigate to pages
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      if (e.key >= "1" && e.key <= "9") {
        const index = parseInt(e.key) - 1;
        const navItems = document.querySelectorAll(".nav-item");
        if (navItems[index]) {
          navItems[index].click();
        }
      }
    }
  });

  // Command Palette Function
  function showCommandPalette() {
    // Remove existing palette if any
    const existing = document.getElementById("commandPalette");
    if (existing) existing.remove();

    const commands = [
      { name: "Overview", page: "overview", icon: "📊", key: "1" },
      { name: "Anti-Nuke", page: "anti-nuke", icon: "🛡️", key: "2" },
      { name: "Anti-Raid", page: "anti-raid", icon: "⚔️", key: "3" },
      { name: "Join Gate", page: "joingate", icon: "🛡️", key: "4" },
      { name: "Verification", page: "verification", icon: "✅", key: "5" },
      { name: "Auto-Mod", page: "auto-mod", icon: "🤖", key: "6" },
      { name: "Mod Logs", page: "modlogs", icon: "⚖️", key: "7" },
      { name: "Message Logs", page: "message-logs", icon: "💬", key: "8" },
      { name: "Security Logs", page: "security", icon: "🔒", key: "9" },
      {
        name: "Toggle Theme",
        action: () => themeToggle.click(),
        icon: "🎨",
        key: "T",
      },
      {
        name: "Go Home",
        action: () => (window.location.href = "/dashboard"),
        icon: "🏠",
        key: "H",
      },
    ];

    const palette = document.createElement("div");
    palette.id = "commandPalette";
    palette.style.cssText = `
      position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
      background: var(--bg-card); border: 1px solid var(--border-color);
      border-radius: 12px; padding: 20px; width: 90%; max-width: 600px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5); z-index: 10000;
      backdrop-filter: blur(20px);
    `;

    let html = `
      <h3 style="margin-bottom: 15px; color: var(--text-primary);">⚡ Command Palette</h3>
      <input type="text" id="paletteSearch" placeholder="Search commands..." style="
        width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);
        background: var(--bg-primary); color: var(--text-primary); margin-bottom: 15px;
        font-size: 16px;
      ">
      <div id="commandList" style="max-height: 400px; overflow-y: auto;">
    `;

    commands.forEach((cmd, i) => {
      html += `
        <div class="command-item" data-page="${cmd.page}" data-action="${i}" style="
          padding: 12px; border-radius: 8px; margin-bottom: 8px; cursor: pointer;
          display: flex; justify-content: space-between; align-items: center;
          background: var(--bg-primary); transition: all 0.2s ease;
        ">
          <span style="color: var(--text-primary);">${cmd.icon} ${cmd.name}</span>
          <kbd style="background: var(--bg-card); padding: 4px 8px; border-radius: 4px; 
                      font-size: 12px; color: var(--text-secondary);">${cmd.key}</kbd>
        </div>
      `;
    });

    html += `</div>`;
    palette.innerHTML = html;
    document.body.appendChild(palette);

    // Focus search input
    const searchInput = document.getElementById("paletteSearch");
    searchInput.focus();

    // Search functionality
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      const items = document.querySelectorAll(".command-item");
      items.forEach((item) => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query) ? "flex" : "none";
      });
    });

    // Click handlers
    document.querySelectorAll(".command-item").forEach((item, i) => {
      item.addEventListener("click", () => {
        const cmd = commands[i];
        if (cmd.page) {
          const navItem = document.querySelector(`[data-page="${cmd.page}"]`);
          if (navItem) navItem.click();
        } else if (cmd.action) {
          cmd.action();
        }
        palette.remove();
      });

      item.addEventListener("mouseenter", () => {
        item.style.background = "var(--accent-secondary)";
        item.style.transform = "translateX(5px)";
      });

      item.addEventListener("mouseleave", () => {
        item.style.background = "var(--bg-primary)";
        item.style.transform = "translateX(0)";
      });
    });
  }

  // Check if URL contains guild ID (e.g., /123456789/dashboard)
  const pathParts = window.location.pathname.split("/").filter((p) => p);
  const urlGuildId =
    pathParts.length > 0 && pathParts[0].match(/^\d+$/) ? pathParts[0] : null;

  if (urlGuildId) {
    // URL has guild ID - load that server directly
    currentServer = urlGuildId;

    // Show sidebar since we have a server selected (explicitly set to flex)
    const sidebar = document.querySelector(".sidebar");
    sidebar.style.display = "flex";

    loadUser();

    // Always load server data first to populate sidebar
    loadServerData(urlGuildId).then(() => {
      // Ensure sidebar stays visible (something might be hiding it)
      const sidebar = document.querySelector(".sidebar");
      sidebar.style.display = "flex";

      // Check if there's a hash in URL (e.g., /{guildId}/dashboard#anti-nuke)
      const hash = window.location.hash.replace("#", "");
      if (hash && hash !== "overview") {
        // Load specific page from hash
        currentPage = hash;
        document
          .querySelectorAll(".nav-item")
          .forEach((i) => i.classList.remove("active"));
        const navItem = document.querySelector(`[data-page="${hash}"]`);
        if (navItem) {
          navItem.classList.add("active");
          document.getElementById("currentPage").textContent =
            navItem.querySelector("span:last-child").textContent;
          loadPage(hash);
        }
      }
      // If no hash or hash is "overview", loadServerData already loaded the overview
    });

    startAutoRefresh();
  } else {
    // No guild ID in URL - show server selection
    loadUser();
    loadServers();
    startAutoRefresh();
  }

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

  // Workflows Management
  window.loadWorkflows = async function () {
    if (!currentServer) {
      console.error("loadWorkflows called without currentServer set");
      return;
    }
    const contentArea = document.getElementById("contentArea");

    contentArea.innerHTML = `
      <div class="content-header">
        <h1>⚙️ Automation Workflows</h1>
        <p>Create custom automation with triggers and actions</p>
      </div>

      <div id="workflowsList" style="margin-top: 30px;">
        <div class="loading">Loading workflows...</div>
      </div>
    `;

    try {
      const response = await fetch(
        `/api/dashboard/workflows?guild=${currentServer}`
      );

      // Auto-redirect on auth errors
      if (
        !response.ok &&
        (response.status === 401 || response.status === 403)
      ) {
        console.log("Unauthorized access, redirecting to login...");
        window.location.href = "/";
        return;
      }

      const data = await response.json();

      const workflowsList = document.getElementById("workflowsList");

      if (data.workflows && data.workflows.length > 0) {
        workflowsList.innerHTML =
          `
          <button class="btn" onclick="showCreateWorkflowModal()" style="margin-bottom: 20px;">
            ➕ Create New Workflow
          </button>
        ` +
          data.workflows
            .map(
              (w) => `
          <div class="setting-card" style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
              <div>
                <h3>${w.name}</h3>
                <p style="opacity: 0.7; margin: 5px 0;">${w.description || "No description"}</p>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" ${w.enabled ? "checked" : ""} onchange="toggleWorkflow(${w.id}, this.checked)">
                <span class="toggle-slider"></span>
              </label>
            </div>
            
            <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <div style="margin-bottom: 10px;">
                <strong>Trigger:</strong> ${w.trigger_type || "Not configured"}
              </div>
              <div>
                <strong>Actions:</strong> ${w.action_type || "Not configured"}
              </div>
            </div>
            
            <div style="display: flex; gap: 10px;">
              <button class="btn btn-secondary" onclick="editWorkflow(${w.id})" style="flex: 1;">
                ✏️ Edit
              </button>
              <button class="btn btn-danger" onclick="deleteWorkflow(${w.id})" style="flex: 1;">
                🗑️ Delete
              </button>
            </div>
            
            <div style="margin-top: 10px; opacity: 0.6; font-size: 0.9rem;">
              Triggered: ${w.trigger_count || 0} times
            </div>
          </div>
        `
            )
            .join("");
      } else {
        workflowsList.innerHTML = `
          <div class="setting-card" style="text-align: center; padding: 40px;">
            <div style="font-size: 3rem; margin-bottom: 15px;">⚙️</div>
            <h3>No Workflows Yet</h3>
            <p style="opacity: 0.7; margin: 15px 0;">Create your first automation workflow to get started</p>
            <button class="btn" onclick="showCreateWorkflowModal()">
              ➕ Create Workflow
            </button>
          </div>
        `;
      }
    } catch (error) {
      workflowsList.innerHTML = `<div class="error">Failed to load workflows: ${error.message}</div>`;
    }
  };

  window.showCreateWorkflowModal = function () {
    const modal = document.createElement("div");
    modal.style.cssText =
      "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 9999;";

    modal.innerHTML = `
      <div style="background: #1e1e2e; padding: 30px; border-radius: 15px; max-width: 600px; width: 90%;">
        <h2>Create Workflow</h2>
        
        <div style="margin: 20px 0;">
          <label style="display: block; margin-bottom: 8px;">Workflow Name</label>
          <input type="text" id="workflowName" placeholder="e.g., Auto-ban raiders" style="width: 100%; padding: 12px; background: #2a2a3e; border: 1px solid #3a3a4e; border-radius: 8px; color: white;">
        </div>
        
        <div style="margin: 20px 0;">
          <label style="display: block; margin-bottom: 8px;">Description (optional)</label>
          <textarea id="workflowDesc" placeholder="What does this workflow do?" style="width: 100%; padding: 12px; background: #2a2a3e; border: 1px solid #3a3a4e; border-radius: 8px; color: white; min-height: 80px;"></textarea>
        </div>
        
        <div style="margin: 20px 0;">
          <label style="display: block; margin-bottom: 8px;">Trigger</label>
          <select id="workflowTrigger" style="width: 100%; padding: 12px; background: #2a2a3e; border: 1px solid #3a3a4e; border-radius: 8px; color: white;">
            <option value="">Select trigger...</option>
            <option value="message_pattern">Message Pattern</option>
            <option value="user_join">User Join</option>
            <option value="user_leave">User Leave</option>
            <option value="heat_threshold">Heat Threshold</option>
            <option value="threat_detected">Threat Detected</option>
            <option value="time_based">Time Based</option>
          </select>
        </div>
        
        <div style="margin: 20px 0;">
          <label style="display: block; margin-bottom: 8px;">Action</label>
          <select id="workflowAction" style="width: 100%; padding: 12px; background: #2a2a3e; border: 1px solid #3a3a4e; border-radius: 8px; color: white;">
            <option value="">Select action...</option>
            <option value="ban">Ban User</option>
            <option value="kick">Kick User</option>
            <option value="mute">Mute User</option>
            <option value="warn">Warn User</option>
            <option value="add_role">Add Role</option>
            <option value="remove_role">Remove Role</option>
            <option value="send_message">Send Message</option>
            <option value="quarantine">Quarantine User</option>
          </select>
        </div>
        
        <div style="display: flex; gap: 10px; margin-top: 30px;">
          <button class="btn" onclick="createWorkflow()" style="flex: 1;">Create</button>
          <button class="btn btn-secondary" onclick="this.closest('div').parentElement.parentElement.remove()" style="flex: 1;">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
  };

  window.createWorkflow = async function () {
    const name = document.getElementById("workflowName").value;
    const description = document.getElementById("workflowDesc").value;
    const trigger = document.getElementById("workflowTrigger").value;
    const action = document.getElementById("workflowAction").value;

    if (!name || !trigger || !action) {
      alert("Please fill in all required fields");
      return;
    }

    try {
      const response = await fetch("/api/dashboard/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guild: currentServer,
          name,
          description,
          trigger_type: trigger,
          action_type: action,
          enabled: true,
        }),
      });

      if (response.ok) {
        document.querySelector('[style*="z-index: 9999"]').remove();
        loadWorkflows();
        alert("✅ Workflow created successfully!");
      } else {
        alert("❌ Failed to create workflow");
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    }
  };

  window.toggleWorkflow = async function (id, enabled) {
    try {
      await fetch(`/api/dashboard/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    }
  };

  window.deleteWorkflow = async function (id) {
    if (!confirm("Are you sure you want to delete this workflow?")) return;

    try {
      await fetch(`/api/dashboard/workflows/${id}`, { method: "DELETE" });
      loadWorkflows();
      alert("✅ Workflow deleted");
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    }
  };

  window.editWorkflow = async function (id) {
    try {
      // Fetch workflow data
      const response = await fetch(
        `/api/dashboard/workflows?guild=${currentServer}`
      );
      const data = await response.json();
      const workflow = data.workflows.find((w) => w.id === id);

      if (!workflow) {
        alert("❌ Workflow not found");
        return;
      }

      // Show edit modal with pre-filled data
      const modal = document.createElement("div");
      modal.style.cssText =
        "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 9999;";

      modal.innerHTML = `
        <div style="background: #1e1e2e; padding: 30px; border-radius: 15px; max-width: 600px; width: 90%;">
          <h2>Edit Workflow</h2>
          <div style="margin: 20px 0;">
            <label style="display: block; margin-bottom: 8px;">Workflow Name</label>
            <input type="text" id="editWorkflowName" value="${workflow.name}" placeholder="e.g., Auto-ban raiders" style="width: 100%; padding: 12px; background: #2a2a3e; border: 1px solid #3a3a4e; border-radius: 8px; color: white;">
          </div>
          <div style="margin: 20px 0;">
            <label style="display: block; margin-bottom: 8px;">Description</label>
            <textarea id="editWorkflowDesc" placeholder="What does this workflow do?" style="width: 100%; padding: 12px; background: #2a2a3e; border: 1px solid #3a3a4e; border-radius: 8px; color: white; min-height: 80px;">${workflow.description || ""}</textarea>
          </div>
          <div style="margin: 20px 0;">
            <label style="display: block; margin-bottom: 8px;">Trigger</label>
            <select id="editWorkflowTrigger" style="width: 100%; padding: 12px; background: #2a2a3e; border: 1px solid #3a3a4e; border-radius: 8px; color: white;">
              <option value="member_join" ${workflow.trigger_type === "member_join" ? "selected" : ""}>Member Joins</option>
              <option value="member_leave" ${workflow.trigger_type === "member_leave" ? "selected" : ""}>Member Leaves</option>
              <option value="message_delete" ${workflow.trigger_type === "message_delete" ? "selected" : ""}>Message Deleted</option>
              <option value="role_add" ${workflow.trigger_type === "role_add" ? "selected" : ""}>Role Added</option>
            </select>
          </div>
          <div style="margin: 20px 0;">
            <label style="display: block; margin-bottom: 8px;">Action</label>
            <select id="editWorkflowAction" style="width: 100%; padding: 12px; background: #2a2a3e; border: 1px solid #3a3a4e; border-radius: 8px; color: white;">
              <option value="ban_user" ${workflow.action_type === "ban_user" ? "selected" : ""}>Ban User</option>
              <option value="kick_user" ${workflow.action_type === "kick_user" ? "selected" : ""}>Kick User</option>
              <option value="send_message" ${workflow.action_type === "send_message" ? "selected" : ""}>Send Message</option>
              <option value="add_role" ${workflow.action_type === "add_role" ? "selected" : ""}>Add Role</option>
            </select>
          </div>
          <div style="display: flex; gap: 10px; margin-top: 30px;">
            <button class="btn" onclick="saveWorkflowEdit(${id})" style="flex: 1;">Save Changes</button>
            <button class="btn btn-secondary" onclick="this.closest('div').parentElement.parentElement.remove()" style="flex: 1;">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
    } catch (error) {
      alert(`❌ Error loading workflow: ${error.message}`);
    }
  };

  window.saveWorkflowEdit = async function (id) {
    const name = document.getElementById("editWorkflowName").value;
    const description = document.getElementById("editWorkflowDesc").value;
    const trigger = document.getElementById("editWorkflowTrigger").value;
    const action = document.getElementById("editWorkflowAction").value;

    if (!name) {
      alert("❌ Please enter a workflow name");
      return;
    }

    try {
      await fetch(`/api/dashboard/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          trigger_type: trigger,
          action_type: action,
        }),
      });

      document.querySelector('div[style*="position: fixed"]').remove();
      loadWorkflows();
      alert("✅ Workflow updated!");
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    }
  };
});
