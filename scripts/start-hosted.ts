// One process for the hosted demo backend. Owner: Abhiraj (#25).
//   npm run start:hosted -w @raterace/scripts
//
// Starts the three mock anchor quote servers (ports 8801-8803, private to this container),
// the router (public, on $PORT) and the oracle keeper. The router reaches the anchors on
// localhost, exactly as deployments/testnet.json says. If any child exits, everything exits
// so the host restarts the whole set.
import { spawn, type ChildProcess } from "node:child_process";
import { REPO_ROOT } from "@raterace/shared/node";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children: ChildProcess[] = [];

function start(name: string, args: string[]) {
  const child = spawn(npm, args, { cwd: REPO_ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  const tag = (line: string) => line && console.log(`[${name}] ${line}`);
  child.stdout?.on("data", (d: Buffer) => d.toString().split("\n").forEach(tag));
  child.stderr?.on("data", (d: Buffer) => d.toString().split("\n").forEach(tag));
  child.on("exit", (code) => {
    console.error(`[${name}] exited with ${code}; stopping everything`);
    for (const c of children) if (c !== child) c.kill();
    process.exit(code ?? 1);
  });
  children.push(child);
}

start("anchors", ["run", "start", "-w", "@raterace/anchors"]);
start("router", ["run", "start", "-w", "@raterace/router"]);
start("keeper", ["run", "oracle:keeper", "-w", "@raterace/scripts"]);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    for (const c of children) c.kill();
    process.exit(0);
  });
}
