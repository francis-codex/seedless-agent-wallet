import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { PublicKey } from "@solana/web3.js";
import { getAuthorityKeypair } from "../../agent/wallet-manager.js";
import * as vaultSdk from "../../vault/index.js";

export const emergencyStopCmd = new Command("emergency-stop")
  .description("Emergency stop - immediately disable a vault")
  .argument("<vault-address>", "Vault PDA address")
  .action(async (vaultAddress) => {
    const spinner = ora("Engaging emergency stop...").start();

    try {
      const authority = getAuthorityKeypair();
      const vaultPda = new PublicKey(vaultAddress);

      const sig = await vaultSdk.emergencyStop(authority, vaultPda);

      spinner.succeed(chalk.red.bold("[STOP] EMERGENCY STOP ENGAGED"));
      console.log(`  Vault:  ${chalk.yellow(vaultAddress)}`);
      console.log(`  TX:     ${chalk.gray(sig)}`);
      console.log(chalk.red("  All agent withdrawals are now blocked."));
    } catch (err: any) {
      spinner.fail(chalk.red(`Failed: ${err.message}`));
    }
  });
