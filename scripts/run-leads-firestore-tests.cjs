// Runs the existing lead-system tests against the Firestore emulator instead of the in-memory repository.
// Use through `npm run test:firestore:leads` (which starts the emulator and sets FIRESTORE_EMULATOR_HOST).
const { spawnSync } = require("node:child_process");

const result = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-concurrency=1",
    // 25 simultaneous captures of one number is a stress test of lock contention: correct, but minutes long on the emulator.
    "--test-skip-pattern=25 simultaneous",
    "src/lib/leads/__tests__/*.test.ts",
    "src/lib/leads/gate/__tests__/*.test.ts",
    "src/lib/campaign/__tests__/*.test.ts",
    "src/lib/social/__tests__/*.test.ts",
    "src/lib/team/__tests__/*.test.ts",
  ],
  { stdio: "inherit", env: { ...process.env, LEADS_TEST_BACKEND: "firestore" } },
);
process.exit(result.status ?? 1);
