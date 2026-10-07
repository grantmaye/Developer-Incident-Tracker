# Signal technical manual

Signal is a deliberately bounded incident-response application. You can declare impact, coordinate a commander, record evidence, and close an incident with an explanation. It teaches concurrent editing and transactional history through a working interface. It is not connected to monitoring, paging, or real identities. Start with the [product story](product-story.md), then follow this manual with the application open.

## 1. Learn the vocabulary through the screen

An **incident** is a record of reported service impact. **Severity** (`SEV1`, `SEV2`, `SEV3`) expresses urgency; it does not measure downtime. A **commander** is the selected person coordinating the response. A **timeline event** records a declaration or update. A **workspace** is the demo data partition selected by a browser cookie. A **version** is a counter used to reject edits based on old information.

The charcoal-and-citron room has an incident queue, a service strip, the selected incident's timeline, and a response form. The service strip counts active reports mentioning each service. “No reported incident” means exactly that; it is not a successful health probe. Dependency names are reference information, not automatic impact propagation. See [room.tsx](../src/components/room.tsx) and [model.ts](../src/lib/model.ts).

First run:

1. Start locally, then inspect the three fictional seed incidents. Their dates are relative to workspace creation, not a live event feed.
2. Declare a new incident with a title of at least five characters, an impact summary of at least ten, a severity, service, and commander.
3. Post a note in Investigating. Advance to Identified, then Monitoring, supplying a meaningful note each time.
4. Fill in root cause and follow-up, then resolve. The record becomes immutable through the service.
5. Reload: the server still has the record. Change to Observer: writes are rejected by the service as well as disabled in the interface.

The seed records are illustrative snapshots; their one-event timelines are not full reconstructions of every historical stage.

## 2. Setup, configuration, and storage

Use Node 22.13 or newer (CI uses Node 22) and npm. From the repository root:

```sh
npm ci
npm run dev -- --hostname 127.0.0.1 --port 43101
```

Open `http://127.0.0.1:43101`. No account, API key, or external database is needed. A production build can be exercised with:

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 43101
```

Optional `.env.local` values, illustrated with placeholders only:

```dotenv
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE
APP_ORIGIN=https://signal.example
PGLITE_DATA_DIR=./.data/signal
```

Leave `DATABASE_URL` unset to use PGlite, an embedded PostgreSQL engine backed by a local directory. External PostgreSQL uses a `pg` connection pool with at most eight connections. `APP_ORIGIN` must exactly match the browser's origin, including scheme and nondefault port; omit it for an ordinary local run. `PGLITE_DATA_DIR` only controls embedded storage. For an isolated demo, point it at a new directory rather than deleting an existing one.

The unsigned `signal-workspace` UUID cookie lasts seven days, is HTTP-only and SameSite Strict, and is Secure when the request URL uses HTTPS. Clearing it starts another sample workspace; it does not delete the old database rows. A persistent volume is necessary to retain embedded data. A multi-instance host should use external PostgreSQL, not several independent embedded directories. These details come from [database.ts](../src/lib/database.ts) and the [HTTP route](../src/app/api/graphql/route.ts).

## 3. File map and request path

| Source                                                                                                          | What to learn there                                                   |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [app/page.tsx](../src/app/page.tsx), [layout.tsx](../src/app/layout.tsx), [globals.css](../src/app/globals.css) | Entry point, metadata, and visual identity                            |
| [components/room.tsx](../src/components/room.tsx)                                                               | Local form state, filters, refresh, GraphQL selections                |
| [components/use-dialog.ts](../src/components/use-dialog.ts)                                                     | Dialog keyboard behavior and focus restoration                        |
| [lib/client.ts](../src/lib/client.ts)                                                                           | JSON POSTs and surfaced API errors                                    |
| [app/api/graphql/route.ts](../src/app/api/graphql/route.ts)                                                     | Request gates, workspace cookie, simulated role, Apollo adapter       |
| [lib/graphql.ts](../src/lib/graphql.ts)                                                                         | Schema, resolver delegation, error mapping, document limits           |
| [lib/service.ts](../src/lib/service.ts)                                                                         | Seed transaction, input validation, lifecycle, optimistic concurrency |
| [lib/schema.ts](../src/lib/schema.ts), [lib/database.ts](../src/lib/database.ts)                                | SQL tables and database adapters                                      |
| [tests/core.test.ts](../tests/core.test.ts)                                                                     | Competing writers, lifecycle, isolation, GraphQL traversal            |
| [tests/e2e/workflow.spec.ts](../tests/e2e/workflow.spec.ts)                                                     | Real-browser response workflow                                        |

```mermaid
sequenceDiagram
    participant UI as Response room
    participant HTTP as POST /api/graphql
    participant API as Apollo resolver
    participant S as Service.update
    participant DB as PostgreSQL / PGlite
    UI->>HTTP: id + expected version + update
    HTTP->>API: validated request + workspace + demo role
    API->>S: update(workspace, role, id, version, input)
    S->>DB: BEGIN; SELECT incident FOR UPDATE
    S->>S: Compare version; validate transition
    S->>DB: Write state and appended event; COMMIT
    DB-->>UI: Updated record or domain error
