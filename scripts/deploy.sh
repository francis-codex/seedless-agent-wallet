#!/bin/bash
set -e

echo "[BUILD] Building Anchor program..."
anchor build

echo ""
echo "[LAUNCH] Deploying to devnet..."
anchor deploy --provider.cluster devnet

echo ""
echo "[OK] Deployed!"
echo "Program ID: $(solana-keygen pubkey target/deploy/agent_vault-keypair.json)"
