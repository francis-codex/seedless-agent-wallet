import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, Connection } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "../../shared/constants.js";
import { createWallet, getAuthorityKeypair, setVaultPda } from "../../agent/wallet-manager.js";
import * as vaultSdk from "../../vault/index.js";
import { runAgent } from "../../agent/index.js";
import { DEFAULT_POLICY } from "../../shared/constants.js";

export const multiAgentCmd = new Command("multi-agent")
  .description("Spawn N independent agents with their own wallets and vaults")
  .option("-n, --count <n>", "Number of agents to spawn", "3")
  .option("-d, --deposit <sol>", "SOL to deposit in each vault", "0.2")
  .option("-t, --task <task>", "Task for each agent")
  .action(async (opts) => {
    const count = parseInt(opts.count);
    const depositSol = parseFloat(opts.deposit);
    const authority = getAuthorityKeypair();

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(chalk.red("ANTHROPIC_API_KEY not set in .env"));
      process.exit(1);
    }

    console.log(chalk.bold.cyan(`\n[LAUNCH] Spawning ${count} autonomous agents...\n`));

    const agents: Array<{ id: string; vaultPda: string; keypair: any }> = [];

    // Create wallets and vaults
    for (let i = 0; i < count; i++) {
      const spinner = ora(`Setting up agent ${i + 1}/${count}...`).start();

      const wallet = createWallet(`agent-${i + 1}`);

      try {
        const { vaultPda } = await vaultSdk.createVault(
          authority,
          wallet.keypair.publicKey,
          DEFAULT_POLICY.maxPerTx,
          DEFAULT_POLICY.maxDaily,
          DEFAULT_POLICY.cooldownSeconds
        );

        setVaultPda(wallet.id, vaultPda);

        // Deposit funds into vault
        if (depositSol > 0) {
          await vaultSdk.deposit(
            authority,
            new PublicKey(vaultPda),
            Math.round(depositSol * LAMPORTS_PER_SOL)
          );
        }

        // Fund agent wallet with SOL for tx fees
        const connection = new Connection(SOLANA_RPC_URL, "confirmed");
        const feeAmount = 0.01 * LAMPORTS_PER_SOL;
        const { blockhash } = await connection.getLatestBlockhash();
        const fundTx = new Transaction({
          recentBlockhash: blockhash,
          feePayer: authority.publicKey,
        }).add(
          SystemProgram.transfer({
            fromPubkey: authority.publicKey,
            toPubkey: wallet.keypair.publicKey,
            lamports: feeAmount,
          })
        );
        fundTx.sign(authority);
        const fundSig = await connection.sendRawTransaction(fundTx.serialize());
        await connection.confirmTransaction(fundSig, "confirmed");

        agents.push({
          id: wallet.id,
          vaultPda,
          keypair: wallet.keypair,
        });

        spinner.succeed(
          `Agent ${i + 1}: ${chalk.cyan(wallet.id)} | Vault: ${chalk.yellow(
            vaultPda.slice(0, 12) + "..."
          )} | ${depositSol} SOL`
        );
      } catch (err: any) {
        spinner.fail(`Agent ${i + 1} setup failed: ${err.message}`);
      }
    }

    if (agents.length === 0) {
      console.error(chalk.red("No agents were set up successfully."));
      return;
    }

    console.log(chalk.bold.cyan(`\n[AGENT] Running ${agents.length} agents in parallel...\n`));

    // Run all agents concurrently
    const tasks = [
      "You are Agent 1. Check your vault balance and policy limits. Make a small test withdrawal of 0.001 SOL to prove the system works. Report your status.",
      "You are Agent 2. Check your vault status. Try to withdraw 0.002 SOL. Then check your remaining daily allowance.",
      "You are Agent 3. Check your vault balance. Test the policy limits by first checking if 0.001 SOL is allowed, then withdrawing it. Report all findings.",
    ];

    await Promise.allSettled(
      agents.map((agent, i) =>
        runAgent({
          agentId: agent.id,
          agentKeypair: agent.keypair,
          vaultPda: agent.vaultPda,
          task: opts.task || tasks[i] || tasks[0],
          maxIterations: 5,
        })
      )
    );

    console.log(chalk.bold.green("\n[OK] All agents completed."));
  });
