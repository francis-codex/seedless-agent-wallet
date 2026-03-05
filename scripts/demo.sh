#!/bin/bash
set -e

echo ""
echo "Seedless Agent Wallet - Live Demo"
echo "Solana Devnet | On-Chain Policy Enforcement"
echo ""

CLI="npx tsx src/cli/index.ts"

# Step 1: Create wallet
echo "[1/5] Creating agent wallet..."
$CLI create-wallet --label demo-agent 2>&1 | tee /tmp/seedless-demo.log
AGENT_ID=$(grep "ID:" /tmp/seedless-demo.log | awk '{print $2}')
echo ""

# Step 2: Fund agent wallet for tx fees
echo "[2/5] Funding agent wallet with 0.05 SOL for transaction fees..."
$CLI fund-wallet $AGENT_ID --amount 0.05
echo ""

# Step 3: Create vault with policy
echo "[3/5] Creating vault with policy enforcement..."
echo "    Max per TX: 0.5 SOL | Max daily: 2 SOL | Cooldown: 10s"
$CLI create-vault $AGENT_ID --deposit 0.5
echo ""

# Step 4: Run autonomous agent
echo "[4/5] Running autonomous AI agent (Claude Opus)..."
echo "    The agent will check its vault, verify policy, and execute a withdrawal."
echo ""
$CLI run-agent $AGENT_ID -i 10
echo ""

# Step 5: Show action log
echo "[5/5] Agent action log:"
$CLI observe
echo ""

echo "Demo complete."
echo ""
echo "Next steps:"
echo "  $CLI multi-agent --count 3       # Run 3 agents in parallel"
echo "  $CLI emergency-stop <vault-pda>  # Emergency stop a vault"
echo "  $CLI list-wallets                # List all wallets"
