import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { Keypair } from "@solana/web3.js";
import { createAgentTools } from "./custom-tools.js";
import { logAction } from "../shared/logger.js";
import chalk from "chalk";
const MODEL = "claude-opus-4-6";

const SYSTEM_PROMPT = `You are an autonomous AI agent managing a Solana wallet on devnet.
You have access to a vault with policy-enforced spending limits.

Your capabilities:
- Check your vault balance and policy limits
- Withdraw SOL from the vault within policy constraints
- Transfer SOL to other addresses
- Monitor your spending against daily and per-transaction limits

Rules:
1. Always check your vault balance and policy limits BEFORE attempting withdrawals
2. Never try to exceed your per-transaction or daily limits
3. If a withdrawal fails, check why and adapt your strategy
4. Log your reasoning for each financial decision
5. Be conservative with funds - only move what's necessary

IMPORTANT: Use your tools to complete the task fully. Call multiple tools in sequence before writing your final report. Do NOT write your report until you have completed all required actions using the available tools. Only provide your final text summary after all tool calls are done.

You are running on Solana devnet. All funds are test SOL.`;

export interface AgentConfig {
  agentId: string;
  agentKeypair: Keypair;
  vaultPda: string;
  task?: string;
  maxIterations?: number;
}

export async function runAgent(config: AgentConfig): Promise<void> {
  const {
    agentId,
    agentKeypair,
    vaultPda,
    task = "Check your vault balance, review your policy limits, and report your current financial status. If you have funds available, demonstrate a small withdrawal of 0.001 SOL to a random address to prove the system works.",
    maxIterations = 5,
  } = config;

  const tools = createAgentTools(agentId, agentKeypair, vaultPda);

  console.log(chalk.bold.cyan(`\n[AGENT] Agent ${agentId} starting...`));
  console.log(chalk.gray(`   Wallet: ${agentKeypair.publicKey.toBase58()}`));
  console.log(chalk.gray(`   Vault:  ${vaultPda}`));
  console.log(chalk.gray(`   Task:   ${task}\n`));

  logAction({
    timestamp: Date.now(),
    agentId,
    action: "agent_start",
    details: { task, wallet: agentKeypair.publicKey.toBase58(), vault: vaultPda },
    success: true,
  });

  try {
    const result = await generateText({
      model: anthropic(MODEL),
      system: SYSTEM_PROMPT,
      prompt: task,
      tools,
      stopWhen: stepCountIs(maxIterations),
      onStepFinish: (step) => {
        const toolCalls = step.toolCalls?.length || 0;
        if (toolCalls > 0) {
          console.log(chalk.gray(`   [step] ${toolCalls} tool call(s) completed`));
        }
      },
    });

    console.log(chalk.bold.green(`\n[REPORT] Agent ${agentId} completed (${result.steps?.length || 0} steps):`));
    console.log(chalk.white(result.text));

    logAction({
      timestamp: Date.now(),
      agentId,
      action: "agent_complete",
      details: {
        steps: result.steps?.length || 0,
        report: result.text.slice(0, 200),
      },
      success: true,
    });
  } catch (err: any) {
    console.error(chalk.red(`\n[FAIL] Agent ${agentId} error: ${err.message}`));

    logAction({
      timestamp: Date.now(),
      agentId,
      action: "agent_error",
      details: { error: err.message },
      success: false,
      error: err.message,
    });
  }
}
