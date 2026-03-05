import chalk from "chalk";
import { AgentAction } from "./types.js";

const actionLog: AgentAction[] = [];

export function logAction(action: AgentAction): void {
  actionLog.push(action);

  const time = new Date(action.timestamp).toISOString().slice(11, 19);
  const status = action.success
    ? chalk.green("[OK]")
    : chalk.red("[FAIL]");
  const agent = chalk.cyan(`[${action.agentId}]`);
  const act = chalk.yellow(action.action);

  let line = `${chalk.gray(time)} ${status} ${agent} ${act}`;

  if (action.txSignature) {
    line += ` ${chalk.gray(action.txSignature.slice(0, 16) + "...")}`;
  }

  if (action.error) {
    line += ` ${chalk.red(action.error)}`;
  }

  console.log(line);
}

export function getActionLog(): AgentAction[] {
  return [...actionLog];
}

export function getAgentLog(agentId: string): AgentAction[] {
  return actionLog.filter((a) => a.agentId === agentId);
}
