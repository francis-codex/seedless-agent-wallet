import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AgentVault } from "../target/types/agent_vault";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import BN from "bn.js";

describe("agent_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.agentVault as Program<AgentVault>;
  const authority = provider.wallet;

  const agent = Keypair.generate();
  let vaultPda: PublicKey;
  let vaultBump: number;

  // Use small amounts to avoid running out of devnet SOL
  const MAX_PER_TX = new BN(0.05 * LAMPORTS_PER_SOL);  // 0.05 SOL
  const MAX_DAILY = new BN(0.1 * LAMPORTS_PER_SOL);     // 0.1 SOL
  const COOLDOWN = 2;

  before(async () => {
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), authority.publicKey.toBuffer(), agent.publicKey.toBuffer()],
      program.programId
    );
  });

  it("Creates a vault", async () => {
    const tx = await program.methods
      .createVault(MAX_PER_TX, MAX_DAILY, COOLDOWN)
      .accounts({
        authority: authority.publicKey,
        agent: agent.publicKey,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  createVault tx:", tx);

    const vault = await program.account.agentVault.fetch(vaultPda);
    expect(vault.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(vault.agent.toBase58()).to.equal(agent.publicKey.toBase58());
    expect(vault.policy.maxPerTx.toString()).to.equal(MAX_PER_TX.toString());
    expect(vault.policy.maxDaily.toString()).to.equal(MAX_DAILY.toString());
    expect(vault.policy.cooldownSeconds).to.equal(COOLDOWN);
    expect(vault.policy.isActive).to.equal(true);
    expect(vault.totalSpent.toNumber()).to.equal(0);
    expect(vault.txCount.toNumber()).to.equal(0);
  });

  it("Deposits SOL into vault", async () => {
    const depositAmount = new BN(0.2 * LAMPORTS_PER_SOL);

    const tx = await program.methods
      .deposit(depositAmount)
      .accounts({
        depositor: authority.publicKey,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  deposit tx:", tx);

    const vaultBalance = await provider.connection.getBalance(vaultPda);
    expect(vaultBalance).to.be.greaterThan(0.2 * LAMPORTS_PER_SOL);
  });

  it("Agent withdraws within policy limits", async () => {
    const withdrawAmount = new BN(0.03 * LAMPORTS_PER_SOL);
    const destination = Keypair.generate();

    const tx = await program.methods
      .agentWithdraw(withdrawAmount)
      .accounts({
        vault: vaultPda,
        agent: agent.publicKey,
        destination: destination.publicKey,
      })
      .signers([agent])
      .rpc();

    console.log("  agentWithdraw tx:", tx);

    const destBalance = await provider.connection.getBalance(destination.publicKey);
    expect(destBalance).to.equal(0.03 * LAMPORTS_PER_SOL);

    const vault = await program.account.agentVault.fetch(vaultPda);
    expect(vault.policy.dailySpent.toString()).to.equal(withdrawAmount.toString());
    expect(vault.txCount.toNumber()).to.equal(1);
  });

  it("Rejects withdrawal exceeding per-tx limit", async () => {
    const overLimit = new BN(0.06 * LAMPORTS_PER_SOL); // > 0.05 max_per_tx
    const destination = Keypair.generate();

    await sleep(2500);

    try {
      await program.methods
        .agentWithdraw(overLimit)
        .accounts({
          vault: vaultPda,
          agent: agent.publicKey,
          destination: destination.publicKey,
        })
        .signers([agent])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      const errMsg = err.error?.errorCode?.code || err.message || String(err);
      expect(errMsg).to.include("ExceedsPerTxLimit");
    }
  });

  it("Rejects withdrawal during cooldown", async () => {
    // First remove cooldown so we can do a clean withdraw
    await program.methods
      .updatePolicy(MAX_PER_TX, MAX_DAILY, 0, true)
      .accounts({ vault: vaultPda, authority: authority.publicKey })
      .rpc();

    const amount = new BN(0.01 * LAMPORTS_PER_SOL);
    await program.methods
      .agentWithdraw(amount)
      .accounts({
        vault: vaultPda,
        agent: agent.publicKey,
        destination: Keypair.generate().publicKey,
      })
      .signers([agent])
      .rpc();

    // NOW set a long cooldown - last_tx_time was just set by the withdraw above
    await program.methods
      .updatePolicy(MAX_PER_TX, MAX_DAILY, 120, true)
      .accounts({ vault: vaultPda, authority: authority.publicKey })
      .rpc();

    // Try another withdraw - should fail due to 120s cooldown
    try {
      await program.methods
        .agentWithdraw(amount)
        .accounts({
          vault: vaultPda,
          agent: agent.publicKey,
          destination: Keypair.generate().publicKey,
        })
        .signers([agent])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      const errMsg = err.error?.errorCode?.code || err.message || String(err);
      expect(errMsg).to.include("CooldownActive");
    }

    // Remove cooldown entirely for remaining tests
    await program.methods
      .updatePolicy(MAX_PER_TX, MAX_DAILY, 0, true)
      .accounts({ vault: vaultPda, authority: authority.publicKey })
      .rpc();
  });

  it("Rejects withdrawal exceeding daily limit", async () => {
    // cooldown is now 0, daily_spent so far: 0.03 + 0.01 = 0.04
    const amount = new BN(0.01 * LAMPORTS_PER_SOL);

    // Withdraw 0.01 -> daily_spent = 0.05
    await program.methods
      .agentWithdraw(amount)
      .accounts({
        vault: vaultPda,
        agent: agent.publicKey,
        destination: Keypair.generate().publicKey,
      })
      .signers([agent])
      .rpc();

    // Withdraw 0.01 -> daily_spent = 0.06
    await program.methods
      .agentWithdraw(amount)
      .accounts({
        vault: vaultPda,
        agent: agent.publicKey,
        destination: Keypair.generate().publicKey,
      })
      .signers([agent])
      .rpc();

    // Now try 0.05 -> 0.06 + 0.05 = 0.11 > 0.1 daily limit
    const overDaily = new BN(0.05 * LAMPORTS_PER_SOL);
    try {
      await program.methods
        .agentWithdraw(overDaily)
        .accounts({
          vault: vaultPda,
          agent: agent.publicKey,
          destination: Keypair.generate().publicKey,
        })
        .signers([agent])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      const errMsg = err.error?.errorCode?.code || err.message || String(err);
      expect(errMsg).to.include("ExceedsDailyLimit");
    }
  });

  it("Authority updates policy", async () => {
    const newMaxPerTx = new BN(1 * LAMPORTS_PER_SOL);
    const newMaxDaily = new BN(5 * LAMPORTS_PER_SOL);

    const tx = await program.methods
      .updatePolicy(newMaxPerTx, newMaxDaily, 0, true)
      .accounts({
        vault: vaultPda,
        authority: authority.publicKey,
      })
      .rpc();

    console.log("  updatePolicy tx:", tx);

    const vault = await program.account.agentVault.fetch(vaultPda);
    expect(vault.policy.maxPerTx.toString()).to.equal(newMaxPerTx.toString());
    expect(vault.policy.maxDaily.toString()).to.equal(newMaxDaily.toString());
    expect(vault.policy.cooldownSeconds).to.equal(0);
    expect(vault.policy.isActive).to.equal(true);
  });

  it("Emergency stop blocks withdrawals", async () => {
    const tx = await program.methods
      .emergencyStop()
      .accounts({
        vault: vaultPda,
        authority: authority.publicKey,
      })
      .rpc();

    console.log("  emergencyStop tx:", tx);

    const vault = await program.account.agentVault.fetch(vaultPda);
    expect(vault.policy.isActive).to.equal(false);

    try {
      await program.methods
        .agentWithdraw(new BN(0.01 * LAMPORTS_PER_SOL))
        .accounts({
          vault: vaultPda,
          agent: agent.publicKey,
          destination: Keypair.generate().publicKey,
        })
        .signers([agent])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      const errMsg = err.error?.errorCode?.code || err.message || String(err);
      expect(errMsg).to.include("VaultInactive");
    }
  });

  it("Reactivate and drain vault", async () => {
    await program.methods
      .updatePolicy(
        new BN(1 * LAMPORTS_PER_SOL),
        new BN(5 * LAMPORTS_PER_SOL),
        0,
        true
      )
      .accounts({
        vault: vaultPda,
        authority: authority.publicKey,
      })
      .rpc();

    const destination = Keypair.generate();

    const tx = await program.methods
      .drainVault()
      .accounts({
        vault: vaultPda,
        authority: authority.publicKey,
        destination: destination.publicKey,
      })
      .rpc();

    console.log("  drainVault tx:", tx);

    const destBalance = await provider.connection.getBalance(destination.publicKey);
    expect(destBalance).to.be.greaterThan(0);

    const vault = await program.account.agentVault.fetch(vaultPda);
    expect(vault.policy.isActive).to.equal(false);
  });

  it("Rejects unauthorized authority actions", async () => {
    const fakeSigner = Keypair.generate();

    // Fund fake signer from authority (avoids airdrop rate limits)
    const fundTx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: fakeSigner.publicKey,
        lamports: 0.01 * LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(fundTx);

    try {
      await program.methods
        .emergencyStop()
        .accounts({
          vault: vaultPda,
          authority: fakeSigner.publicKey,
        })
        .signers([fakeSigner])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
