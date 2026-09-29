# Campaign Communications Reuse Research

Status: implementation research  
Date: 2026-09-29  
Related: `docs/CAMPAIGN.md`

## 1. Question

How should the observatory implement low-manual-input campaign communication using:

- contact discovery during Scout/discovery;
- Microsoft 365 / Exchange Online as transport;
- Morrow for local semantic interpretation and drafting;
- a larger model for consequential outbound review;
- explicit human approval before sending;
- durable campaign/thread state in the Control Center?

The goal is not to build a generic AI sales agent.

The target is a governed communications subsystem where:

> automation prepares and interprets; deterministic code owns state and permissions; a human authorizes outbound communication.

---

## 2. Repositories reviewed

### Quickly

Repository: <https://github.com/AbdelftahZowail/Quickly>

Relevant files reviewed:

- `app/sender.py`
- `app/unibox.py`
- `app/ai_classifier.py`
- `app/models.py`
- `app/webhooks.py`

License: MIT.

### Draftcat

Repository: <https://github.com/renezander030/draftcat>

Relevant files/docs reviewed:

- `docs/tool-gate.md`
- `docs/action-receipts.md`
- `docs/hitl-protocol.md`
- `README.md`

License: MIT.

Additional useful patterns were identified in:

- `SaarthurR/outreach-crm-dashboard`
- `chaoyubai8-tech/creatorreach-ai`
- `jqaisystems/outreachiq`

Those inform schema and UX ideas, but Quickly and Draftcat are the primary implementation references.

---

## 3. Strongest finding: do not import either system wholesale

Neither Quickly nor Draftcat should become a runtime dependency.

The useful pattern is to copy small architectural ideas into the existing TypeScript/Cloudflare/worker architecture.

Reasons:

- Quickly is a full cold-email platform with campaigns, sequencing, deliverability tooling and analytics that this project does not need.
- Draftcat is a separate Go governance runtime whose core ideas can be implemented directly in the existing Control Center.
- Adding either whole system would duplicate state, deployment and authorization boundaries.
- The observatory already has its own deterministic control plane and evidence model.

Recommended approach:

> borrow concrete transport, thread, approval and audit patterns; implement them natively in this repository.

---

## 4. Quickly: Microsoft 365 / Graph patterns worth stealing

### 4.1 Provider boundary

`app/sender.py` keeps provider-specific mail transport behind a generic send function.

The observatory should use the same separation conceptually:

```text
Campaign engine
    ↓
MailProvider
    ↓
MicrosoftGraphProvider
```

Campaign/domain code should not contain Graph endpoint details.

### 4.2 Preserve Outlook conversation state using Graph reply drafts

Quickly contains an important implementation lesson in `app/sender.py`.

For a real Outlook reply, it does not merely send a new message with RFC `In-Reply-To` headers.

Its documented reasoning is that Outlook threading also depends on Exchange conversation state. The code therefore uses a three-step reply path:

```text
existing Graph message ID
      ↓
POST .../messages/{id}/createReply
      ↓
Graph creates a reply draft with conversation state
      ↓
update/populate the draft
      ↓
POST .../messages/{draftId}/send
```

This is directly relevant to the observatory.

Recommended rule:

- new campaign mail: create/send a new message;
- reply to an existing municipality thread: use the Graph reply-draft path and retain Graph message/conversation identifiers.

Do not rely solely on subject matching or generated RFC headers for thread continuity.

### 4.3 Persist transport identifiers

Quickly stores identifiers such as:

- RFC/internet message ID;
- provider message ID;
- conversation/thread ID;
- sent timestamp.

We should do the same.

Minimum transport identity for an outbound/inbound message:

```text
provider
provider_message_id
internet_message_id
conversation_id
sent_or_received_at
```

This permits deterministic correlation before an LLM sees a reply.

### 4.4 Local inbox mirror

Quickly maintains local thread/message metadata rather than treating the remote mailbox as the application's only state.

We should copy the principle, but use our own smaller schema.

Exchange Online remains transport.

The Control Center database remains canonical campaign state.

### 4.5 Event boundary

Quickly emits explicit events such as reply and send events through a webhook/event layer.

For us, equivalent internal events should be typed and durable:

```text
campaign.message.sent
campaign.message.received
campaign.reply.classified
campaign.reply.reviewed
campaign.action.approved
campaign.action.executed
campaign.contact.opted_out
campaign.impact.confirmed
```

This is preferable to UI components directly mutating campaign state.

---

## 5. Quickly patterns we should NOT copy

Do not import:

- automated email sequences;
- inbox rotation;
- warm-up logic;
- open pixels;
- click tracking;
- lead scoring;
- sales funnel semantics;
- automated follow-up pressure;
- A/B campaign optimization.

