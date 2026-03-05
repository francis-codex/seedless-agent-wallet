import { Keypair, PublicKey } from "@solana/web3.js";

export interface AgentWallet {
  id: string;
  label: string;
  publicKey: string;
  keypair: Keypair;
  createdAt: number;
  vaultPda?: string;
}

export interface VaultInfo {
  address: string;
  authority: string;
  agent: string;
  policy: PolicyInfo;
  totalSpent: number;
  txCount: number;
  balance: number;
}

export interface PolicyInfo {
  maxPerTx: number;
  maxDaily: number;
  dailySpent: number;
  lastReset: number;
  cooldownSeconds: number;
  lastTxTime: number;
  isActive: boolean;
}

export interface AgentAction {
  timestamp: number;
  agentId: string;
  action: string;
  details: Record<string, unknown>;
  txSignature?: string;
  success: boolean;
  error?: string;
}
