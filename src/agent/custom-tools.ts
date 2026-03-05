import { tool, jsonSchema } from "ai";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import * as vault from "../vault/index.js";
import { checkWithdrawal, formatPolicy } from "./policy-engine.js";
import { logAction } from "../shared/logger.js";

const emptyParams = jsonSchema({
  type: "object" as const,
  properties: {},
});

const withdrawParams = jsonSchema({
  type: "object" as const,
  properties: {
    amount_sol: { type: "number" as const, description: "Amount of SOL to withdraw" },
    destination: { type: "string" as const, description: "Solana address to send SOL to" },
  },
  required: ["amount_sol", "destination"],
});

const checkParams = jsonSchema({
  type: "object" as const,
  properties: {
    amount_sol: { type: "number" as const, description: "Amount of SOL to check" },
  },
  required: ["amount_sol"],
});

const transferParams = jsonSchema({
  type: "object" as const,
  properties: {
    amount_sol: { type: "number" as const, description: "Amount of SOL to transfer" },
    destination: { type: "string" as const, description: "Solana address to send SOL to" },
  },
  required: ["amount_sol", "destination"],
});

/**
 * Create the set of tools available to the AI agent.
 * Each tool maps to a vault/wallet operation.
 */
export function createAgentTools(agentId: string, agentKeypair: Keypair, vaultPda: string) {
  return {
    check_vault_balance: tool({
      description:
        "Check the current balance and policy status of your vault. Call this before making withdrawals to understand your limits.",
      inputSchema: emptyParams,
      execute: async () => {
        try {
          const info = await vault.fetchVault(new PublicKey(vaultPda));
          if (!info) return { error: "Vault not found" };

          logAction({
            timestamp: Date.now(),
            agentId,
            action: "check_vault_balance",
            details: { balance: info.balance, dailySpent: info.policy.dailySpent },
            success: true,
          });

          return {
            balance_sol: (info.balance / LAMPORTS_PER_SOL).toFixed(4),
            balance_lamports: info.balance,
            policy: formatPolicy(info),
            is_active: info.policy.isActive,
            daily_remaining_sol: (
              (info.policy.maxDaily - info.policy.dailySpent) /
              LAMPORTS_PER_SOL
            ).toFixed(4),
          };
        } catch (err: any) {
          return { error: err.message };
        }
      },
    }),

    withdraw_from_vault: tool({
      description:
        "Withdraw SOL from your vault to a destination address. Amount is in SOL. The withdrawal must comply with policy limits (per-tx max, daily max, cooldown).",
      inputSchema: withdrawParams,
      execute: async ({ amount_sol, destination }: { amount_sol: number; destination: string }) => {
        const lamports = Math.round(amount_sol * LAMPORTS_PER_SOL);

        // Pre-flight policy check
        const check = await checkWithdrawal(vaultPda, lamports);
        if (!check.allowed) {
          logAction({
            timestamp: Date.now(),
            agentId,
            action: "withdraw_from_vault",
            details: { amount_sol, destination, reason: check.reason },
            success: false,
            error: check.reason,
          });
          return { error: `Policy violation: ${check.reason}` };
        }

        try {
          const destPubkey = new PublicKey(destination);
          const sig = await vault.agentWithdraw(
            agentKeypair,
            new PublicKey(vaultPda),
            lamports,
            destPubkey
          );

          logAction({
            timestamp: Date.now(),
            agentId,
            action: "withdraw_from_vault",
            details: { amount_sol, destination },
            txSignature: sig,
            success: true,
          });

          return {
            success: true,
            signature: sig,
            amount_sol,
            destination,
          };
        } catch (err: any) {
          logAction({
            timestamp: Date.now(),
            agentId,
            action: "withdraw_from_vault",
            details: { amount_sol, destination },
            success: false,
            error: err.message,
          });
          return { error: err.message };
        }
      },
    }),

    check_policy_limits: tool({
      description:
        "Check if a specific withdrawal amount would be allowed by the vault policy without actually executing it.",
      inputSchema: checkParams,
      execute: async ({ amount_sol }: { amount_sol: number }) => {
        const lamports = Math.round(amount_sol * LAMPORTS_PER_SOL);
        const check = await checkWithdrawal(vaultPda, lamports);

        logAction({
          timestamp: Date.now(),
          agentId,
          action: "check_policy_limits",
          details: { amount_sol, allowed: check.allowed },
          success: true,
        });

        return {
          amount_sol,
          allowed: check.allowed,
          reason: check.reason || "Within policy limits",
        };
      },
    }),

    transfer_sol: tool({
      description:
        "Transfer SOL from the agent's own wallet (not the vault) to a destination. Use this for small direct transfers if the agent wallet has been funded directly.",
      inputSchema: transferParams,
      execute: async ({ amount_sol, destination }: { amount_sol: number; destination: string }) => {
        try {
          const { Connection, SystemProgram, Transaction } = await import("@solana/web3.js");
          const connection = vault.getConnection();
          const lamports = Math.round(amount_sol * LAMPORTS_PER_SOL);

          const { blockhash } = await connection.getLatestBlockhash();
          const tx = new Transaction({
            recentBlockhash: blockhash,
            feePayer: agentKeypair.publicKey,
          }).add(
            SystemProgram.transfer({
              fromPubkey: agentKeypair.publicKey,
              toPubkey: new PublicKey(destination),
              lamports,
            })
          );

          tx.sign(agentKeypair);
          const sig = await connection.sendRawTransaction(tx.serialize());
          await connection.confirmTransaction(sig, "confirmed");

          logAction({
            timestamp: Date.now(),
            agentId,
            action: "transfer_sol",
            details: { amount_sol, destination },
            txSignature: sig,
            success: true,
          });

          return { success: true, signature: sig, amount_sol, destination };
        } catch (err: any) {
          logAction({
            timestamp: Date.now(),
            agentId,
            action: "transfer_sol",
            details: { amount_sol, destination },
            success: false,
            error: err.message,
          });
          return { error: err.message };
        }
      },
    }),

    get_wallet_info: tool({
      description:
        "Get information about the agent's own wallet address and balance.",
      inputSchema: emptyParams,
      execute: async () => {
        try {
          const connection = vault.getConnection();
          const balance = await connection.getBalance(agentKeypair.publicKey);

          logAction({
            timestamp: Date.now(),
            agentId,
            action: "get_wallet_info",
            details: { balance },
            success: true,
          });

          return {
            address: agentKeypair.publicKey.toBase58(),
            balance_sol: (balance / LAMPORTS_PER_SOL).toFixed(4),
            vault_address: vaultPda,
          };
        } catch (err: any) {
          return { error: err.message };
        }
      },
    }),
  };
}