These conflict with the project's communication posture.

Our metric is useful improvement, not response/open/conversion optimization.

---

## 6. Draftcat: approval/action-gate patterns worth stealing

Draftcat's architecture is unusually close to the observatory's control philosophy.

Its core rule is:

> AI may propose an action; deterministic code owns validation, approval state and execution.

### 6.1 Bind approval to the exact outbound payload

Draftcat hashes the exact proposed arguments/payload.

A human approval therefore means:

> approve this exact recipient + subject/body + action

not:

> allow the AI to send some email.

Recommended campaign action:

```json
{
  "actionId": "campaign-action-...",
  "kind": "SEND_EMAIL",
  "threadId": "...",
  "recipient": "...",
  "payloadHash": "sha256:...",
  "policyVersion": "...",
  "status": "PENDING_APPROVAL"
}
```

If the draft changes after approval, the payload hash changes and the previous approval is invalid.

### 6.2 Stable action identity and idempotency

Draftcat requires a stable `action_id`.

A retry of the same action can recover existing state.

The same action ID with changed arguments is rejected.

This is ideal for phone/mobile Control Center behavior where double taps, network retries and worker restarts are realistic.

### 6.3 Approval is not execution permission until consumed

Draftcat separates:

```text
APPROVED
    ↓
consume permit atomically
    ↓
EXECUTE ONCE
```

This is worth copying.

For campaign mail:

```text
human presses GO
     ↓
approval row written
     ↓
sender atomically consumes permit
     ↓
Graph send/reply executes
     ↓
permit cannot execute again
```

This prevents duplicate sends after retries or crashes.

### 6.4 Fail closed

Draftcat defaults to denial when a tool/action is not explicitly permitted.

Our equivalent:

- no valid contact → cannot send;
- opt-out → cannot send;
- stale/changed draft after approval → cannot send;
- unsupported campaign state → cannot send;
- reviewer failure on a reply requiring review → cannot send;
- expired approval → cannot send.

### 6.5 Durable pending approvals

Draftcat persists approval state before notifying the operator.

We should persist first, render second.

Control Center reloads must not lose pending outbound actions.

### 6.6 Action receipts

Draftcat records:

- stable action ID;
- payload hash;
- policy;
- decision;
- approver;
- decision time;
- execution state.

We do not need its cryptographic/zero-knowledge layer initially.

But we should copy the receipt model:

```text
what was proposed?
what exact payload was approved?
who approved it?
which checks passed?
what executed?
what provider identifier resulted?
```

---

## 7. Draftcat patterns we should NOT copy now

Do not import:

- separate Go service;
- Telegram approval channel;
- generic arbitrary tool gate;
- quorum approval;
- zero-knowledge approval proofs;
- encrypted voting;
- generalized agent webhook runtime.

Our Control Center already is the intended operator surface.

Implement only the minimal `SEND_EMAIL` / `SEND_REPLY` action gate required by this project.

---

## 8. Additional useful schema patterns

### outreach-crm-dashboard

Useful separation:

```text
organisation/contact
        ↓
outreach thread
        ↓
needs_attention
draft_status
latest_summary
outcome
```

Useful principle:

- organisation state is separate from communication-thread state.

### CreatorReach AI

Useful derived reply record:

```text
raw reply
history context
category
summary
next action
draft
confidence
risk flags
```

For the observatory, keep the raw inbound message immutable and store Morrow interpretation separately.

### OutreachIQ

Useful controls:

- do-not-contact state;
- duplicate-send blocker;
- pre-send checklist;
- kill switch;
- human-reviewed sending.

We should implement the first three before campaign scale.

---

## 9. Proposed native architecture

```text
SCOUT / DISCOVERY
      │
      ├── organisation
      ├── public contact candidates
      └── source + confidence
      │
      ▼
ASSESSMENT / VERIFY
      │
      ├── verified findings
      ├── exact affected URLs
      └── trusted catalogue mappings
      │
      ▼
CAMPAIGN ENGINE (D1 / Control Center state)
      │
      ├── contact selection
      ├── outreach eligibility
      ├── thread state
      └── action state
      │
      ▼
INITIAL DRAFT
mostly deterministic template
      │
      ▼
HUMAN GO
      │
      ▼
consume-once SEND_EMAIL permit
      │
      ▼
MICROSOFT GRAPH / EXCHANGE ONLINE
      │
      ▼
INBOUND REPLY
      │
      ▼
deterministic conversation/message correlation
      │
      ▼
MORROW
typed intent + finding refs + proposed next action
      │
      ▼
MORROW DRAFT
only when a reply is useful
      │
      ▼
FRONTIER REVIEW
claims/tone/policy critic
      │
      ▼
CONTROL CENTER
human review where needed
      │
      ▼
consume-once SEND_REPLY permit
      │
      ▼
GRAPH createReply → send
```

