import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import { getWallet, getAuthorityKeypair, getBalance } from "../../agent/wallet-manager.js";
import { SOLANA_RPC_URL } from "../../shared/constants.js";

export const fundWalletCmd = new Command("fund-wallet")
  .description("Fund an agent wallet with SOL from the authority wallet")
  .argument("<id>", "Agent wallet ID")
  .option("-a, --amount <sol>", "Amount of SOL to send", "0.1")
  .action(async (id, opts) => {
    const wallet = getWallet(id);
    if (!wallet) {
      console.error(chalk.red(`Wallet ${id} not found. Create one first.`));
      process.exit(1);
    }

    const amount = parseFloat(opts.amount);
    const spinner = ora(`Funding ${wallet.label} with ${amount} SOL...`).start();

    try {
      const connection = new Connection(SOLANA_RPC_URL, "confirmed");
      const authority = getAuthorityKeypair();
      const lamports = Math.round(amount * LAMPORTS_PER_SOL);

      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: authority.publicKey,
      }).add(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: wallet.keypair.publicKey,
          lamports,
        })
      );

      tx.sign(authority);
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      const balance = await getBalance(wallet.publicKey);
      spinner.succeed(chalk.green(`Funded ${wallet.label}`));
      console.log(`  TX:      ${chalk.gray(sig)}`);
      console.log(`  Balance: ${chalk.yellow(balance.toFixed(4) + " SOL")}`);
    } catch (err: any) {
      spinner.fail(chalk.red(`Failed: ${err.message}`));
    }
  });
