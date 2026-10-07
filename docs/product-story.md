# Why Signal exists as a portfolio application

Signal explores a specific coordination problem: during a service incident, the latest hypothesis, the current owner, and the final explanation often live in different places. A chat stream is useful for conversation, but it is harder to scan for “what changed?” or “what still needs to happen before we close this?” Signal puts those questions in one response room.

This is a product rationale inferred from the implemented workflow, not a claim about the author's personal origin story, customers, production outages, revenue, or measured incident reduction. All initial service and incident records are fictional. The [service seed](../src/lib/service.ts) and [service catalog](../src/lib/model.ts) make that boundary inspectable.

## A hypothetical incident

Imagine a small software team running a checkout service. Two developers are debugging slow payment requests. One suspects the database connection pool; the other is collecting error samples. A support colleague needs a clear account of impact without changing the response record.

Before a dedicated record, the team might scroll through chat to reconstruct who owns the issue, whether the suspected cause was verified, and what follow-up was promised. Two people could edit an ordinary document from different snapshots and overwrite each other's conclusions.

In Signal, an operator declares an incident, identifies affected catalog services, assigns a commander, and records impact. Notes move the response through Investigating, Identified, and Monitoring. The record cannot be resolved without both a root cause and a follow-up. An observer can inspect it using the demo's read-only mode. These actions are implemented in [room.tsx](../src/components/room.tsx) and [service.ts](../src/lib/service.ts).

The most instructive moment comes when two tabs edit the same incident. One saves; the other is told its version is stale. Its note remains available for reconciliation. That interruption is valuable: the application exposes a coordination conflict rather than silently discarding one person's work.

## Who could benefit, and how

- **Developers learning backend correctness** can see transactions, state machines, and stale-write protection in an understandable domain.
- **Interviewers and maintainers** can trace a small complete product from the UI through a typed GraphQL contract to SQL, then challenge its concurrency assumptions.
- **Incident-response practitioners evaluating workflow ideas** can try mandatory closure information and a contextual timeline using fictional data. Real operational adoption would require substantial identity, integration, and reliability work.

The intended benefit is clearer shared intent and a more useful resolution record. No effectiveness study or time savings are claimed. “Service status” reflects active reports, not telemetry. Signal does not detect outages, page responders, or prove recovery by itself.

## Before and after

| Question                       | Hypothetical ad hoc workflow              | Signal's implemented behavior          |
| ------------------------------ | ----------------------------------------- | -------------------------------------- |
| Who is coordinating?           | Search messages for the latest assignment | Named commander on the incident        |
| What changed?                  | Compare scattered edits                   | Appended events beside current state   |
| Can this close?                | An unchecked label change                 | Root cause and follow-up required      |
| Did another person edit first? | Discover the overwritten text later       | Explicit version conflict              |
| Is this live service health?   | Easy to assume                            | Clearly labeled manual reported status |

The charcoal background, citron highlights, compact response queue, and central event log support the operations-room metaphor. The interface's identity lives in [globals.css](../src/app/globals.css); it is not a generic dashboard template applied to the other portfolio projects.

## An honest 60–90 second demo

**0–15 seconds:** “This is Signal, an incident-response portfolio demo. The services and initial incidents are fictional. This strip shows reported impact, not live monitoring.” Point to an active incident and its commander.

**15–35 seconds:** Declare a short incident using sample information. “I record what is affected and who is coordinating. Updates add to the timeline instead of replacing the explanation.” Post a note and advance one stage.

**35–55 seconds:** Show a second pre-opened tab with the old version. “Both tabs started with the same state. The first save wins; this stale save is rejected, and my note stays here so I can reconcile it.” Refresh deliberately.

**55–75 seconds:** Move the prepared incident to Monitoring, provide root cause and follow-up, and resolve. “Closure is a domain rule enforced on the server, and resolved records are immutable through this API.”

**75–90 seconds:** “The interesting engineering is the row lock plus expected-version check, and an atomic state-and-event write. This does not authenticate responders or send pages. The [technical manual](technical-manual.md) explains what would need to change before operational use.”

For a short live presentation, prepare an incident at Monitoring ahead of time rather than rushing through every stage. Never present the fictional incidents as real production history.
