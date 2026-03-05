---
name: seedless-agent-wallet
version: 0.1.0
description: Autonomous AI agent wallet on Solana with on-chain policy enforcement
author: seedless labs
capabilities:
  - vault_management
  - policy_enforcement
  - autonomous_transactions
  - multi_agent_orchestration
tools:
  - check_vault_balance
  - withdraw_from_vault
  - check_policy_limits
  - transfer_sol
  - get_wallet_info
llm: claude-opus-4-6
chain: solana-devnet
---

# Seedless Agent Wallet - Skills

## Overview

This agent manages an autonomous Solana wallet with on-chain policy enforcement via an Anchor program. The agent can check balances, make policy-compliant withdrawals, and transfer SOL - all within configurable spending limits enforced at the smart contract level.

## Skills

### 1. `check_vault_balance`
**Description:** Query the vault's on-chain state including balance, policy configuration, and spending history.

**When to use:** Before any withdrawal to understand current limits and available funds.

**Parameters:** None

**Example output:**
```json
{
  "balance_sol": "2.5000",
  "is_active": true,
  "daily_remaining_sol": "1.7500",
  "policy": "Max/TX: 0.5 SOL, Max/Day: 2.0 SOL, Cooldown: 10s"
}
```

### 2. `withdraw_from_vault`
**Description:** Withdraw SOL from the policy-enforced vault to a destination address. Pre-flight checks validate against per-transaction limits, daily limits, and cooldown before submitting on-chain.

**When to use:** When the agent needs to move funds to fulfill a task.

**Parameters:**
- `amount_sol` (number): Amount of SOL to withdraw
- `destination` (string): Solana address to receive the funds

**Constraints:**
- Must not exceed `max_per_tx` policy limit
- Must not exceed remaining `max_daily` allowance
- Must respect cooldown period between transactions
- Vault must be active (not emergency-stopped)

**Example:**
```json
{
  "amount_sol": 0.1,
  "destination": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}
```

### 3. `check_policy_limits`
**Description:** Pre-flight check to see if a specific withdrawal amount would be allowed by the current policy, without executing the transaction.

**When to use:** Before attempting a withdrawal to avoid wasting gas on a rejected transaction.

**Parameters:**
- `amount_sol` (number): Amount of SOL to check

### 4. `transfer_sol`
**Description:** Direct SOL transfer from the agent's own wallet (not the vault). Useful for small operations where the agent has been directly funded.

**Parameters:**
- `amount_sol` (number): Amount of SOL to transfer
- `destination` (string): Destination Solana address

### 5. `get_wallet_info`
**Description:** Get the agent's wallet address, balance, and associated vault address.

**Parameters:** None

## Policy Enforcement

All vault withdrawals are enforced on-chain by the `agent_vault` Anchor program:

| Policy | Description | Default |
|--------|-------------|---------|
| `max_per_tx` | Maximum lamports per single withdrawal | 500,000,000 (0.5 SOL) |
| `max_daily` | Maximum lamports across all withdrawals in 24h | 2,000,000,000 (2 SOL) |
| `cooldown_seconds` | Minimum seconds between withdrawals | 10 |
| `is_active` | Kill switch - authority can disable all withdrawals | true |

## Safety Features

- **On-chain enforcement**: Policy limits are checked in the Anchor program, not just client-side
- **Pre-flight validation**: Client checks policy before submitting to save gas
- **Emergency stop**: Authority can instantly freeze any vault
- **Drain recovery**: Authority can recover all vault funds at any time
- **Structured logging**: Every agent action is logged with timestamps and tx signatures
