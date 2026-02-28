import "dotenv/config";

if (process.env.DD_ENV) {
  try {
    // @ts-expect-error dd-trace lacks ESM exports map
    await import("dd-trace/initialize.mjs");
  } catch (err) {
    console.warn(
      "[datadog] Failed to initialize dd-trace:",
      err instanceof Error ? err.message : err,
    );
  }
}
