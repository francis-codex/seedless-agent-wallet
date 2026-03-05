import { Command } from "commander";
import chalk from "chalk";
import { getWallet } from "../../agent/wallet-manager.js";
import { runAgent } from "../../agent/index.js";

export const runAgentCmd = new Command("run-agent")
  .description("Start an autonomous AI agent loop")
  .argument("<agent-id>", "Agent wallet ID")
  .option("-t, --task <task>", "Task description for the agent")
  .option("-i, --iterations <n>", "Max iterations", "5")
  .action(async (agentId, opts) => {
    const wallet = getWallet(agentId);
    if (!wallet) {
      console.error(chalk.red(`Wallet ${agentId} not found.`));
      process.exit(1);
    }

    if (!wallet.vaultPda) {
      console.error(chalk.red(`No vault associated with wallet ${agentId}. Create one first.`));
      process.exit(1);
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(chalk.red("ANTHROPIC_API_KEY not set in .env"));
      process.exit(1);
    }

    await runAgent({
      agentId: wallet.id,
      agentKeypair: wallet.keypair,
      vaultPda: wallet.vaultPda,
      task: opts.task,
      maxIterations: parseInt(opts.iterations),
    });
  });
