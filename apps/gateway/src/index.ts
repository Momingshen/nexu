import { bootstrapGateway } from "./bootstrap.js";
import {
  runGatewayHealthLoops,
  runHeartbeatLoop,
  runPollLoop,
} from "./loops.js";
import { stopManagedOpenclawGateway } from "./openclaw-process.js";
import { createRuntimeState } from "./state.js";

const state = createRuntimeState();

async function main(): Promise<void> {
  await bootstrapGateway();

  runGatewayHealthLoops(state);
  void runHeartbeatLoop(state);
  await runPollLoop(state);
}

main().catch((error: unknown) => {
  stopManagedOpenclawGateway();
  console.error("[gateway] fatal error", {
    error: error instanceof Error ? error.message : "unknown_error",
  });
  process.exitCode = 1;
});
