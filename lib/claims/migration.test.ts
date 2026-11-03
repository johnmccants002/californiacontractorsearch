import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";

let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  admin = "00000000-0000-4000-8000-000000000003";
const session = (id: string) => id.replace("4000", "5000");
async function actor(id = owner, aal = "aal1") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: id,
      session_id: session(id),
      aal,
      user_metadata: { role: "admin" },
    }),
  ]);
  await db.exec("set role authenticated");
}
async function create(id = 1) {
  return (
    await db.query<{ id: string }>(
      "insert into public.business_claims(license_id,applicant_name,applicant_role,website,attested) values($1,'Fixture Owner','owner','',true) returning id",
      [id],
    )
  ).rows[0].id;
}
async function decide(
  id: string,
  status = "approved",
  method: string | null = "cslb_phone",
  note = "Independently contacted the established business and confirmed authority.",
) {
  return db.query(
    "update public.business_claims set status=$2,verification_method=$3,review_note=$4 where id=$1 returning id,status",
    [id, status, method, note],
  );
}
async function approved() {
  await actor();
  const id = await create();
  await actor(admin, "aal2");
  await decide(id);
  return id;
}
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon,authenticated;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create table public.licenses(id bigint primary key,license_number text unique,business_name_normalized text,entity_type text,source_status text,source_missing_since date,phone text,license_status text);
    alter table public.licenses enable row level security;
    grant select on public.licenses to anon,authenticated; create policy public_source on public.licenses for select using(true);`);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261031204737_business_profile_claims.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  expect(
    (await db.query("select enabled from claim_private.settings")).rows,
  ).toEqual([{ enabled: false }]);
}, 30000);
beforeEach(async () => {
  await db.exec(
    "reset role; truncate public.licenses,auth.users cascade; update claim_private.settings set enabled=true;",
  );
  for (const id of [owner, other, admin]) {
    await db.query("insert into auth.users values($1,$2,now(),null)", [
      id,
      `${id.slice(-1)}@example.com`,
    ]);
    await db.query("insert into auth.sessions values($1,$2)", [
      session(id),
      id,
    ]);
  }
  await db.query("insert into claim_private.admins(user_id) values($1)", [
    admin,
  ]);
  await db.exec(
    "insert into public.licenses select n,n::text,'fixture '||n,'Corporation','Clear',null,'555-0100','ACTIVE' from generate_series(1,10) n",
  );
  await actor();
});
afterAll(async () => {
  await db?.close();
});

describe("claim permissions and invariants in real isolated Postgres", () => {
  it("records a pending request, derived login email, audit and durable notices atomically", async () => {
    const id = await create();
    expect(
      (
        await db.query(
          "select status,applicant_email,user_id from public.business_claims where id=$1",
          [id],
        )
      ).rows,
    ).toEqual([
      { status: "pending", applicant_email: "1@example.com", user_id: owner },
    ]);
    await db.exec("reset role");
    expect(
      (await db.query("select event from business_claim_events")).rows,
    ).toEqual([{ event: "claim_pending" }]);
    expect(
      (
        await db.query(
          "select kind,state from business_claim_notices order by kind",
        )
      ).rows,
    ).toEqual([
      { kind: "submitted_admin", state: "pending" },
      { kind: "submitted_user", state: "pending" },
    ]);
  });
  it("does not expose another applicant, private notes, audit, admins or queue", async () => {
    await create();
    await actor(other);
    expect((await db.query("select id from business_claims")).rows).toEqual([]);
    expect(
      (await db.query("select * from business_claim_events")).rows,
    ).toEqual([]);
    for (const query of [
      "select review_note from business_claims",
      "select * from business_claim_notices",
      "select * from claim_private.admins",
      "select * from claim_private.settings",
    ])
      await expect(db.query(query)).rejects.toThrow(/permission denied/);
  });
  it("does not trust forged user_metadata admin privileges", async () => {
    const id = await create();
    await actor(other, "aal2");
    expect(
      (await db.query("select business_claim_admin_access() as admin")).rows,
    ).toEqual([{ admin: false }]);
    expect((await decide(id)).rows).toEqual([]);
  });
  it("enforces the database launch gate even through direct API calls", async () => {
    await db.exec(
      "reset role; update claim_private.settings set enabled=false",
    );
    await actor();
    await expect(create()).rejects.toThrow(/unavailable|row-level security/);
  });
  it.each(["unconfirmed", "banned", "revoked-session"])(
    "rejects %s accounts",
    async (mode) => {
      await db.exec("reset role");
      if (mode === "unconfirmed")
        await db.query(
          "update auth.users set email_confirmed_at=null where id=$1",
          [owner],
        );
      if (mode === "banned")
        await db.query(
          "update auth.users set banned_until=now()+interval '1 day' where id=$1",
          [owner],
        );
      if (mode === "revoked-session")
        await db.query("delete from auth.sessions where user_id=$1", [owner]);
      await actor();
      await expect(create()).rejects.toThrow(/unavailable|row-level security/);
    },
  );
  it("rejects anonymous creation and private reads", async () => {
    await db.exec("set role anon");
    await expect(create()).rejects.toThrow(/permission denied/);
    await expect(db.query("select id from business_claims")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query("select business_claim_admin_access()"),
    ).rejects.toThrow(/permission denied/);
  });
  it("requires an independently enrolled MFA admin for review", async () => {
    const id = await create();
    await actor(admin);
    expect(
      (await db.query("select business_claim_admin_access() as admin")).rows,
    ).toEqual([{ admin: true }]);
    expect((await decide(id)).rows).toEqual([]);
    await actor(admin, "aal2");
    expect((await decide(id)).rows[0]).toEqual({ id, status: "approved" });
  });
  it("prevents administrators reviewing their own claims", async () => {
    await actor(admin, "aal2");
    const id = await create();
    await expect(decide(id)).rejects.toThrow("Independent MFA reviewer");
  });
  it.each([
    "user_id",
    "status",
    "applicant_email",
    "reviewed_by",
    "approved_business_name",
  ])("rejects claimant-supplied %s", async (column) => {
    await expect(
      db.query(
        `insert into business_claims(license_id,applicant_name,applicant_role,attested,${column}) values(1,'Fixture Owner','owner',true,null)`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("limits pending requests across licenses", async () => {
    await create(1);
    await create(2);
    await create(3);
    await expect(create(4)).rejects.toThrow("limit reached");
  });
  it("limits total requests in a rolling 24-hour window even after review", async () => {
    for (let i = 1; i <= 5; i++) {
      await actor();
      const id = await create(i);
      await actor(admin, "aal2");
      await decide(id, "denied", null);
    }
    await actor();
    await expect(create(6)).rejects.toThrow("limit reached");
  });
  it("limits duplicate open claims without blocking an independent access request", async () => {
    await create();
    await expect(create()).rejects.toThrow(/duplicate key/);
    await actor(other);
    await expect(create()).resolves.toBeTruthy();
  });
  it.each(["missing", "unconfirmed"])(
    "rejects %s source records",
    async (kind) => {
      await db.exec("reset role");
      await db.exec(
        kind === "missing"
          ? "update licenses set source_missing_since=current_date where id=1"
          : "update licenses set source_status=null where id=1",
      );
      await actor();
      await expect(create()).rejects.toThrow("Source record needs review");
    },
  );
  it("requires substantive evidence and a supported verification method", async () => {
    const id = await create();
    await actor(admin, "aal2");
    await expect(decide(id, "approved", null)).rejects.toThrow(
      "Verification required",
    );
    await expect(
      decide(id, "approved", "cslb_phone", "Looks fine"),
    ).rejects.toThrow("Record verification evidence");
    await db.exec("reset role; update licenses set phone=null where id=1");
    await actor(admin, "aal2");
    await expect(decide(id)).rejects.toThrow("No CSLB phone");
    await expect(
      decide(id, "approved", "independent_business_contact"),
    ).resolves.toBeTruthy();
  });
  it("allows only the approved owner to edit public overlay fields", async () => {
    await approved();
    await actor();
    expect(
      (
        await db.query(
          "update business_profiles set description='Business description' where license_id=1 returning description",
        )
      ).rows,
    ).toEqual([{ description: "Business description" }]);
    await actor(other);
    expect(
      (
        await db.query(
          "update business_profiles set description='Hijacked' where license_id=1 returning license_id",
        )
      ).rows,
    ).toEqual([]);
    await db.exec("set role anon");
    expect(
      (await db.query("select description from business_profiles")).rows,
    ).toEqual([{ description: "Business description" }]);
  });
  it("never grants source updates, ownership reassignments, deletes, or profile insertion", async () => {
    const id = await approved();
    await actor();
    for (const query of [
      "update licenses set license_status='ACTIVE'",
      "insert into business_profiles(license_id) values(2)",
      "delete from business_claims",
      "delete from business_profiles",
      "update business_profiles set license_id=2",
      "update business_profiles set updated_at=now()",
      `update business_claims set user_id='${other}' where id='${id}'`,
    ])
      await expect(db.query(query)).rejects.toThrow(/permission denied/);
    expect((await decide(id, "revoked")).rows).toEqual([]);
  });
  it("rejects dangerous URLs and oversized public fields in direct database writes", async () => {
    await approved();
    await actor();
    for (const [field, value] of [
      ["website", "javascript:alert(1)"],
      ["description", "a".repeat(2001)],
      ["contact_phone", "<script>"],
      ["contact_email", "a@example.com\r\nBcc:other@example.com"],
    ])
      await expect(
        db.query(
          `update business_profiles set ${field}=$1 where license_id=1`,
          [value],
        ),
      ).rejects.toThrow(/check constraint/);
  });
  it("blocks a second approved owner and preserves the original until explicit revocation", async () => {
    const first = await approved();
    await actor(other);
    const second = await create();
    await actor(admin, "aal2");
    await expect(decide(second)).rejects.toThrow("already managed");
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select recipient from business_claim_notices where kind='access_requested'",
        )
      ).rows,
    ).toEqual([{ recipient: "1@example.com" }]);
    await actor();
    await db.query(
      "update business_profiles set description='Old owner content' where license_id=1",
    );
    await actor(admin, "aal2");
    await decide(first, "revoked", null);
    await actor();
    expect((await db.query("select * from business_profiles")).rows).toEqual(
      [],
    );
    expect(
      (
        await db.query(
          "update business_profiles set description='After revocation' returning license_id",
        )
      ).rows,
    ).toEqual([]);
    await actor(admin, "aal2");
    await decide(second);
    await actor(other);
    expect(
      (await db.query("select description from business_profiles")).rows,
    ).toEqual([{ description: "" }]);
    await actor(admin, "aal2");
    expect(
      (
        await db.query(
          "select id from business_claim_events where before_data->>'description'='Old owner content'",
        )
      ).rows.length,
    ).toBeGreaterThan(0);
  });
  it("suspends editing and display on material CSLB business identity change", async () => {
    await approved();
    await db.exec(
      "reset role; update licenses set business_name_normalized='New Business' where id=1",
    );
    await actor();
    expect(
      (
        await db.query(
          "update business_profiles set description='Not authorized' returning license_id",
        )
      ).rows,
    ).toEqual([]);
    await db.exec("set role anon");
    expect((await db.query("select * from business_profiles")).rows).toEqual(
      [],
    );
  });
  it("preserves the overlay on ordinary source refreshes without changing CSLB facts", async () => {
    await approved();
    await actor();
    await db.query(
      "update business_profiles set description='Owner content' where license_id=1",
    );
    await db.exec(
      "reset role; update licenses set license_status='SUSPENDED',phone='555-0101' where id=1; set role anon",
    );
    expect(
      (await db.query("select description from business_profiles")).rows,
    ).toEqual([{ description: "Owner content" }]);
    expect(
      (await db.query("select license_status from licenses where id=1")).rows,
    ).toEqual([{ license_status: "SUSPENDED" }]);
  });
  it("makes notice reservations atomic, service-only and non-replayable", async () => {
    await create();
    await db.exec("reset role");
    const id = (
      await db.query<{ id: string }>(
        "select id from business_claim_notices limit 1",
      )
    ).rows[0].id;
    await actor();
    await expect(
      db.query("select * from reserve_business_claim_notice($1)", [id]),
    ).rejects.toThrow(/permission denied/);
    await db.exec("set role service_role");
    expect(
      (await db.query("select * from reserve_business_claim_notice($1)", [id]))
        .rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from reserve_business_claim_notice($1)", [id]))
        .rows,
    ).toHaveLength(0);
  });
});
