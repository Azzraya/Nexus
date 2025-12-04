const db = require("./database");
const axios = require("axios");

class ChartGenerator {
  constructor() {
    this.width = 800;
    this.height = 400;
    // Using QuickChart.io API - no native dependencies needed, works on all platforms
    this.quickChartUrl = "https://quickchart.io/chart";
  }

  /**
   * Generate member growth chart
   */
  async generateGrowthChart(guildId, days = 30) {
    const data = await this.getMemberGrowthData(guildId, days);

    const configuration = {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: "Members",
            data: data.values,
            borderColor: "#5865f2",
            backgroundColor: "rgba(88, 101, 242, 0.1)",
            tension: 0.4,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: "Member Growth",
            color: "#ffffff",
            font: { size: 18 },
          },
          legend: {
            labels: { color: "#ffffff" },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: "#ffffff" },
            grid: { color: "rgba(255, 255, 255, 0.1)" },
          },
          x: {
            ticks: { color: "#ffffff" },
            grid: { color: "rgba(255, 255, 255, 0.1)" },
          },
        },
      },
    };

    // Use QuickChart API - works on all platforms, no native dependencies
    return await this.generateChartFromConfig(configuration);
  }

  /**
   * Generate activity heatmap
   */
  async generateActivityHeatmap(guildId, days = 7) {
    const data = await this.getActivityHeatmapData(guildId, days);

    const configuration = {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: "Messages",
            data: data.messages,
            backgroundColor: "#5865f2",
          },
          {
            label: "Commands",
            data: data.commands,
            backgroundColor: "#57f287",
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: "Activity by Hour",
            color: "#ffffff",
            font: { size: 18 },
          },
          legend: {
            labels: { color: "#ffffff" },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: "#ffffff" },
            grid: { color: "rgba(255, 255, 255, 0.1)" },
          },
          x: {
            ticks: { color: "#ffffff" },
            grid: { color: "rgba(255, 255, 255, 0.1)" },
          },
        },
      },
    };

    return await this.generateChartFromConfig(configuration);
  }

  /**
   * Generate threat score distribution
   */
  async generateThreatDistribution(guildId, days = 30) {
    const data = await this.getThreatDistributionData(guildId, days);

    const configuration = {
      type: "doughnut",
      data: {
        labels: [
          "Low (0-30)",
          "Medium (30-60)",
          "High (60-80)",
          "Critical (80+)",
        ],
        datasets: [
          {
            data: data.distribution,
            backgroundColor: ["#00ff00", "#ffa500", "#ff6600", "#ff0000"],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: "Threat Score Distribution",
            color: "#ffffff",
            font: { size: 18 },
          },
          legend: {
            labels: { color: "#ffffff" },
          },
        },
      },
    };

    return await this.generateChartFromConfig(configuration);
  }

  /**
   * Generate chart using QuickChart API (works on all platforms)
   */
  async generateChartFromConfig(configuration) {
    try {
      // QuickChart API - free, no dependencies, works everywhere
      const response = await axios.get(this.quickChartUrl, {
        params: {
          c: JSON.stringify(configuration),
          width: this.width,
          height: this.height,
          backgroundColor: "#36393f",
        },
        responseType: "arraybuffer",
      });

      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Chart generation failed: ${error.message}`);
    }
  }

  async getMemberGrowthData(guildId, days) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const logs = await db.getMemberGrowthLogs(guildId, since);

    const labels = [];
    const values = [];

    // Group by day
    const byDay = {};
    logs.forEach((log) => {
      const date = new Date(log.timestamp);
      const day = date.toISOString().split("T")[0];
      byDay[day] = (byDay[day] || 0) + (log.action === "join" ? 1 : -1);
    });

    Object.entries(byDay).forEach(([date, change]) => {
      labels.push(date);
      values.push(change);
    });

    return { labels, values };
  }

  async getActivityHeatmapData(guildId, days) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const stats = await db.getActivityByHour(guildId, since);

    const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const messages = new Array(24).fill(0);
    const commands = new Array(24).fill(0);

    stats.messages.forEach((row) => {
      messages[row.hour] = row.count;
    });

    stats.commands.forEach((row) => {
      commands[row.hour] = row.count;
    });

    return { labels, messages, commands };
  }

  async getThreatDistributionData(guildId, days) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const threats = await db.getSecurityLogs(guildId, since);

    const distribution = [0, 0, 0, 0]; // low, medium, high, critical

    threats.forEach((threat) => {
      const score = threat.threat_score;
      if (score < 30) distribution[0]++;
      else if (score < 60) distribution[1]++;
      else if (score < 80) distribution[2]++;
      else distribution[3]++;
    });

    return { distribution };
  }
}

module.exports = ChartGenerator;
