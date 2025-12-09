/**
 * Custom Shard & Cluster Names
 * Make your bot's infrastructure sound badass!
 */

// Greek Gods Theme for Shards
const SHARD_NAMES = [
  "⚡ Zeus",      // King of gods
  "🌊 Poseidon",  // God of sea
  "⚔️ Ares",      // God of war
  "🏹 Artemis",   // Goddess of hunt
  "☀️ Apollo",    // God of sun
  "🛡️ Athena",    // Goddess of wisdom
  "🔱 Hades",     // God of underworld
  "💘 Aphrodite", // Goddess of love
  "⚒️ Hephaestus",// God of forge
  "🍇 Dionysus",  // God of wine
  "📨 Hermes",    // Messenger god
  "🌾 Demeter",   // Goddess of harvest
  "🔥 Hestia",    // Goddess of hearth
  "🌙 Selene",    // Goddess of moon
  "🌟 Helios",    // God of sun
  "⭐ Aether",    // God of light
  "🌑 Nyx",       // Goddess of night
  "⚡ Kronos",    // Titan of time
  "🏔️ Atlas",     // Titan who holds sky
  "🌊 Oceanus",   // Titan of ocean
];

// Mythical Creatures Theme for Clusters
const CLUSTER_NAMES = [
  "🐉 Dragon",     // Ultimate power
  "🦅 Phoenix",    // Rebirth
  "🦁 Sphinx",     // Wisdom
  "🦄 Unicorn",    // Purity
  "🐺 Cerberus",   // Guardian
  "🦂 Hydra",      // Regeneration
  "🦇 Basilisk",   // Deadly
  "🐍 Leviathan",  // Sea monster
  "🦉 Griffin",    // Nobility
  "🐲 Wyvern",     // Aerial might
];

/**
 * Get name for a shard
 */
function getShardName(shardId) {
  if (shardId < SHARD_NAMES.length) {
    return SHARD_NAMES[shardId];
  }
  // Fallback for shards beyond our list
  return `⚡ Shard-${shardId}`;
}

/**
 * Get name for a cluster
 */
function getClusterName(clusterId) {
  if (clusterId < CLUSTER_NAMES.length) {
    return CLUSTER_NAMES[clusterId];
  }
  // Fallback for clusters beyond our list
  return `🔥 Cluster-${clusterId}`;
}

/**
 * Get display name with ID
 */
function getShardDisplay(shardId) {
  return `${getShardName(shardId)} (#${shardId})`;
}

function getClusterDisplay(clusterId) {
  return `${getClusterName(clusterId)} (#${clusterId})`;
}

module.exports = {
  getShardName,
  getClusterName,
  getShardDisplay,
  getClusterDisplay,
  SHARD_NAMES,
  CLUSTER_NAMES,
};
