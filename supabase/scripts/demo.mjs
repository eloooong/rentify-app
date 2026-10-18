import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { projectRoot, runCli } from "./cli.mjs";
import { DEMO_MARKER, demoFixtures } from "./demo-fixtures.mjs";

const bucket = "listing-images";
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};

function checked(result, operation) {
  // SDK errors can contain request details. Never dump credentials or status JSON.
  if (result.error)
    throw new Error(`${operation} failed. No credentials were logged.`);
  return result.data;
}

export function localConnection(status) {
  if (status.API_URL !== "http://127.0.0.1:54321") {
    throw new Error(
      "Demo tooling only accepts this project's local API at http://127.0.0.1:54321.",
    );
  }
  const secret = status.SERVICE_ROLE_KEY;
  if (typeof secret !== "string" || typeof status.ANON_KEY !== "string") {
    throw new Error(
      "Local Supabase keys are unavailable. Run npm run db:start.",
    );
  }
  return {
    admin: createClient(status.API_URL, secret, clientOptions),
    publicClient: () =>
      createClient(status.API_URL, status.ANON_KEY, clientOptions),
  };
}

export function demoPassword(
  path = join(projectRoot, ".env.demo.local"),
  env = process.env,
) {
  let password = env.RENTIFY_DEMO_PASSWORD;
  if (!password && existsSync(path)) {
    password = parseEnv(readFileSync(path, "utf8")).RENTIFY_DEMO_PASSWORD;
    if (!password)
      throw new Error(
        "The demo environment file has no RENTIFY_DEMO_PASSWORD.",
      );
  }
  if (!password) {
    password = randomBytes(24).toString("hex");
    writeFileSync(
      path,
      `# Local demo credentials. Do not commit or share.\nRENTIFY_DEMO_PASSWORD=${password}\n`,
      { flag: "wx", mode: 0o600 },
    );
  }
  if (
    password.length < 12 ||
    password.length > 72 ||
    /[\r\n\0]/.test(password)
  ) {
    throw new Error(
      "RENTIFY_DEMO_PASSWORD must contain 12–72 characters without line breaks.",
    );
  }
  return password;
}

export function assertDemoAccount(user, account, fixtures) {
  if (
    user.email !== account.email ||
    user.app_metadata?.rentify_seed !== DEMO_MARKER ||
    user.app_metadata?.rentify_seed_namespace !== fixtures.namespace
  ) {
    throw new Error(
      "A demo email belongs to an unrecognized account. Refusing to change it.",
    );
  }
}

export async function findDemoAccounts(admin, fixtures) {
  const users = [];
  for (let page = 1; ; page++) {
    const result = checked(
      await admin.auth.admin.listUsers({ page, perPage: 100 }),
      "Read local accounts",
    );
    users.push(...result.users);
    if (result.users.length < 100) break;
  }
  return fixtures.accounts.map((account) => {
    const user = users.find((entry) => entry.email === account.email);
    if (user) assertDemoAccount(user, account, fixtures);
    return user;
  });
}

async function fixtureRows(admin, fixtures, users) {
  const rows = checked(
    await admin
      .from("listings")
      .select("*")
      .in(
        "id",
        fixtures.listings.map((listing) => listing.id),
      ),
    "Read reserved listings",
  );
  for (const row of rows) {
    if (!users[0] || row.owner_id !== users[0].id) {
      throw new Error(
        "A reserved listing ID belongs to another owner. Refusing to change it.",
      );
    }
  }
  return rows;
}

