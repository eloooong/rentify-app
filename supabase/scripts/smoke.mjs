import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { localPublicEnvironment, projectRoot } from "./cli.mjs";

const publicEnv = localPublicEnvironment();
const client = createClient(
  publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const categories = await client.from("categories").select("id,name,slug");
assert.equal(categories.error, null, "Public category query must succeed");
const write = await client
  .from("categories")
  .insert({ name: "Forbidden", slug: "forbidden" });
assert.equal(
  write.error?.code,
  "42501",
  "Public category writes must be denied",
);
const privateRead = await client.from("profile_private").select("*");
assert.equal(
  privateRead.error?.code,
  "42501",
  "Private profile reads must be denied",
);

// Exercise the actual Next.js request/cookie context without adding a diagnostic
// route to the product or touching Person A's pages. Fixtures stay in ignored tmp/.
await mkdir(join(projectRoot, "tmp"), { recursive: true });
const fixture = await mkdtemp(join(projectRoot, "tmp/supabase-smoke-"));
await mkdir(join(fixture, "app"));
await writeFile(
  join(fixture, "package.json"),
  '{"private":true,"type":"module"}\n',
);
await writeFile(
  join(fixture, "next.config.mjs"),
  "export default { devIndicators: false };\n",
);
await writeFile(
  join(fixture, "app/layout.js"),
  'export default function Layout({ children }) { return <html lang="en"><body>{children}</body></html>; }\n',
);
await writeFile(
  join(fixture, "app/page.js"),
  `import { createClient } from "../../../lib/supabase/server";
export default async function Page() {
  const client = await createClient();
  const { data, error } = await client.from("categories").select("id,name,slug");
  if (error) throw new Error("Category query failed: " + error.code);
  return <output>{"SUPABASE_COMPONENT_OK:" + data.length}</output>;
}\n`,
);

const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise((resolve, reject) =>
  portProbe.close((error) => (error ? reject(error) : resolve())),
);

const child = spawn(
  process.execPath,
  [
    join(projectRoot, "node_modules/next/dist/bin/next"),
    "dev",
    fixture,
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: projectRoot,
    env: { ...process.env, ...publicEnv, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
child.stdout.on("data", (chunk) => {
  logs += chunk;
});
child.stderr.on("data", (chunk) => {
  logs += chunk;
});
const stopped = once(child, "exit");
try {
  const deadline = Date.now() + 90_000;
  let response;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error("Next.js fixture exited early");
    try {
      response = await fetch(`http://127.0.0.1:${port}`, {
        signal: AbortSignal.timeout(15_000),
      });
      break;
    } catch {
      await delay(500);
    }
  }
  assert.equal(
    response?.status,
    200,
    "Server Component must render successfully",
  );
  assert.match(await response.text(), /SUPABASE_COMPONENT_OK:\d+/);
  console.log(
    "Supabase HTTP smoke passed: category read, denied write/private read, real Server Component query.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  child.kill();
  await Promise.race([stopped, delay(5_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
