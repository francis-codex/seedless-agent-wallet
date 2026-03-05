import { PublicKey } from "@solana/web3.js";

export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.HELIUS_RPC_URL ||
  "https://api.devnet.solana.com";

export const PROGRAM_ID = new PublicKey(
  "697JZH3975kVFxUCdtMqPejbagTN4VihtGde5b9k8VdN"
);

export const VAULT_SEED = Buffer.from("vault");

export const DEFAULT_POLICY = {
  maxPerTx: 0.5 * 1e9, // 0.5 SOL in lamports
  maxDaily: 2 * 1e9, // 2 SOL in lamports
  cooldownSeconds: 10,
};

export const LAMPORTS_PER_SOL = 1_000_000_000;
