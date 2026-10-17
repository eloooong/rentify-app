import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { format, resolveConfig } from "prettier";
import { projectRoot, runCli } from "./cli.mjs";

const target = join(projectRoot, "lib/supabase/database.types.ts");
const generated = runCli(
  ["gen", "types", "typescript", "--local", "--schema", "public"],
  true,
);
const formatted = await format(generated, {
  ...(await resolveConfig(target)),
  parser: "typescript",
});
// A failed CLI/formatter never truncates the committed contract.
await writeFile(`${target}.tmp`, formatted, "utf8");
await rename(`${target}.tmp`, target);
console.log(
  "Regenerated lib/supabase/database.types.ts from the local database.",
);
