const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const chalk = require("chalk");

const dbPath = path.join(__dirname, "data", "nexus.db");
const db = new sqlite3.Database(dbPath);

console.log(chalk.bold.cyan("\n🔍 NEXUS USAGE ANALYSIS\n"));
console.log("Analyzing last 7 days of activity...\n");

// Get total commands
db.get(
  `SELECT COUNT(*) as total FROM command_usage_log 
   WHERE timestamp > (strftime('%s', 'now') - 7*24*60*60) * 1000`,
  (err, row) => {
    if (err) {
      console.error("Error:", err);
      return;
    }
    console.log(
      chalk.bold(`📊 Total Commands (7 days): ${chalk.green(row.total)}\n`)
    );

    // Get commands by hour
    db.all(
      `SELECT 
        strftime('%H', datetime(timestamp/1000, 'unixepoch')) as hour,
        COUNT(*) as commands,
        COUNT(DISTINCT guild_id) as servers
      FROM command_usage_log
      WHERE timestamp > (strftime('%s', 'now') - 7*24*60*60) * 1000
      GROUP BY hour
      ORDER BY hour`,
      (err, rows) => {
        if (err) {
          console.error("Error:", err);
          return;
        }

        console.log(chalk.bold("⏰ HOURLY USAGE BREAKDOWN:\n"));

        // Create bar chart
        const maxCommands = Math.max(...rows.map((r) => r.commands));

        rows.forEach((row) => {
          const hour = parseInt(row.hour);
          const hourLabel = `${hour.toString().padStart(2, "0")}:00`;
          const barLength = Math.floor((row.commands / maxCommands) * 40);
          const bar = "█".repeat(barLength);

          // Color code by activity level
          let coloredBar;
          if (row.commands > maxCommands * 0.7) {
            coloredBar = chalk.red(bar); // High activity
          } else if (row.commands > maxCommands * 0.4) {
            coloredBar = chalk.yellow(bar); // Medium activity
          } else {
            coloredBar = chalk.green(bar); // Low activity
          }

          console.log(
            `${hourLabel} | ${coloredBar} ${chalk.white(row.commands)} commands (${row.servers} servers)`
          );
        });

        console.log();

        // Find peak hours
        db.all(
          `SELECT 
            strftime('%H', datetime(timestamp/1000, 'unixepoch')) as hour,
            COUNT(*) as commands
          FROM command_usage_log  
          WHERE timestamp > (strftime('%s', 'now') - 7*24*60*60) * 1000
          GROUP BY hour
          ORDER BY commands DESC
          LIMIT 5`,
          (err, peaks) => {
            if (err) {
              console.error("Error:", err);
              return;
            }

            console.log(chalk.bold.red("🔴 PEAK HOURS (Avoid maintenance):\n"));
            peaks.forEach((p, i) => {
              console.log(
                `${i + 1}. ${p.hour}:00 - ${chalk.red(p.commands + " commands")}`
              );
            });

            console.log();

            // Find quiet hours
            db.all(
              `SELECT 
                strftime('%H', datetime(timestamp/1000, 'unixepoch')) as hour,
                COUNT(*) as commands
              FROM command_usage_log
              WHERE timestamp > (strftime('%s', 'now') - 7*24*60*60) * 1000  
              GROUP BY hour
              ORDER BY commands ASC
              LIMIT 5`,
              (err, quiet) => {
                if (err) {
                  console.error("Error:", err);
                  return;
                }

                console.log(
                  chalk.bold.green("🟢 QUIET HOURS (Best for maintenance):\n")
                );
                quiet.forEach((q, i) => {
                  console.log(
                    `${i + 1}. ${q.hour}:00 - ${chalk.green(q.commands + " commands")}`
                  );
                });

                console.log();

                // Get day of week pattern
                db.all(
                  `SELECT 
                    CASE CAST(strftime('%w', datetime(timestamp/1000, 'unixepoch')) AS INTEGER)
                      WHEN 0 THEN 'Sunday'
                      WHEN 1 THEN 'Monday'
                      WHEN 2 THEN 'Tuesday'
                      WHEN 3 THEN 'Wednesday'
                      WHEN 4 THEN 'Thursday'
                      WHEN 5 THEN 'Friday'
                      WHEN 6 THEN 'Saturday'
                    END as day,
                    COUNT(*) as commands
                  FROM command_usage_log
                  WHERE timestamp > (strftime('%s', 'now') - 7*24*60*60) * 1000
                  GROUP BY strftime('%w', datetime(timestamp/1000, 'unixepoch'))
                  ORDER BY commands DESC`,
                  (err, days) => {
                    if (err) {
                      console.error("Error:", err);
                      db.close();
                      return;
                    }

                    console.log(chalk.bold("📅 USAGE BY DAY OF WEEK:\n"));
                    days.forEach((d) => {
                      console.log(
                        `${d.day.padEnd(10)} - ${chalk.cyan(d.commands + " commands")}`
                      );
                    });

                    console.log();

                    // Recommendations
                    console.log(chalk.bold.cyan("💡 RECOMMENDATIONS:\n"));

                    const quietestHour = quiet[0].hour;
                    const busiestHour = peaks[0].hour;

                    console.log(
                      chalk.green(
                        `✅ Best maintenance window: ${quietestHour}:00 - ${(parseInt(quietestHour) + 2) % 24}:00`
                      )
                    );
                    console.log(
                      chalk.red(
                        `❌ Avoid updates during: ${busiestHour}:00 - ${(parseInt(busiestHour) + 2) % 24}:00`
                      )
                    );

                    if (days[0].day === "Saturday" || days[0].day === "Sunday") {
                      console.log(
                        chalk.yellow(
                          `⚠️  Weekends are busiest - schedule updates for weekdays if possible`
                        )
                      );
                    }

                    console.log(
                      chalk.cyan(
                        `\n📈 Current usage: ${row.total} commands in 7 days (~${Math.floor(row.total / 7)} per day)`
                      )
                    );

                    console.log();
                    db.close();
                  }
                );
              }
            );
          }
        );
      }
    );
  }
);

