import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { localPublicEnvironment, projectRoot } from "./cli.mjs";

// Real, isolated PostgreSQL sessions in this project's local Docker container.
// No cloud URL override, database reset, privileged API key or extra dependency.
if (
  localPublicEnvironment().NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321"
) {
  throw new Error(
    "Booking concurrency tests accept only the local Rentify stack.",
  );
}
const marker = "RENTIFY_TRANSACTION_READY";
const sessions = [];
function session(sql, hold = false) {
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_rentify-app",
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "VERBOSITY=sqlstate",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
      windowsHide: true,
    },
  );
  let output = "";
  let errors = "";
  let finished = false;
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  child.on("error", () => {
    errors += "Local Docker command unavailable";
  });
  const done = new Promise((resolve) =>
    child.on("close", (status) => {
      finished = true;
      resolve({ status, output: output.trim(), errors });
    }),
  );
  const result = {
    child,
    done,
    output: () => output,
    finished: () => finished,
  };
  sessions.push(result);
  if (hold) child.stdin.write(`${sql}\n\\echo ${marker}\n`);
  else child.stdin.end(sql);
  return result;
}
async function query(sql) {
  const result = await session(sql).done;
  assert.equal(
    result.status,
    0,
    "Local fixture SQL failed; inspect database schema and Docker.",
  );
  return result.output;
}
async function waitUntilReady(first) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (first.output().includes(marker)) return;
    assert.ok(
      !first.finished(),
      "First transaction ended before its concurrency barrier.",
    );
    await delay(50);
  }
  throw new Error("First transaction did not reach its concurrency barrier.");
}
async function race(firstSql, secondSql, conflict) {
  const application = `rentify-race-${randomUUID()}`;
  const prefix = (name) =>
    `set application_name='${name}'; begin; set local role service_role; set local statement_timeout='15s'; set local lock_timeout='12s'; set local idle_in_transaction_session_timeout='20s';`;
  const first = session(`${prefix(application + "a")} ${firstSql}`, true);
  await waitUntilReady(first);
  const second = session(`${prefix(application + "b")} ${secondSql} commit;`);
  let secondResult;
  if (conflict) {
    let blocked = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      const state = await query(
        `select wait_event_type from pg_stat_activity where application_name='${application}b';`,
      );
      if (state === "Lock") {
        blocked = true;
        break;
      }
      assert.ok(
        !second.finished(),
        "Competing transaction must wait for the uncommitted reservation.",
      );
      await delay(50);
    }
    assert.ok(
      blocked,
      "Observed a real database lock wait between the two sessions.",
    );
  } else {
    secondResult = await second.done;
    assert.equal(
      secondResult.status,
      0,
      "Independent reservation should succeed.",
    );
    assert.ok(
      !first.finished(),
      "Independent transaction completed while the first was still open.",
    );
  }
  first.child.stdin.end("commit;\n");
  const firstResult = await first.done;
  assert.equal(firstResult.status, 0, "First reservation should commit.");
  secondResult ??= await second.done;
  if (conflict) {
    assert.notEqual(secondResult.status, 0, "Competing reservation must fail.");
    assert.match(
      secondResult.errors,
      /23P01/,
      "Conflict must be a PostgreSQL exclusion violation.",
    );
  }
}

const [owner, renterA, renterB, listingA, listingB, bookingA, bookingB] =
  Array.from({ length: 7 }, () => randomUUID());
const bookingIds = `'${bookingA}','${bookingB}'`;
const periodA = "[2030-02-01,2030-02-04)";
const insert = (id, listing, renter, period) =>
  `insert into public.bookings(id,listing_id,owner_id,renter_id,rental_period,rental_amount,deposit_amount) values ('${id}','${listing}','${owner}','${renter}','${period}',85000,0);`;
const accept = (id) =>
  `update public.bookings set status='accepted' where id='${id}';`;
try {
  // Trusted synthetic drafts isolate constraint testing from listing/photo APIs.
  // The transaction commits so the two real sessions can see these fixtures.
  await query(`begin;
    insert into auth.users(id,email_confirmed_at) values ('${owner}',now()),('${renterA}',now()),('${renterB}',now());
    insert into public.profiles(id,display_name) values ('${owner}','Concurrency fixture owner'),('${renterA}','Concurrency fixture renter A'),('${renterB}','Concurrency fixture renter B');
    insert into public.listings(id,owner_id,category_id,title,daily_price_amount,deposit_amount,condition,pickup_area,attributes)
    select l.id,'${owner}',c.id,'Concurrency fixture camera',85000,0,'Good','Demo campus','{"brand":"Demo","model":"Race"}'
    from (values ('${listingA}'::uuid),('${listingB}'::uuid)) l(id)
    cross join public.categories c where c.slug='cameras';
    commit;`);

  await query(
    insert(bookingA, listingA, renterA, periodA) +
      insert(bookingB, listingA, renterB, "[2030-02-03,2030-02-06)"),
  );
  await race(accept(bookingA), accept(bookingB), true);
  assert.equal(
    await query(
      `select count(*) from public.bookings where id in (${bookingIds}) and status='accepted';`,
    ),
    "1",
  );
  assert.equal(
    await query(`select status from public.bookings where id='${bookingB}';`),
    "requested",
  );
  console.log(
    "Concurrent overlapping acceptances: one winner, observed lock wait, loser remains requested — PASS",
  );

  await query(
    `delete from public.bookings where id in (${bookingIds});` +
      insert(bookingA, listingA, renterA, periodA) +
      insert(bookingB, listingA, renterB, "[2030-02-04,2030-02-05)"),
  );
  await race(accept(bookingA), accept(bookingB), false);
  assert.equal(
    await query(
      `select count(*) from public.bookings where id in (${bookingIds}) and status='accepted';`,
    ),
    "2",
  );
  console.log(
    "Concurrent adjacent reservations: both succeed independently — PASS",
  );

  await query(
    `delete from public.bookings where id in (${bookingIds});` +
      insert(bookingA, listingA, renterA, periodA) +
      insert(bookingB, listingB, renterB, periodA),
  );
  await race(accept(bookingA), accept(bookingB), false);
  assert.equal(
    await query(
      `select count(*) from public.bookings where id in (${bookingIds}) and status='accepted';`,
    ),
    "2",
  );
  console.log(
    "Concurrent reservations for different devices: both succeed independently — PASS",
  );

  await query(`delete from public.bookings where id in (${bookingIds});`);
  await race(
    insert(bookingA, listingA, renterA, periodA),
    insert(bookingB, listingA, renterA, periodA),
    true,
  );
  assert.equal(
    await query(
      `select count(*) from public.bookings where id in (${bookingIds});`,
    ),
    "1",
  );
  console.log(
    "Concurrent duplicate requests by the same renter: exactly one created — PASS",
  );
} finally {
  for (const entry of sessions) {
    if (!entry.finished() && !entry.child.stdin.writableEnded)
      entry.child.stdin.end("rollback;\n");
  }
  await Promise.all(sessions.map((entry) => entry.done));
  // Exact random IDs only; no reset, shared seed, real bookings or storage touched.
  await query(`begin; set local lock_timeout='5s';
    delete from public.bookings where id in (${bookingIds});
    delete from public.listings where id in ('${listingA}','${listingB}') and owner_id='${owner}';
    delete from auth.users where id in ('${owner}','${renterA}','${renterB}');
    commit;`);
  console.log("Isolated concurrency fixtures removed.");
}
