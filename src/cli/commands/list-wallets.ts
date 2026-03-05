import { Command } from "commander";
import chalk from "chalk";
import { listWallets, getBalance } from "../../agent/wallet-manager.js";

export const listWalletsCmd = new Command("list-wallets")
  .description("List all agent wallets in this session")
  .action(async () => {
    const wallets = listWallets();

    if (wallets.length === 0) {
      console.log(chalk.gray("No wallets created yet."));
      return;
    }

    console.log(chalk.bold(`\n[WALLETS] Agent Wallets (${wallets.length}):\n`));

    for (const w of wallets) {
      const balance = await getBalance(w.publicKey);
      console.log(`  ${chalk.cyan(w.id)} ${chalk.white(w.label)}`);
      console.log(`    Address: ${chalk.yellow(w.publicKey)}`);
      console.log(`    Balance: ${balance.toFixed(4)} SOL`);
      if (w.vaultPda) {
        console.log(`    Vault:   ${chalk.green(w.vaultPda)}`);
      }
      console.log();
    }
  });
