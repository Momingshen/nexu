import { registerPool } from "./api.js";
import { fetchInitialConfig } from "./config.js";
import { env, envWarnings } from "./env.js";
import { waitGatewayReady } from "./gateway-health.js";
import { BaseError, GatewayError, logger } from "./log.js";
import { startManagedOpenclawGateway } from "./openclaw-process.js";
import { pollLatestSkills } from "./skills.js";
import type { RuntimeState } from "./state.js";
import { runWithRetry } from "./utils.js";

async function registerPoolWithRetry(): Promise<void> {
  return runWithRetry(
    registerPool,
    ({ attempt, retryDelayMs, error }) => {
      const baseError = BaseError.from(error);
      logger.warn(
        GatewayError.from(
          {
            source: "bootstrap/register-pool",
            message: "pool registration failed; retrying",
            code: baseError.code,
          },
          {
            attempt,
            poolId: env.RUNTIME_POOL_ID,
            retryDelayMs,
            reason: baseError.message,
          },
        ).toJSON(),
        "pool registration failed; retrying",
      );
    },
    env.RUNTIME_MAX_BACKOFF_MS,
  );
}

async function fetchInitialConfigWithRetry(): Promise<void> {
  return runWithRetry(
    fetchInitialConfig,
    ({ attempt, retryDelayMs, error }) => {
      const baseError = BaseError.from(error);
      logger.warn(
        GatewayError.from(
          {
            source: "bootstrap/fetch-initial-config",
            message: "initial config sync failed; retrying",
            code: baseError.code,
          },
          {
            attempt,
            poolId: env.RUNTIME_POOL_ID,
            retryDelayMs,
            reason: baseError.message,
          },
        ).toJSON(),
        "initial config sync failed; retrying",
      );
    },
    env.RUNTIME_MAX_BACKOFF_MS,
  );
}

async function syncInitialSkillsWithRetry(state: RuntimeState): Promise<void> {
  return runWithRetry(
    () => pollLatestSkills(state).then(() => undefined),
    ({ attempt, retryDelayMs, error }) => {
      const baseError = BaseError.from(error);
      logger.warn(
        GatewayError.from(
          {
            source: "bootstrap/sync-initial-skills",
            message: "initial skills sync failed; retrying",
            code: baseError.code,
          },
          {
            attempt,
            poolId: env.RUNTIME_POOL_ID,
            retryDelayMs,
            reason: baseError.message,
          },
        ).toJSON(),
        "initial skills sync failed; retrying",
      );
    },
    env.RUNTIME_MAX_BACKOFF_MS,
  );
}

export async function bootstrapGateway(state: RuntimeState): Promise<void> {
  if (envWarnings.usedHostnameAsRuntimePoolId) {
    logger.warn(
      {
        nodeEnv: env.NODE_ENV,
        poolId: env.RUNTIME_POOL_ID,
      },
      "RUNTIME_POOL_ID is unset; using hostname fallback",
    );
  }

  if (envWarnings.deprecatedGatewayHttpEnvKeys.length > 0) {
    logger.warn(
      {
        keys: envWarnings.deprecatedGatewayHttpEnvKeys,
      },
      "deprecated gateway HTTP env vars detected and ignored",
    );
  }

  if (envWarnings.openclawConfigPathSource === "state_dir_env") {
    logger.warn(
      {
        stateDir: envWarnings.openclawStateDir,
        configPath: envWarnings.openclawConfigPath,
      },
      "OPENCLAW_CONFIG_PATH is unset; derived from OPENCLAW_STATE_DIR",
    );
  }

  if (envWarnings.openclawConfigPathSource === "profile_default") {
    logger.warn(
      {
        profile: env.OPENCLAW_PROFILE,
        stateDir: envWarnings.openclawStateDir,
        configPath: envWarnings.openclawConfigPath,
      },
      "OPENCLAW_CONFIG_PATH is unset; derived from profile default",
    );
  }

  if (envWarnings.openclawConfigPathSource === "default") {
    logger.warn(
      {
        stateDir: envWarnings.openclawStateDir,
        configPath: envWarnings.openclawConfigPath,
      },
      "OPENCLAW_CONFIG_PATH is unset; using ~/.openclaw/openclaw.json",
    );
  }

  logger.info(
    {
      poolId: env.RUNTIME_POOL_ID,
      configPath: env.OPENCLAW_CONFIG_PATH,
      manageOpenclawProcess: env.RUNTIME_MANAGE_OPENCLAW_PROCESS,
    },
    "starting gateway",
  );
  await registerPoolWithRetry();
  logger.info({ poolId: env.RUNTIME_POOL_ID }, "pool registered");

  await fetchInitialConfigWithRetry();
  await syncInitialSkillsWithRetry(state);
  logger.info({ poolId: env.RUNTIME_POOL_ID }, "initial skills synced");

  if (env.RUNTIME_MANAGE_OPENCLAW_PROCESS) {
    startManagedOpenclawGateway();
  }

  await waitGatewayReady();
}
