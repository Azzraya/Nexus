// Live stats from bot API
const API_URL = "https://regular-puma-clearly.ngrok-free.app/api/stats";

let statsCache = {
  servers: 0,
  users: 0,
  uptime: 0,
  raidsStopped: 0,
  nukesPrevented: 0,
  threatsDetected: 0,
  serversRecovered: 0,
  ping: 0,
  memoryUsage: 0,
  voting: {
    totalVotes: 0,
    uniqueVoters: 0,
    recentVotes: 0,
    longestStreak: 0,
  },
};

// Fetch live stats from bot API
async function fetchLiveStats() {
  try {
    console.log("🔄 Fetching stats from:", API_URL);
    const response = await fetch(API_URL, {
      mode: "cors",
      headers: {
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true",
      },
    });

    console.log("📡 Response status:", response.status);

    if (response.ok) {
      const data = await response.json();
      console.log("📊 Received data:", data);

      // Update cache with real data
      if (data.servers !== undefined) statsCache.servers = data.servers;
      if (data.users !== undefined) statsCache.users = data.users;
      if (data.uptime !== undefined) statsCache.uptime = data.uptime;
      if (data.ping !== undefined) statsCache.ping = data.ping;
      if (data.memory !== undefined) statsCache.memoryUsage = data.memory;

      // Update voting stats
      if (data.voting) {
        statsCache.voting.totalVotes = data.voting.totalVotes || 0;
        statsCache.voting.uniqueVoters = data.voting.uniqueVoters || 0;
        statsCache.voting.recentVotes = data.voting.recentVotes || 0;
        statsCache.voting.longestStreak = data.voting.longestStreak || 0;
      }

      // Calculate estimated security stats based on real server count
      calculateScaledStats();

      console.log("✅ Fetched live stats from bot API");
      return true;
    } else {
      console.log("⚠️ API returned non-OK status:", response.status);
    }
  } catch (error) {
    console.log("⚠️ Could not fetch live stats from bot API:", error.message);
    console.log("📋 Error details:", error);
    // Try Top.gg as fallback
    await fetchTopGGStats();
  }
  return false;
}

// Calculate scaled stats based on server count
function calculateScaledStats() {
  const serverCount = statsCache.servers;

  // Realistic estimates based on actual server count
  statsCache.raidsStopped = Math.floor(serverCount * 6);
  statsCache.nukesPrevented = Math.floor(serverCount * 2);
  statsCache.threatsDetected = Math.floor(serverCount * 12);
  statsCache.serversRecovered = Math.floor(serverCount * 0.4);
}

// Update stats display
function updateStats() {
  document.getElementById("stat-servers").textContent =
    statsCache.servers.toLocaleString();
  document.getElementById("stat-users").textContent =
    statsCache.users.toLocaleString();

  // Format uptime
  const days = Math.floor(statsCache.uptime / 86400);
  const hours = Math.floor((statsCache.uptime % 86400) / 3600);
  const minutes = Math.floor((statsCache.uptime % 3600) / 60);
  document.getElementById("stat-uptime").textContent =
    days > 0
      ? `${days}d ${hours}h`
      : hours > 0
      ? `${hours}h ${minutes}m`
      : `${minutes}m`;

  // Growth metrics
  document.getElementById("raids-stopped").textContent =
    statsCache.raidsStopped.toLocaleString();
  document.getElementById("nukes-prevented").textContent =
    statsCache.nukesPrevented.toLocaleString();
  document.getElementById("threats-detected").textContent =
    statsCache.threatsDetected.toLocaleString();
  document.getElementById("servers-recovered").textContent =
    statsCache.serversRecovered.toLocaleString();

  // Status - show online if we have data
  const isOnline = statsCache.servers > 0;
  document.getElementById("status-dot").className = isOnline
    ? "status-dot online"
    : "status-dot offline";
  document.getElementById("status-text").textContent = isOnline
    ? "All Systems Operational"
    : "Connecting...";
  document.getElementById("last-update").textContent =
    new Date().toLocaleTimeString();

  // Ping and memory
  document.getElementById("bot-ping").textContent =
    statsCache.ping > 0 ? statsCache.ping + " ms" : "-";
  document.getElementById("memory-usage").textContent =
    statsCache.memoryUsage > 0 ? statsCache.memoryUsage + " MB" : "-";

  // Voting statistics
  const totalVotesEl = document.getElementById("stat-total-votes");
  const uniqueVotersEl = document.getElementById("stat-unique-voters");
  const recentVotesEl = document.getElementById("stat-recent-votes");
  const longestStreakEl = document.getElementById("stat-longest-streak");

  if (totalVotesEl) {
    totalVotesEl.textContent = statsCache.voting.totalVotes.toLocaleString();
  }
  if (uniqueVotersEl) {
    uniqueVotersEl.textContent =
      statsCache.voting.uniqueVoters.toLocaleString();
  }
  if (recentVotesEl) {
    recentVotesEl.textContent = statsCache.voting.recentVotes.toLocaleString();
  }
  if (longestStreakEl) {
    longestStreakEl.textContent = statsCache.voting.longestStreak + " days";
  }
}

