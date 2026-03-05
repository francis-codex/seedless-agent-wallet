import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { PublicKey, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import { getWallet, getAuthorityKeypair, setVaultPda } from "../../agent/wallet-manager.js";
import * as vaultSdk from "../../vault/index.js";
import { DEFAULT_POLICY, SOLANA_RPC_URL } from "../../shared/constants.js";

export const createVaultCmd = new Command("create-vault")
  .description("Create an on-chain vault for an agent with policy enforcement")
  .argument("<agent-id>", "Agent wallet ID")
  .option("--max-tx <lamports>", "Max lamports per transaction", String(DEFAULT_POLICY.maxPerTx))
  .option("--max-daily <lamports>", "Max lamports per day", String(DEFAULT_POLICY.maxDaily))
  .option("--cooldown <seconds>", "Cooldown between transactions", String(DEFAULT_POLICY.cooldownSeconds))
  .option("--deposit <sol>", "Initial SOL deposit into vault", "0.5")
  .action(async (agentId, opts) => {
    const wallet = getWallet(agentId);
    if (!wallet) {
      console.error(chalk.red(`Wallet ${agentId} not found.`));
      process.exit(1);
    }

    const authority = getAuthorityKeypair();
    const spinner = ora("Creating vault on-chain...").start();

    try {
      const { vaultPda, txSignature } = await vaultSdk.createVault(
        authority,
        wallet.keypair.publicKey,
        parseInt(opts.maxTx),
        parseInt(opts.maxDaily),
        parseInt(opts.cooldown)
      );

      setVaultPda(agentId, vaultPda);
      spinner.succeed(chalk.green("Vault created"));
      console.log(`  Vault PDA: ${chalk.yellow(vaultPda)}`);
      console.log(`  TX:        ${chalk.gray(txSignature)}`);

      // Deposit initial funds
      const depositAmount = parseFloat(opts.deposit);
      if (depositAmount > 0) {
        const depSpinner = ora(`Depositing ${depositAmount} SOL...`).start();
        const depSig = await vaultSdk.deposit(
          authority,
          new PublicKey(vaultPda),
          Math.round(depositAmount * LAMPORTS_PER_SOL)
        );
        depSpinner.succeed(chalk.green(`Deposited ${depositAmount} SOL`));
        console.log(`  TX:        ${chalk.gray(depSig)}`);
      }

      // Show vault info
      const info = await vaultSdk.fetchVault(new PublicKey(vaultPda));
      if (info) {
        console.log(chalk.bold("\n  Policy:"));
        console.log(`  Max/TX:    ${(info.policy.maxPerTx / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
        console.log(`  Max/Day:   ${(info.policy.maxDaily / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
        console.log(`  Cooldown:  ${info.policy.cooldownSeconds}s`);
        console.log(`  Balance:   ${(info.balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
      }
    } catch (err: any) {
      spinner.fail(chalk.red(`Failed: ${err.message}`));
    }
  });
