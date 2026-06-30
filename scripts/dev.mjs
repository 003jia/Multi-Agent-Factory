import { spawn } from "node:child_process";

const commands = [
  ["server", "npm", ["run", "dev:server"]],
  ["client", "npm", ["run", "dev:client"]]
];

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      process.exitCode = code;
      shutdown();
    }
  });

  return child;
});

const shutdown = () => {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
