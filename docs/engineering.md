# Engineering walkthrough

## Follow an update

The client sends updateIncident(id, version, input). Apollo checks the API shape. Service.update rejects observers and validates the input. A transaction locks the incident row using its workspace and incident ID. The service compares the persisted version to the expected version, validates the next state, appends an event, increments the version, and saves one JSONB record. Failure rolls back the entire update.

The row lock handles competing writes; the version check detects a stale client's intent. Both matter. A lock alone would serialize two writes but could still let the later stale write replace the earlier user's values. The test sends two updates with the same version and expects exactly one success.

The main screen loads the incident graph, services, and members in one GraphQL operation. Default field resolvers read JSON properties; there is no SQL query per event. GraphQL does not automatically optimize databases or implement authorization.

## Useful interview questions

**Why GraphQL?** The screen selects incidents with nested events and related catalog data through a typed contract. REST could also provide an aggregate endpoint. GraphQL is a choice about client data access, not a prerequisite for correct incident coordination.

**What happens when two responders save simultaneously?** One transaction locks the row first. It increments the version. The second sees a different version and returns CONFLICT. The client preserves its unsaved note and asks the user to refresh.

**Why not allow arbitrary status changes?** The explicit state machine makes workflow intent testable. This implementation permits a note at the same stage or one forward step. A production organization might require reopening, emergency closure, or custom states; those should be explicit transitions with recorded reasons.

**Is this event sourcing?** No. Current state and events share a JSONB record. The timeline is append-only through the API but not immutable to database administrators. A separate normalized event table with append-only privileges would offer stronger operational guarantees.

**What does service health mean?** It is derived from active incident declarations. There are no monitoring integrations and no automatic dependency propagation. Calling it uptime or live telemetry would overstate the implementation.

**How does the demo authenticate people?** It does not. A random cookie separates sample workspaces and a role header simulates permission checks. Real authorization must derive workspace and role from verified identity and membership.

**What would you scale first?** Paginate incidents, normalize events, use durable notification delivery, ingest alerts with deduplication, add retention and monitoring, and replace the initial schema initializer with migrations. The current field-count rule is not a full query-cost model.

## Rehearsal

Explain the product in 30 seconds. Declare a new incident, post evidence, advance its state, and show the version number and event log. Demonstrate a stale-tab conflict. Close with one deliberate limit and the next implementation step. Describe this as a portfolio implementation, without claiming production customers, outage reductions, or deployment history.
