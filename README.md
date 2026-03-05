# Seedless Agent Wallet

Autonomous AI agent wallet on Solana with **on-chain policy enforcement**. Built for the Superteam Nigeria "DeFi Developer Challenge - Agentic Wallets for AI Agents" bounty.

## What Makes This Different

Most agent wallet implementations enforce spending limits in JavaScript config. This project enforces them **on-chain in an Anchor program** - the agent literally cannot overspend even if the client code is compromised.

### Key Features

- **On-chain Anchor program** (`agent_vault`) with per-tx limits, daily limits, cooldowns, and kill switch
- **Multi-agent support** - spawn N independent agents with their own wallets and policy-enforced vaults
- **Claude AI agent** - autonomous decision-making with Anthropic Claude via Vercel AI SDK
- **Pre-flight policy engine** - client-side validation before on-chain submission (saves gas)
- **Real-time observation** - structured action logging with `observe` command
- **Emergency stop** - authority can instantly freeze any vault

## Quick Start

### Prerequisites

- Node.js 18+
- Solana CLI
- Anchor CLI 0.31.1
- Anthropic API key

### Setup

```bash
git clone https://github.com/your-repo/seedless-agent-wallet.git
cd seedless-agent-wallet

# Install dependencies
yarn install

# Configure environment
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY and RPC URL

# The program is already deployed on devnet:
# Program ID: 697JZH3975kVFxUCdtMqPejbagTN4VihtGde5b9k8VdN
```

### Run the Demo

```bash
# One-command demo
bash scripts/demo.sh

# Or step by step:

# 1. Create an agent wallet
npx tsx src/cli/index.ts create-wallet --label my-agent

# 2. Create a vault with policy limits (deposits 0.5 SOL)
npx tsx src/cli/index.ts create-vault <agent-id>

# 3. Run the autonomous agent
npx tsx src/cli/index.ts run-agent <agent-id>

# 4. Observe agent actions
npx tsx src/cli/index.ts observe
```

### Multi-Agent Mode

```bash
# Spawn 3 independent agents with their own vaults
npx tsx src/cli/index.ts multi-agent --count 3 --deposit 0.2
```

### Emergency Stop

```bash
# Instantly freeze a vault
npx tsx src/cli/index.ts emergency-stop <vault-address>
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `create-wallet [--label <name>]` | Create a new agent wallet keypair |
| `fund-wallet <id> [--amount <sol>]` | Fund agent wallet from authority |
| `create-vault <agent-id> [options]` | Create on-chain vault with policy |
| `set-policy <vault-addr> [options]` | Update vault policy |
| `run-agent <agent-id> [--task <desc>]` | Run autonomous AI agent |
| `multi-agent [--count <n>]` | Spawn N independent agents |
| `observe [--agent <id>]` | View agent action logs |
| `emergency-stop <vault-addr>` | Kill switch - disable vault |
| `list-wallets` | List session wallets |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system architecture.

## On-Chain Program

The `agent_vault` Anchor program enforces:

- **Per-transaction limit** - max lamports per single withdrawal
- **Daily limit** - max lamports across all withdrawals in 24h (auto-resets)
- **Cooldown** - minimum seconds between withdrawals
- **Kill switch** - authority can disable all agent operations instantly
- **Drain** - authority can recover all vault funds at any time

Program ID: `697JZH3975kVFxUCdtMqPejbagTN4VihtGde5b9k8VdN`

## Tech Stack

- **On-chain**: Anchor 0.31.1 (Rust)
- **AI**: Anthropic Claude (claude-sonnet-4-20250514) via Vercel AI SDK
- **Runtime**: TypeScript, @solana/web3.js, @coral-xyz/anchor
- **CLI**: Commander.js, chalk, ora
- **Network**: Solana Devnet (Helius RPC)

## Testing

```bash
# Run on-chain program tests (10/10 passing)
anchor test --skip-local-validator --skip-deploy \
  --provider.cluster "https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
```

## SKILLS.md

See [SKILLS.md](SKILLS.md) for the Anthropic-standard agent skills definition.

## License

MIT