---

## 10. AI responsibility split

### Deterministic

Own:

- campaign state;
- thread identity;
- contact provenance;
- opt-out;
- eligibility;
- finding and URL references;
- catalogue mapping;
- send authorization;
- exact payload hashing;
- Graph execution;
- event/receipt recording.

### Morrow

Possible typed tasks:

1. classify discovered contact role;
2. classify inbound reply intent;
3. map reply references to already-shared findings when evidence supports it;
4. propose a legal next action;
5. draft restrained reply text from bounded context.

Example reply intent enum:

```text
THANK_YOU
QUESTION
CORRECTION
CONFIRMED_CHANGE
REQUEST_MORE_INFO
FORWARD_TO_OTHER_CONTACT
WRONG_CONTACT
OPT_OUT
NEGATIVE_RESPONSE
AUTO_REPLY
UNKNOWN
```

`UNKNOWN` remains legal and routes to human review.

### Larger model

Use as a critic for consequential outbound replies, not as campaign orchestrator.

Possible output:

```json
{
  "verdict": "PASS",
  "unsupportedClaims": [],
  "policyIssues": [],
  "toneIssues": [],
  "suggestedRevision": null
}
```

or `REVISE` / `ESCALATE`.

The large model cannot send.

---

## 11. Suggested D1 entities

Names are provisional.

### campaign_contacts

- id
- organisation_id
- email
- name
- role
- source_url
- source_type
- confidence
- status
- do_not_contact
- discovered_at
- verified_at

### campaign_threads

- id
- organisation_id
- contact_id
- provider
- conversation_id
- state
- needs_attention
- latest_summary
- last_message_at
- created_at
- updated_at

### campaign_messages

- id
- thread_id
- direction
- provider_message_id
- internet_message_id
- subject
- body_ref/body
- received_or_sent_at
- immutable_content_hash

### campaign_interpretations

- id
- message_id
- task_version
- model/provider
- intent
- summary
- confidence
- finding_refs
- proposed_action
- risk_flags
- input_hash
- created_at

### campaign_actions

- id
- thread_id
- kind
- payload_hash
- policy_version
- state
- approved_by
- approved_at
- expires_at
- consumed_at
- provider_result_id

### campaign_events

Append-only event/audit layer for state transitions.

---

## 12. Recommended implementation order

### C0 — schema only

Add campaign/contact/thread/message/action contracts and migration.

No email integration.

### C1 — discovery contact candidates

Scout/discovery records public contact candidates with source URL and role confidence.

No automatic sending.

### C2 — Control Center campaign surface

Show:

- contacts;
- assessment readiness;
- findings/catalogue readiness;
- campaign state;
- messages;
- pending human actions.

### C3 — Microsoft Graph transport

Implement a narrow native Graph adapter:

- create initial draft/message;
- read/sync relevant mailbox messages;
- create reply draft from Graph message ID;
- send approved draft;
- retain conversation/message IDs.

Do not add sequences or tracking pixels.

### C4 — exact-payload human gate

Implement:

- action ID;
- payload hash;
- approve/edit/reject;
- expiry;
- consume-once execution;
- receipt/event.

### C5 — Morrow reply classifier

Use frozen inbound thread context.

Typed output only.

No send authority.

### C6 — Morrow drafting + frontier review

Only after classifier/eval evidence supports it.

### C7 — impact integration

Connect:

```text
CONFIRMED_CHANGE
→ finding ref
→ campaign impact record
→ optional rescan/WATCH
```

Keep confirmed organisational attribution distinct from scanner-observed resolution.

---

## 13. Things to copy nearly verbatim conceptually

From Quickly:

1. provider adapter boundary;
2. store provider message and conversation IDs;
3. Graph reply via existing provider message identity, not subject guessing;
4. local mailbox/thread mirror;
5. typed internal communication events.

From Draftcat:

1. stable action ID;
2. exact payload hash;
3. changed payload invalidates old approval;
4. durable pending approval;
5. approve → consume once → execute;
6. fail closed;
7. append-only action receipt.

---

## 14. Things not to build

Do not build:

- generic CRM;
- generic cold-email platform;
- autonomous campaign agent;
- arbitrary MCP send-email tool exposed directly to Morrow;
- automated sales sequences;
- open/click surveillance;
- response optimization engine;
- a second orchestration runtime.

---

## 15. Architectural claim

The communications subsystem should preserve the same architecture as the scanner:

> **Messages and evidence are observations; AI produces typed derived interpretations; deterministic state controls legal next actions; only a human-approved, payload-bound permit can produce an outbound side effect.**
