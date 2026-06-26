import { spawn } from "node:child_process";
import process from "node:process";

const npmCli = process.platform === "win32"
  ? "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"
  : "npm";
const checks = [
  ["lint", ["run", "lint"]],
  ["typecheck", ["run", "typecheck"]],
  ["unit tests", ["run", "test"]],
  ["HTTP E2E", ["run", "test:e2e"]],
  ["browser workflows", ["run", "test:browser"]],
  ["production build", ["run", "build"]],
];

function runCheck(label, args) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    console.log(`\n[validate:predeploy] Starting ${label}...`);
    const command = process.platform === "win32" ? process.execPath : npmCli;
    const commandArgs = process.platform === "win32" ? [npmCli, ...args] : args;
    const child = spawn(command, commandArgs, {
      env: process.env,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

      if (code === 0) {
        console.log(`[validate:predeploy] Passed ${label} in ${durationSeconds}s.`);
        resolve();
        return;
      }

      reject(
        new Error(
          `[validate:predeploy] ${label} failed with exit code ${code} after ${durationSeconds}s.`,
        ),
      );
    });
  });
}

for (const [label, args] of checks) {
  await runCheck(label, args);
}

console.log("\n[validate:predeploy] All gates passed. Deployment is still manual and should only use private secrets in the host environment.");
