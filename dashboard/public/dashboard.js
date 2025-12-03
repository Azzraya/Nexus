let currentServer = null;
let userData = null;

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

    const selector = document.getElementById("serverSelector");

    if (servers.length === 0) {
      selector.innerHTML =
        '<p style="opacity:0.7;">No servers found. Invite Nexus to a server first!</p>';
      return;
    }

    selector.innerHTML = `
            <select class="server-dropdown" onchange="selectServer(this.value)">
                <option value="">Select a server...</option>
                ${servers
                  .map(
                    (s) => `
                    <option value="${s.id}">${s.name} (${s.memberCount} members)</option>
                `
                  )
                  .join("")}
            </select>
        `;

    // Auto-select first server
    if (servers.length > 0) {
      currentServer = servers[0].id;
      document.querySelector(".server-dropdown").value = currentServer;
      loadServerData(currentServer);
    }
  } catch (error) {
    console.error("Failed to load servers:", error);
    document.getElementById("serverSelector").innerHTML =
      '<p style="color:#ff4444;">Failed to load servers</p>';
  }
}

function selectServer(serverId) {
  if (!serverId) return;
  currentServer = serverId;
  loadServerData(serverId);
}

// Load server data
async function loadServerData(serverId) {
  try {
    const response = await fetch(`/api/server/${serverId}`);
    const server = await response.json();

    loadOverview(server);
  } catch (error) {
    console.error("Failed to load server data:", error);
  }
}

// Load overview page
function loadOverview(server) {
  const contentArea = document.getElementById("contentArea");

  const config = server.config || {};
  const securityScore = calculateSecurityScore(config);

  contentArea.innerHTML = `
        <div class="security-score">
            <h2>Security Score</h2>
            <div class="score-circle">${securityScore}%</div>
            <p>Your server protection level</p>
        </div>

        <h2 style="margin-bottom: 25px;">Quick Systems Overview</h2>
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
                          config.automod_enabled !== 0 ? "checked" : ""
                        } 
                               onchange="toggleSetting('automod_enabled', this.checked)">
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
                    <label class="toggle-switch">
                        <input type="checkbox" ${
                          config.log_channel ? "checked" : ""
                        } 
                               onchange="toggleSetting('logging_enabled', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
                <p class="system-description">
                    Comprehensive audit logs for all moderation actions and security events.
                </p>
                <div class="system-footer">
                    <button class="settings-btn" onclick="loadPage('logging')">SETTINGS</button>
                </div>
            </div>

            <div class="system-card">
                <div class="system-header">
                    <div class="system-title">
                        <span class="system-icon">🎁</span>
                        <span>Vote Rewards</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" ${
                          config.vote_rewards_enabled !== 0 ? "checked" : ""
                        } 
                               onchange="toggleSetting('vote_rewards_enabled', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
                <p class="system-description">
                    Automatic rewards for users who vote. Streaks, points, and temporary roles.
                </p>
                <div class="system-footer">
                    <button class="settings-btn">SETTINGS</button>
                </div>
            </div>
        </div>

        <div class="stats-grid" style="margin-top: 40px;">
            <div class="stat-card">
                <div class="stat-value">${server.memberCount || 0}</div>
                <div class="stat-label">Members</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">0</div>
                <div class="stat-label">Threats Blocked (24h)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">0</div>
                <div class="stat-label">Auto-Mod Actions</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${config.snapshots || 0}</div>
                <div class="stat-label">Recovery Snapshots</div>
            </div>
        </div>
    `;
}

function calculateSecurityScore(config) {
  let score = 0;
  if (config.anti_nuke_enabled !== 0) score += 20;
  if (config.anti_raid_enabled !== 0) score += 20;
  if (config.automod_enabled !== 0) score += 15;
  if (config.auto_recovery_enabled !== 0) score += 20;
  if (config.log_channel) score += 15;
  if (config.vote_rewards_enabled !== 0) score += 10;
  return Math.min(score, 100);
}

async function toggleSetting(setting, enabled) {
  if (!currentServer) return;

  try {
    await fetch(`/api/server/${currentServer}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setting, value: enabled ? 1 : 0 }),
    });

    // Reload server data to refresh
    loadServerData(currentServer);
  } catch (error) {
    console.error("Failed to toggle setting:", error);
    alert("Failed to update setting");
  }
}

function loadPage(page) {
  alert(`Settings page for ${page} coming soon!`);
}

// Navigation
document.addEventListener("DOMContentLoaded", () => {
  loadUser();
  loadServers();

  // Nav item click handling
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      document
        .querySelectorAll(".nav-item")
        .forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      document.getElementById("currentPage").textContent =
        item.querySelector("span:last-child").textContent;
    });
  });
});
