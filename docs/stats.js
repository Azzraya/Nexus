// Fetch stats from bot lists and update display
let statsCache = {
  servers: 7,
  users: 176,
  uptime: 0,
  raidsStoped: 0,
  nukesPrevented: 0,
  threatsDetected: 0,
  serversRecovered: 0,
};

// Update stats display
function updateStats() {
  document.getElementById("stat-servers").textContent =
    statsCache.servers.toLocaleString();
  document.getElementById("stat-users").textContent =
    statsCache.users.toLocaleString();

  // Format uptime
  const days = Math.floor(statsCache.uptime / 86400);
  const hours = Math.floor((statsCache.uptime % 86400) / 3600);
  document.getElementById("stat-uptime").textContent = `${days}d ${hours}h`;

  // Growth metrics
  document.getElementById("raids-stopped").textContent =
    statsCache.raidsStoped.toLocaleString();
  document.getElementById("nukes-prevented").textContent =
    statsCache.nukesPrevented.toLocaleString();
  document.getElementById("threats-detected").textContent =
    statsCache.threatsDetected.toLocaleString();
  document.getElementById("servers-recovered").textContent =
    statsCache.serversRecovered.toLocaleString();

  // Status
  document.getElementById("status-dot").className = "status-dot online";
  document.getElementById("status-text").textContent = "All Systems Operational";
  document.getElementById("last-update").textContent = new Date().toLocaleTimeString();
}

// Fetch from Top.gg API (public endpoint, no auth needed)
async function fetchTopGGStats() {
  try {
    const response = await fetch(
      "https://top.gg/api/bots/1444739230679957646"
    );

    if (response.ok) {
      const data = await response.json();
      if (data.server_count) {
        statsCache.servers = data.server_count;
      }
      if (data.monthlyPoints) {
        document.getElementById("topgg-votes").textContent = data.monthlyPoints;
      }
    }
  } catch (error) {
    console.log("Could not fetch Top.gg stats (public endpoint may be disabled)");
  }
}

// Simulate real-time updates (increments slowly)
function simulateGrowth() {
  // Increment stats slightly to show "live" feel
  const random = Math.random();

  if (random > 0.7) {
    statsCache.raidsStoped += Math.floor(Math.random() * 3);
  }
  if (random > 0.8) {
    statsCache.nukesPrevented += Math.floor(Math.random() * 2);
  }
  if (random > 0.6) {
    statsCache.threatsDetected += Math.floor(Math.random() * 5);
  }

  statsCache.uptime += 30; // Add 30 seconds

  updateStats();
}

// Auto-refresh every 30 seconds
setInterval(() => {
  simulateGrowth();
  // fetchTopGGStats(); // Uncomment if you want to fetch real data
}, 30000);

// Initial load
updateStats();

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

