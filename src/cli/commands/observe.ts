import { Command } from "commander";
import chalk from "chalk";
import { getActionLog, getAgentLog } from "../../shared/logger.js";

export const observeCmd = new Command("observe")
  .description("View real-time agent action logs")
  .option("-a, --agent <id>", "Filter by agent ID")
  .option("-n, --last <n>", "Show last N actions", "20")
  .action(async (opts) => {
    const log = opts.agent ? getAgentLog(opts.agent) : getActionLog();
    const last = parseInt(opts.last);
    const entries = log.slice(-last);

    if (entries.length === 0) {
      console.log(chalk.gray("No actions logged yet. Run an agent first."));
      return;
    }

    console.log(chalk.bold(`\n[DASHBOARD] Agent Actions (last ${entries.length}):\n`));
    console.log(
      chalk.gray("TIME     ") +
        chalk.cyan("AGENT    ") +
        chalk.yellow("ACTION                ") +
        chalk.white("DETAILS")
    );
    console.log(chalk.gray("-".repeat(80)));

    for (const entry of entries) {
      const time = new Date(entry.timestamp).toISOString().slice(11, 19);
      const status = entry.success ? chalk.green("[OK]") : chalk.red("[FAIL]");
      const agent = chalk.cyan(entry.agentId.padEnd(8));
      const action = chalk.yellow(entry.action.padEnd(22));

      let details = "";
      if (entry.txSignature) {
        details += chalk.gray(`tx:${entry.txSignature.slice(0, 12)}.. `);
      }
      if (entry.error) {
        details += chalk.red(entry.error.slice(0, 40));
      } else {
        const d = entry.details;
        if (d.amount_sol !== undefined) details += `${d.amount_sol} SOL `;
        if (d.balance !== undefined)
          details += `bal:${((d.balance as number) / 1e9).toFixed(3)} `;
        if (d.destination) details += `> ${(d.destination as string).slice(0, 8)}.. `;
      }

      console.log(`${chalk.gray(time)} ${status} ${agent} ${action} ${details}`);
    }
  });
