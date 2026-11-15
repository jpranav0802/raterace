// One process for the hosted demo backend. Owner: Abhiraj (#25).
//   npm run start:hosted -w @raterace/scripts
//
// Starts the three mock anchor quote servers (ports 8801-8803, private to this container),
// the router (public, on $PORT) and the oracle keeper. The router reaches the anchors on
// localhost, exactly as deployments/testnet.json says. If any child exits, everything exits
// so the host restarts the whole set.
//
// Children are started as `node --import tsx <file>` directly (no npm wrapper), so the
// process we watch and kill is the server itself.
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { REPO_ROOT } from "@raterace/shared/node";

const children: ChildProcess[] = [];
let stopping = false;

function stopAll(code: number) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill();
  process.exit(code);
}

function start(name: string, dir: string, file: string) {
  const child = spawn(process.execPath, ["--import", "tsx", file], {
    cwd: resolve(REPO_ROOT, dir),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tag = (line: string) => line.trim() && console.log(`[${name}] ${line}`);
  child.stdout?.on("data", (d: Buffer) => d.toString().split("\n").forEach(tag));
  child.stderr?.on("data", (d: Buffer) => d.toString().split("\n").forEach(tag));
  child.on("exit", (code) => {
    console.error(`[${name}] exited with ${code}; stopping everything`);
    stopAll(code || 1);
  });
  children.push(child);
}

start("anchors", "anchors", "src/index.ts");
start("router", "router", "src/index.ts");
start("keeper", "scripts", "oracle-keeper.ts");

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
