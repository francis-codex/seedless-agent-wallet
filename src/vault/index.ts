import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import { PROGRAM_ID, VAULT_SEED, SOLANA_RPC_URL } from "../shared/constants.js";
import { VaultInfo, PolicyInfo } from "../shared/types.js";
import IDL from "../../target/idl/agent_vault.json" assert { type: "json" };

export function getConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, "confirmed");
}

export function getProgram(signer: Keypair): Program {
  const connection = getConnection();
  const wallet = new Wallet(signer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(IDL as any, provider);
}

export function getVaultPda(
  authority: PublicKey,
  agent: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, authority.toBuffer(), agent.toBuffer()],
    PROGRAM_ID
  );
}

export async function createVault(
  authority: Keypair,
  agentPubkey: PublicKey,
  maxPerTx: number,
  maxDaily: number,
  cooldownSeconds: number
): Promise<{ vaultPda: string; txSignature: string }> {
  const program = getProgram(authority);
  const [vaultPda] = getVaultPda(authority.publicKey, agentPubkey);

  const tx = await (program.methods as any)
    .createVault(new BN(maxPerTx), new BN(maxDaily), cooldownSeconds)
    .accounts({
      authority: authority.publicKey,
      agent: agentPubkey,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { vaultPda: vaultPda.toBase58(), txSignature: tx };
}

export async function deposit(
  depositor: Keypair,
  vaultPda: PublicKey,
  amount: number
): Promise<string> {
  const program = getProgram(depositor);

  return await (program.methods as any)
    .deposit(new BN(amount))
    .accounts({
      depositor: depositor.publicKey,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function agentWithdraw(
  agent: Keypair,
  vaultPda: PublicKey,
  amount: number,
  destination: PublicKey
): Promise<string> {
  const program = getProgram(agent);

  return await (program.methods as any)
    .agentWithdraw(new BN(amount))
    .accounts({
      vault: vaultPda,
      agent: agent.publicKey,
      destination,
    })
    .rpc();
}

export async function updatePolicy(
  authority: Keypair,
  vaultPda: PublicKey,
  maxPerTx: number,
  maxDaily: number,
  cooldownSeconds: number,
  isActive: boolean
): Promise<string> {
  const program = getProgram(authority);

  return await (program.methods as any)
    .updatePolicy(new BN(maxPerTx), new BN(maxDaily), cooldownSeconds, isActive)
    .accounts({
      vault: vaultPda,
      authority: authority.publicKey,
    })
    .rpc();
}

export async function emergencyStop(
  authority: Keypair,
  vaultPda: PublicKey
): Promise<string> {
  const program = getProgram(authority);

  return await (program.methods as any)
    .emergencyStop()
    .accounts({
      vault: vaultPda,
      authority: authority.publicKey,
    })
    .rpc();
}

export async function drainVault(
  authority: Keypair,
  vaultPda: PublicKey,
  destination: PublicKey
): Promise<string> {
  const program = getProgram(authority);

  return await (program.methods as any)
    .drainVault()
    .accounts({
      vault: vaultPda,
      authority: authority.publicKey,
      destination,
    })
    .rpc();
}

export async function fetchVault(vaultPda: PublicKey): Promise<VaultInfo | null> {
  const connection = getConnection();

  // Use a dummy keypair just for reading
  const dummy = Keypair.generate();
  const program = getProgram(dummy);

  try {
    const vault = await (program.account as any).agentVault.fetch(vaultPda);
    const balance = await connection.getBalance(vaultPda);

    return {
      address: vaultPda.toBase58(),
      authority: vault.authority.toBase58(),
      agent: vault.agent.toBase58(),
      policy: {
        maxPerTx: vault.policy.maxPerTx.toNumber(),
        maxDaily: vault.policy.maxDaily.toNumber(),
        dailySpent: vault.policy.dailySpent.toNumber(),
        lastReset: vault.policy.lastReset.toNumber(),
        cooldownSeconds: vault.policy.cooldownSeconds,
        lastTxTime: vault.policy.lastTxTime.toNumber(),
        isActive: vault.policy.isActive,
      },
      totalSpent: vault.totalSpent.toNumber(),
      txCount: vault.txCount.toNumber(),
      balance,
    };
  } catch {
    return null;
  }
}