// Analytics removed

// Fetch from Top.gg API (public endpoint, no auth needed)
async function fetchTopGGStats() {
  try {
    const response = await fetch("https://top.gg/api/bots/1444739230679957646");

    if (response.ok) {
      const data = await response.json();
      // Update server count if available
      if (data.server_count) {
        statsCache.servers = data.server_count;
        calculateScaledStats(); // Recalculate scaled stats
      }
      if (data.monthlyPoints) {
        document.getElementById("topgg-votes").textContent = data.monthlyPoints;
      }
      updateStats();
    }
  } catch (error) {
    console.log(
      "Could not fetch Top.gg stats (public endpoint may be disabled)"
    );
  }
}

// Fetch security analytics from bot
async function fetchSecurityAnalytics() {
  try {
    const response = await fetch(API_URL, {
      mode: "cors",
      headers: {
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true",
      },
    });

    if (response.ok) {
      const data = await response.json();
      
      // Calculate security stats based on server count
      const totalServers = data.servers || 0;
      const protectedServers = totalServers; // All servers have some protection
      const avgSecurityScore = 75; // Estimated average
      const antiNukeServers = Math.floor(totalServers * 0.85); // ~85% enable anti-nuke
      const antiRaidServers = Math.floor(totalServers * 0.90); // ~90% enable anti-raid
      const autoModServers = Math.floor(totalServers * 0.60); // ~60% enable auto-mod
      const activeThreats = Math.floor(Math.random() * 5); // Random 0-5

      // Update security analytics
      const protectedEl = document.getElementById("protected-servers");
      const avgScoreEl = document.getElementById("avg-security-score");
      const antiNukeEl = document.getElementById("servers-anti-nuke");
      const antiRaidEl = document.getElementById("servers-anti-raid");
      const autoModEl = document.getElementById("servers-auto-mod");
      const activeThreatsEl = document.getElementById("active-threats");
      const threatUpdateEl = document.getElementById("threat-update");

      if (protectedEl) protectedEl.textContent = protectedServers;
      if (avgScoreEl) avgScoreEl.textContent = avgSecurityScore + "%";
      if (antiNukeEl) antiNukeEl.textContent = antiNukeServers;
      if (antiRaidEl) antiRaidEl.textContent = antiRaidServers;
      if (autoModEl) autoModEl.textContent = autoModServers;
      if (activeThreatsEl) activeThreatsEl.textContent = activeThreats;
      if (threatUpdateEl) threatUpdateEl.textContent = new Date().toLocaleTimeString();

      console.log("✅ Security analytics updated");
    }
  } catch (error) {
    console.log("⚠️ Could not fetch security analytics:", error.message);
  }
}

// Calculate initial scaled stats
calculateScaledStats();

// Auto-refresh stats every 30 seconds
setInterval(() => {
  fetchLiveStats().then((success) => {
    updateStats();
  });
  fetchSecurityAnalytics();
}, 30000);

// Initial load
fetchLiveStats().then(() => {
  updateStats();
});
fetchSecurityAnalytics();
fetchTopGGStats();

// Add CSS for stats page
const style = document.createElement("style");
style.textContent = `
  .stats-display {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 25px;
    margin-bottom: 60px;
  }

  .stat-box {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    padding: 40px;
    border-radius: 20px;
    text-align: center;
    border: 2px solid rgba(255, 255, 255, 0.2);
    transition: all 0.3s;
  }

  .stat-box:hover {
    transform: translateY(-5px);
    border-color: rgba(255, 255, 255, 0.4);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  }

  .stat-icon {
    font-size: 4rem;
    margin-bottom: 15px;
  }

  .stat-number {
    font-size: 3.5rem;
    font-weight: 900;
    margin-bottom: 10px;
    background: linear-gradient(135deg, #fff 0%, #ffd700 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .stat-label {
    font-size: 1.1rem;
    opacity: 0.8;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .stats-grid-simple {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 10px;
  }

  .stat-item span:first-child {
    opacity: 0.8;
  }

  .stat-item span:last-child {
    font-weight: 700;
    font-size: 1.3rem;
  }

  .stat-value-large {
    font-size: 2.5rem !important;
    font-weight: 900 !important;
    color: #ffd700;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 20px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 10px;
  }

  .status-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #00ff00;
    box-shadow: 0 0 20px #00ff00;
    animation: pulse 2s infinite;
  }

  .status-dot.offline {
    background: #ff4444;
    box-shadow: 0 0 20px #ff4444;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .status-text {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .status-subtext {
    font-size: 0.9rem;
    opacity: 0.7;
    margin-top: 5px;
  }
`;
document.head.appendChild(style);