```

GraphQL describes which fields clients can ask for; it does not provide database transactions or authentication. Resolvers call the service. **JSONB** is PostgreSQL's structured JSON storage: state and timeline live together in one document. **Optimistic concurrency** means a client supplies its last-seen version. A row lock serializes writers while the version check rejects stale intent. Either technique alone is insufficient to preserve user intent.

## 4. Data and API contracts

[Schema initialization](../src/lib/schema.ts) creates `workspaces(id, created_at)` and `incidents(workspace_id, id, data)`. The incident primary key is `(workspace_id, id)` and its workspace foreign key cascades deletes. `CREATE TABLE IF NOT EXISTS` is bootstrap SQL, not a versioned migration system.

The incident document contains title, summary, severity, status, service IDs, commander, creation/update/resolution times, version, root cause, follow-up, and events. Events contain UUID, kind, body, timestamp, and the literal actor `Demo operator`; the actor is not a verified identity. Creation derives the next incident number from the bounded workspace count under a workspace lock. Deletion and historical ID reuse are not supported.

The API has one query, `dashboard`, and two mutations:

```graphql
mutation Declare($input: CreateInput!) {
  declareIncident(input: $input) {
    id
    status
    version
  }
}
mutation Update($id: ID!, $version: Int!, $input: UpdateInput!) {
  updateIncident(id: $id, version: $version, input: $input) {
    id
    status
    version
    resolvedAt
    events {
      kind
      body
    }
  }
}
```

Each operation is a separate request. `CreateInput` requires `title`, `summary`, `severity`, `serviceIds`, and `commander`. `UpdateInput` requires `status`, `commander`, `note`, `rootCause`, and `followUp`; the last two may be empty until resolution. Use returned IDs and versions, never a guessed version for an existing record.

A read-only HTTP smoke check, preserving its workspace cookie:

```sh
curl -sS -c /tmp/signal-cookies -b /tmp/signal-cookies \
  -H 'Content-Type: application/json' \
  --data '{"query":"{dashboard{storageMode incidents{id status version}}}"}' \
  http://127.0.0.1:43101/api/graphql
