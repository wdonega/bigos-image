// Runs once per server process: starts the queue worker and storage cleanup.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBackground } = await import("./lib/jobs/worker");
  startBackground();
}
