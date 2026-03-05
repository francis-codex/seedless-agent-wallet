# Architecture

## System Overview

```
+-----------------------------------------------------+
|                    CLI (Commander.js)              |
|  create-wallet | fund | create-vault | run-agent  |
|  multi-agent | observe | emergency-stop | set-policy |
+---------------------------------+------------------+
                                 |
             +-------------------+-----------+
             |                               |
    +------+------+            +-------+-------+
    | Agent Runtime|            | Vault SDK     |
    | (AI + Tools) |            | (Anchor Client)|
    | Claude LLM   |            |               |
    +------+------+            +-------+-------+
           |                           |
    +------+------+            +-------+-------+
    | Policy Engine|            | Solana Devnet |
    | (Pre-flight) |            |               |
    +------+------+            | +----------+  |
           |                   | |agent_vault  |
           +-------------------> | Program    |
                               | +----------+  |
                               +----------------+
```

## Components

### 1. On-Chain Program (`agent_vault`)

Anchor program deployed on Solana devnet. Manages vault PDAs with policy-enforced withdrawals.

**PDA Derivation:** `["vault", authority_pubkey, agent_pubkey]`

**Instructions:**
- `create_vault` - Initialize vault with policy config
- `deposit` - Anyone can deposit SOL
- `agent_withdraw` - Agent withdraws with policy checks
- `update_policy` - Authority updates policy params
- `emergency_stop` - Authority kills all withdrawals
- `drain_vault` - Authority recovers all funds

**Policy checks (on-chain):**
1. Vault is active (kill switch)
2. Amount <= max_per_tx
3. Cooldown elapsed since last tx
4. Daily reset if 24h passed
5. daily_spent + amount <= max_daily
6. Sufficient vault balance (minus rent)

### 2. Vault SDK (`src/vault/`)

TypeScript client wrapping the Anchor program. Provides typed functions for all instructions plus `fetchVault()` for reading on-chain state.

### 3. Agent Runtime (`src/agent/`)

- **wallet-manager.ts** - In-memory keypair management (generate, store, retrieve)
- **policy-engine.ts** - Client-side pre-flight policy checks (saves gas)
- **custom-tools.ts** - AI tool definitions for the LLM (Vercel AI SDK `tool()`)
- **index.ts** - Agent loop using `generateText()` with Claude

### 4. CLI (`src/cli/`)

Commander.js commands for all operations. The CLI is the primary interface for:
- Setting up wallets and vaults
- Running single or multi-agent sessions
- Observing agent actions in real-time
- Emergency controls

## Data Flow

### Agent Withdrawal Flow
```
Agent LLM decides to withdraw
    |
    v
custom-tools.ts: withdraw_from_vault()
    |
    v
policy-engine.ts: checkWithdrawal() [client-side pre-flight]
    | fail > return error to LLM
    v pass
vault/index.ts: agentWithdraw() [submits tx]
    |
    v
agent_vault program: agent_withdraw [on-chain enforcement]
    | fail > AnchorError returned
    v pass
SOL transferred, accounting updated
    |
    v
logger.ts: logAction() [structured log]
```

## Security Model

- **Authority**: Human owner who creates vaults and sets policies. Only authority can update_policy, emergency_stop, and drain_vault.
- **Agent**: AI-controlled keypair that can only withdraw within policy bounds. Cannot modify its own limits.
- **Vault PDA**: Program-derived account holding funds. Not a regular account - funds can only be moved via program instructions.
- **Kill switch**: Authority can instantly disable any vault, blocking all agent operations.

## Multi-Agent Architecture

Each agent gets:
1. Independent `Keypair` (wallet)
2. Independent vault PDA with its own policy
3. Independent AI loop with Claude
4. Shared structured action log for observation

Agents run concurrently via `Promise.allSettled()` and cannot interfere with each other's vaults.
