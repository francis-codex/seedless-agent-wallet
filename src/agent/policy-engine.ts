import { PublicKey } from "@solana/web3.js";
import { fetchVault } from "../vault/index.js";
import { VaultInfo } from "../shared/types.js";

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  vault?: VaultInfo;
}

/**
 * Client-side pre-flight policy check before submitting on-chain.
 * This saves gas by catching violations early.
 */
export async function checkWithdrawal(
  vaultPda: string,
  amount: number
): Promise<PolicyCheckResult> {
  const vault = await fetchVault(new PublicKey(vaultPda));

  if (!vault) {
    return { allowed: false, reason: "Vault not found" };
  }

  if (!vault.policy.isActive) {
    return { allowed: false, reason: "Vault is inactive (emergency stop engaged)", vault };
  }

  if (amount > vault.policy.maxPerTx) {
    return {
      allowed: false,
      reason: `Amount ${amount} exceeds per-tx limit of ${vault.policy.maxPerTx} lamports`,
      vault,
    };
  }

  // Check daily limit (approximate - on-chain has authoritative check)
  const now = Math.floor(Date.now() / 1000);
  let dailySpent = vault.policy.dailySpent;

  // If 24h have passed since last reset, daily counter would reset on-chain
  if (now - vault.policy.lastReset >= 86_400) {
    dailySpent = 0;
  }

  if (dailySpent + amount > vault.policy.maxDaily) {
    return {
      allowed: false,
      reason: `Would exceed daily limit: ${dailySpent + amount} > ${vault.policy.maxDaily} lamports`,
      vault,
    };
  }

  // Check cooldown
  if (vault.policy.cooldownSeconds > 0 && vault.policy.lastTxTime > 0) {
    const elapsed = now - vault.policy.lastTxTime;
    if (elapsed < vault.policy.cooldownSeconds) {
      const remaining = vault.policy.cooldownSeconds - elapsed;
      return {
        allowed: false,
        reason: `Cooldown active: ${remaining}s remaining`,
        vault,
      };
    }
  }

  // Check balance (subtract rent-exempt minimum ~0.002 SOL)
  const rentExempt = 2_000_000; // approximate
  const available = vault.balance - rentExempt;
  if (amount > available) {
    return {
      allowed: false,
      reason: `Insufficient funds: ${available} available, ${amount} requested`,
      vault,
    };
  }

  return { allowed: true, vault };
}

export function formatPolicy(vault: VaultInfo): string {
  const p = vault.policy;
  const lines = [
    `  Status: ${p.isActive ? "ACTIVE" : "STOPPED"}`,
    `  Max per TX: ${(p.maxPerTx / 1e9).toFixed(4)} SOL`,
    `  Max daily: ${(p.maxDaily / 1e9).toFixed(4)} SOL`,
    `  Daily spent: ${(p.dailySpent / 1e9).toFixed(4)} SOL`,
    `  Cooldown: ${p.cooldownSeconds}s`,
    `  Total spent: ${(vault.totalSpent / 1e9).toFixed(4)} SOL`,
    `  TX count: ${vault.txCount}`,
    `  Balance: ${(vault.balance / 1e9).toFixed(4)} SOL`,
  ];
  return lines.join("\n");
}
