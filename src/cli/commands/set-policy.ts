import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAuthorityKeypair } from "../../agent/wallet-manager.js";
import * as vaultSdk from "../../vault/index.js";

export const setPolicyCmd = new Command("set-policy")
  .description("Update the policy on an existing vault")
  .argument("<vault-address>", "Vault PDA address")
  .option("--max-tx <lamports>", "Max lamports per transaction")
  .option("--max-daily <lamports>", "Max lamports per day")
  .option("--cooldown <seconds>", "Cooldown between transactions")
  .option("--active <bool>", "Enable or disable the vault", "true")
  .action(async (vaultAddress, opts) => {
    const spinner = ora("Fetching current policy...").start();

    try {
      const vaultPda = new PublicKey(vaultAddress);
      const current = await vaultSdk.fetchVault(vaultPda);
      if (!current) {
        spinner.fail("Vault not found");
        return;
      }

      const authority = getAuthorityKeypair();
      const maxPerTx = opts.maxTx ? parseInt(opts.maxTx) : current.policy.maxPerTx;
      const maxDaily = opts.maxDaily ? parseInt(opts.maxDaily) : current.policy.maxDaily;
      const cooldown = opts.cooldown !== undefined ? parseInt(opts.cooldown) : current.policy.cooldownSeconds;
      const isActive = opts.active === "true";

      spinner.text = "Updating policy on-chain...";
      const sig = await vaultSdk.updatePolicy(
        authority,
        vaultPda,
        maxPerTx,
        maxDaily,
        cooldown,
        isActive
      );

      spinner.succeed(chalk.green("Policy updated"));
      console.log(`  TX:        ${chalk.gray(sig)}`);
      console.log(`  Max/TX:    ${(maxPerTx / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
      console.log(`  Max/Day:   ${(maxDaily / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
      console.log(`  Cooldown:  ${cooldown}s`);
      console.log(`  Active:    ${isActive}`);
    } catch (err: any) {
      spinner.fail(chalk.red(`Failed: ${err.message}`));
    }
  });