async function demoImage(category) {
  // Code-drawn placeholders, not photographs or externally fetched assets.
  const shapes = {
    cameras:
      '<rect x="220" y="150" width="360" height="230" rx="28"/><path d="M280 150v-35h100v35"/><circle cx="410" cy="265" r="80"/><circle cx="410" cy="265" r="45"/>',
    laptops:
      '<rect x="230" y="110" width="340" height="230" rx="15"/><path d="M230 340l-65 45h470l-65-45M270 150h260v150H270z"/>',
    drones:
      '<path d="M290 170l220 160m0-160L290 330"/><rect x="340" y="205" width="120" height="90" rx="25"/><ellipse cx="275" cy="155" rx="80" ry="25"/><ellipse cx="525" cy="155" rx="80" ry="25"/><ellipse cx="275" cy="345" rx="80" ry="25"/><ellipse cx="525" cy="345" rx="80" ry="25"/>',
    "vr-headsets":
      '<rect x="200" y="165" width="400" height="190" rx="65"/><path d="M260 165c0-90 280-90 280 0M240 215h320v90H240z"/><circle cx="300" cy="260" r="25"/><circle cx="500" cy="260" r="25"/>',
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#fff3e8"/><g fill="none" stroke="#773c1c" stroke-width="10" stroke-linejoin="round">${shapes[category]}</g><text x="400" y="480" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#773c1c">${category.toUpperCase()}</text><text x="400" y="535" text-anchor="middle" font-family="sans-serif" font-size="23" fill="#773c1c">LOCAL DEMO · ILLUSTRATION</text></svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer();
}

async function validatePasswords(publicClient, users, password) {
  for (const user of users.filter(Boolean)) {
    const client = publicClient();
    const result = await client.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (result.error)
      throw new Error(
        "Existing demo login failed. Restore the original RENTIFY_DEMO_PASSWORD; no password was changed.",
      );
    checked(
      await client.auth.signOut({ scope: "local" }),
      "Close demo validation session",
    );
  }
}

export async function seedDemo(
  connection,
  password,
  fixtures = demoFixtures(),
) {
  const { admin, publicClient } = connection;
  const users = await findDemoAccounts(admin, fixtures);
  const rows = await fixtureRows(admin, fixtures, users);
  const categories = checked(
    await admin.from("categories").select("id,slug"),
    "Read category templates",
  );
  for (const listing of fixtures.listings) {
    if (!categories.some((category) => category.slug === listing.category)) {
      throw new Error(
        "Demo category templates are missing. Apply the committed migrations first.",
      );
    }
  }
  // Validate all existing credentials before creating anything. Never reset a password on rerun.
  await validatePasswords(publicClient, users, password);
  for (const [index, account] of fixtures.accounts.entries()) {
    if (!users[index]) {
      users[index] = checked(
        await admin.auth.admin.createUser({
          email: account.email,
          password,
          email_confirm: true,
          app_metadata: {
            rentify_seed: DEMO_MARKER,
            rentify_seed_namespace: fixtures.namespace,
          },
        }),
        "Create local demo account",
      ).user;
    }
    const user = users[index];
    const profile = checked(
      await admin.from("profiles").select("id").eq("id", user.id).maybeSingle(),
      "Read demo profile",
    );
    if (!profile)
      checked(
        await admin
          .from("profiles")
          .insert({ id: user.id, display_name: account.display_name }),
        "Create demo profile",
      );
    const privateProfile = checked(
      await admin
        .from("profile_private")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      "Read demo private profile",
    );
    if (!privateProfile)
      checked(
        await admin.from("profile_private").insert({ user_id: user.id }),
        "Create empty demo private profile",
      );
  }
  let created = 0;
  for (const fixture of fixtures.listings) {
    if (rows.some((row) => row.id === fixture.id)) continue;
    const { category, photo_id, status, ...fields } = fixture;
    const owner_id = users[0].id;
    const category_id = categories.find((entry) => entry.slug === category).id;
    checked(
      await admin
        .from("listings")
        .insert({ ...fields, owner_id, category_id, status: "draft" }),
      "Create demo draft",
    );
    const storage_path = `${owner_id}/${fixture.id}/${photo_id}.webp`;
    checked(
      await admin.storage
        .from(bucket)
        .upload(storage_path, await demoImage(category), {
          contentType: "image/webp",
          upsert: false,
        }),
      "Upload demo illustration",
    );
    checked(
      await admin.from("listing_photos").insert({
        id: photo_id,
        listing_id: fixture.id,
        storage_path,
        position: 0,
      }),
      "Attach demo illustration",
    );
    if (status === "published")
      checked(
        await admin.from("listings").update({ status }).eq("id", fixture.id),
        "Publish demo listing",
      );
    created++;
  }
  return { users, created, preserved: rows.length };
}

export async function resetDemo(connection, fixtures = demoFixtures()) {
  const { admin } = connection;
  const users = await findDemoAccounts(admin, fixtures);
  const rows = await fixtureRows(admin, fixtures, users);
  if (!rows.length) return;
  const ids = rows.map((row) => row.id);
  const references = checked(
    await admin.from("bookings").select("id").in("listing_id", ids).limit(1),
    "Check demo booking references",
  );
  if (references.length)
    throw new Error(
      "A demo listing has bookings. Reset refused to preserve rental history.",
    );
  for (const row of rows) {
    // Only the reserved fixture IDs are reset, including their edited photos/uploads.
    checked(
      await admin.from("listings").update({ status: "draft" }).eq("id", row.id),
      "Unpublish demo listing",
    );
    checked(
      await admin.from("listing_photos").delete().eq("listing_id", row.id),
      "Detach demo photos",
    );
    const prefix = `${row.owner_id}/${row.id}`;
    // Always remove the first page, so deletions cannot skip a later page.
    for (;;) {
      const files = checked(
        await admin.storage.from(bucket).list(prefix, { limit: 100 }),
        "Read demo uploads",
      );
      if (!files.length) break;
      if (files.some((file) => !file.id))
        throw new Error(
          "Unexpected nested folder in demo uploads. Reset stopped.",
        );
      checked(
        await admin.storage
          .from(bucket)
          .remove(files.map((file) => `${prefix}/${file.name}`)),
        "Remove demo uploads",
      );
    }
    checked(
      await admin.from("listings").delete().eq("id", row.id),
      "Delete demo listing",
    );
  }
}

export async function main(args = process.argv.slice(2)) {
  const reset = args.includes("--reset");
  if (
    args.some((arg) => !["--reset", "--confirm"].includes(arg)) ||
    (reset && !args.includes("--confirm")) ||
    (!reset && args.length)
  ) {
    throw new Error(
      "Use npm run db:demo, or npm run db:demo:reset -- --confirm to replace only the five reserved demo listings.",
    );
  }
  // No URL, hosted-project, or privileged-key override is accepted.
  const connection = localConnection(
    JSON.parse(runCli(["status", "--output", "json"], true)),
  );
  const password = demoPassword();
  if (reset) {
    // Check credentials before a destructive reset, as seedDemo will do on rerun.
    await validatePasswords(
      connection.publicClient,
      await findDemoAccounts(connection.admin, demoFixtures()),
      password,
    );
    await resetDemo(connection);
  }
  const result = await seedDemo(connection, password);
  console.log(
    `Local demo ready: ${result.created} listings created, ${result.preserved} existing listings preserved.`,
  );
  console.log(
    "Logins: rentify-demo-owner@example.test / rentify-demo-renter@example.test",
  );
  console.log(
    "Password: RENTIFY_DEMO_PASSWORD from your environment or ignored .env.demo.local. Never commit this file.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
