import { Command } from "commander";
import chalk from "chalk";
import { createWallet, getBalance } from "../../agent/wallet-manager.js";

export const createWalletCmd = new Command("create-wallet")
  .description("Create a new agent wallet keypair")
  .option("-l, --label <name>", "Label for the wallet")
  .action(async (opts) => {
    const wallet = createWallet(opts.label);

    console.log(chalk.green("\n[OK] Agent wallet created"));
    console.log(`  ID:        ${chalk.cyan(wallet.id)}`);
    console.log(`  Label:     ${wallet.label}`);
    console.log(`  Address:   ${chalk.yellow(wallet.publicKey)}`);
    console.log(`  Created:   ${new Date(wallet.createdAt).toISOString()}`);
    console.log(
      chalk.gray("\n  Fund this wallet with: seedless-agent fund-wallet " + wallet.id)
    );
  });