curl -sS http://127.0.0.1:43101/api/health
```

Health executes `SELECT 1`, returning `status: ok` with the storage mode or HTTP 503. HTTP gates reject non-JSON content (415), mismatched Origin (403), malformed JSON (400), and raw request text longer than 16,000 characters (413). The body is read before that length check, so this is not a streaming memory limit. GraphQL rejects named fragment definitions, documents exceeding 150 fields, and multiple top-level mutation selections. This is a small-demo bound, not a general query-cost defense. Domain errors expose `BAD_USER_INPUT`, `FORBIDDEN`, `NOT_FOUND`, or `CONFLICT`; internal errors return a generic message and are logged server-side.

## 5. Invariants worth defending

[Service methods](../src/lib/service.ts) enforce:

- New incidents start at Investigating, version one, with a declaration event. Services must exist, commanders must be listed, and repeated service IDs are deduplicated.
- Updates keep the current stage or advance exactly one stage: Investigating → Identified → Monitoring → Resolved. No skipping, reopening, or editing after resolution.
- An update requires a trimmed 3–1,000-character note. Root cause and follow-up are each at most 2,000 characters and both required for resolution.
- Every accepted update increments the version and appends exactly one event in the same transaction as state. Failure rolls back both.
- Workspaces allow at most 100 incidents; each incident allows at most 200 events. The initial three incidents count toward the quota.
- Every record lookup includes workspace identity. Observer (`VIEWER`) writes are rejected.

These are service invariants, not protections against a database administrator rewriting JSON. Nor is the cookie a secure tenant boundary: users can choose a different role header and cookies are unsigned. There is no login, membership lookup, rate limiter, automatic cleanup, pager, subscription, or background notification delivery.

## 6. Verification and failure labs

```sh
npm run format:check
npm run typecheck
npm test
npm run build
npx playwright install chromium
PORT=43101 PGLITE_DATA_DIR=./.data/browser-check npm run test:e2e
```

Stop an existing server on the chosen test port first. Playwright launches its own production server and refuses to reuse someone else's. Its desktop and mobile projects capture screenshots and retain failure traces. There is no separate ESLint command: formatting, TypeScript, service tests, build, and browser checks are the current gates.

For PostgreSQL parity, provide a **disposable test database**:

```sh
TEST_DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DISPOSABLE_TEST_DB npm test
```

Tests create random workspaces and leave their rows in that external database. The [CI workflow](../.github/workflows/ci.yml) runs both embedded and PostgreSQL 17 service checks, then the production build and browser suite. A green embedded test alone does not prove multi-connection PostgreSQL locking.

| Failure lab         | Procedure and expected outcome                                                                                                                                     | Inspect                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Stale tab           | Open one workspace in two tabs. Post a note in A, then save B's older version. B gets `CONFLICT`; its note stays available. Refresh and reconcile before retrying. | `Service.update`, expected version in network payload |
| Incomplete closure  | Reach Monitoring, omit root cause or follow-up, and resolve. No event or version increment is committed.                                                           | Validation before JSON update                         |
| Observer mutation   | Send an otherwise valid mutation with `x-demo-role: VIEWER`. Expect `FORBIDDEN`.                                                                                   | Header-to-context mapping and role check              |
| Wrong origin        | Send a request with `Origin: https://different.example`. Expect HTTP 403.                                                                                          | `APP_ORIGIN` and proxy scheme/host                    |
| Storage unavailable | In a disposable run use an unreachable database URL. Health returns 503. Restore configuration and restart; the database promise is process-cached.                | Server log and `getDatabase`                          |

Use `npx playwright show-trace PATH_TO_TRACE.zip` for a failed browser run. Redact environment values and personal notes before sharing logs. A changed form followed by a conflict is not a reason to remove the version check.

## 7. Design tradeoffs and extension exercises

The aggregate JSON document makes atomic history straightforward and avoids one query per timeline event. Its cost is rewriting a growing document and limited SQL reporting. The bounded workspace makes an unpaginated dashboard reasonable for this demo. Manual refresh prevents server polling from silently replacing draft text, at the cost of stale displays.

**Exercise: add a severity change.** Keep the design intact. Add a validated optional field to `UpdateInput`, pass it through the UI, and record the old/new severity in the event. **Solution outline:** apply the change inside the existing row-locked, version-checked transaction; preserve the immutable-resolution rule; test invalid enum values, stale changes, and state/event agreement. Do not update JSON from a new unguarded endpoint.

**Exercise: replace JSON events with a table.** **Solution outline:** add a versioned migration with `(workspace_id, incident_id, event_id)` and ordering metadata; copy historical events; insert a new event and update the incident in one transaction; paginate timelines; test rollback and backfill counts. Do not call this event sourcing unless current state is actually derived/rebuilt from events.

**Exercise: introduce real users.** **Solution outline:** verify identity server-side, derive workspace membership and roles from trusted storage, replace the freely chosen role header, and test cross-workspace access. Cookie flags and UUID unpredictability alone do not implement authorization.

## 8. Interview rehearsal

**Why both a lock and version?** The lock protects the read/modify/write interval; the version protects the user's intent from an earlier client snapshot.

**Why GraphQL here?** The room requests a shaped incident graph through one contract. REST could serve the same aggregate; correctness lives below the protocol.

**Is the timeline immutable?** Append-only through the service, yes. Tamper-proof storage, no.

**How is “health” calculated?** The service strip counts reported active incidents. The health endpoint checks database connectivity. Neither measures actual availability of the sample services.

**What would you build before operational use?** Verified identities, migrations, retention, backup/restore drills, alert ingestion with deduplication, paginated events, durable notifications, and rate controls. Establish real operational requirements before claiming production readiness.

A useful maintainer exercise is to narrate one update from button click to SQL commit, then intentionally reproduce a stale write. If you can explain why exactly one writer succeeds and where its timeline event is committed, you understand the core of Signal.
