import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { localPublicEnvironment, projectRoot } from "./cli.mjs";

const values = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  ...localPublicEnvironment(),
};
try {
  await writeFile(
    join(projectRoot, ".env.local"),
    Object.entries(values)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(""),
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  console.log("Created ignored .env.local with local public settings only.");
} catch (error) {
  if (error.code === "EEXIST") {
    throw new Error(
      ".env.local already exists; preserve it and update its public Supabase settings manually.",
    );
  }
  throw error;
}
