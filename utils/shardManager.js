class ShardManager {
  static getShardInfo(client) {
    if (!client.shard) {
      return {
        shardId: 0,
        shardCount: 1,
        isSharded: false,
      };
    }

    return {
      shardId: client.shard.ids[0],
      shardCount: client.shard.count,
      isSharded: true,
    };
  }

  static async broadcastEval(client, script) {
    if (!client.shard) {
      return eval(script);
    }

    return client.shard.broadcastEval(script);
  }

  static async fetchClientValues(client, prop) {
    if (!client.shard) {
      return [client[prop]];
    }

    return client.shard.fetchClientValues(prop);
  }

  static async getGuildCount(client) {
    const guildCounts = await this.fetchClientValues(
      client,
      "guilds.cache.size"
    );
    return guildCounts.reduce((acc, count) => acc + count, 0);
  }

  static async getUserCount(client) {
    const userCounts = await this.fetchClientValues(client, "users.cache.size");
    return userCounts.reduce((acc, count) => acc + count, 0);
  }

  static async getShardStats(client) {
    if (!client.shard) {
      return {
        shards: [
          {
            id: 0,
            guilds: client.guilds.cache.size,
            users: client.users.cache.size,
            ping: client.ws.ping,
            status: client.ws.status,
            uptime: process.uptime(),
          },
        ],
      };
    }

    const shardInfo = await client.shard.broadcastEval(() => {
      return {
        id: this.shard.ids[0],
        guilds: this.guilds.cache.size,
        users: this.users.cache.size,
        ping: this.ws.ping,
        status: this.ws.status,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      };
    });

    return {
      shards: shardInfo,
      totalGuilds: shardInfo.reduce((acc, s) => acc + s.guilds, 0),
      totalUsers: shardInfo.reduce((acc, s) => acc + s.users, 0),
    };
  }
}

module.exports = ShardManager;
