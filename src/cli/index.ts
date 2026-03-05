#!/usr/bin/env node
import { Command } from "commander";
import dotenv from "dotenv";

dotenv.config();

const program = new Command();

program
  .name("seedless-agent")
  .description("Autonomous AI agent wallet on Solana with on-chain policy enforcement")
  .version("0.1.0");

// Import commands
import { createWalletCmd } from "./commands/create-wallet.js";
import { fundWalletCmd } from "./commands/fund-wallet.js";
import { createVaultCmd } from "./commands/create-vault.js";
import { setPolicyCmd } from "./commands/set-policy.js";
import { runAgentCmd } from "./commands/run-agent.js";
import { multiAgentCmd } from "./commands/multi-agent.js";
import { observeCmd } from "./commands/observe.js";
import { emergencyStopCmd } from "./commands/emergency-stop.js";
import { listWalletsCmd } from "./commands/list-wallets.js";

program.addCommand(createWalletCmd);
program.addCommand(fundWalletCmd);
program.addCommand(createVaultCmd);
program.addCommand(setPolicyCmd);
program.addCommand(runAgentCmd);
program.addCommand(multiAgentCmd);
program.addCommand(observeCmd);
program.addCommand(emergencyStopCmd);
program.addCommand(listWalletsCmd);

program.parse();
