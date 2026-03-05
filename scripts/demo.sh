#!/bin/bash
set -e

echo "[LAUNCH] Seedless Agent Wallet - Demo"
echo "================================"
echo ""

CLI="npx tsx src/cli/index.ts"

echo "[1] Creating agent wallet..."
$CLI create-wallet --label demo-agent 2>&1 | tee /tmp/seedless-demo.log
AGENT_ID=$(grep "ID:" /tmp/seedless-demo.log | awk '{print $2}')
echo ""

echo "[2] Creating vault with policy enforcement..."
echo "   (0.5 SOL max/tx, 2 SOL max/day, 10s cooldown)"
$CLI create-vault $AGENT_ID --deposit 0.5
echo ""

echo "[3] Running autonomous AI agent..."
$CLI run-agent $AGENT_ID --iterations 5
echo ""

echo "[4] Viewing agent action log..."
$CLI observe
echo ""

echo "[OK] Demo complete!"
echo ""
echo "Try these next:"
echo "  $CLI multi-agent --count 3    # Run 3 agents in parallel"
echo "  $CLI emergency-stop <vault>   # Emergency stop a vault"
