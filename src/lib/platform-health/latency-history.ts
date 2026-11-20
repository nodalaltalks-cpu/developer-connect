/**
 * A short memory of recent database response times, used for the "getting slower" early warning. It lives on globalThis so
 * every copy of the module in a server instance shares it. It is per server instance (not shared between instances and lost
 * on a cold start), which is why the warning needs a minimum number of samples and why the page says so.
 */
const MAX_SAMPLES = 40;
const globalState = globalThis as unknown as { __platformHealthLatency?: number[] };

export function recordLatencySample(latencyMs: number): number[] {
  const samples = (globalState.__platformHealthLatency ??= []);
  samples.push(latencyMs);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  return [...samples];
}
