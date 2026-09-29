# Campaign Architecture Reuse Research

Status: research / implementation input  
Date: 2026-09-29  
Related: CAMPAIGN.md

## Question

What existing open-source communication/campaign systems can we reuse for this flow?

DISCOVERY → contacts with provenance → verified assessment → outreach draft → human GO → Exchange Online → inbound reply → Morrow triage/draft → larger-model review → deterministic gate → human GO → reply → WATCH / impact tracking

The goal is minimal operator work without autonomous customer-facing communication.

## Executive conclusion

Do not import a full campaign, CRM, or agent platform.

The strongest combination is:

1. Quickly for Microsoft 365 / email transport and mailbox-state patterns.
2. Draftcat for governed outbound-action semantics.

Build the campaign engine natively in the existing TypeScript + Cloudflare/D1 + Zod architecture.

Authority boundary:

Control Center / D1 owns campaign state.
Morrow may classify and draft.
A frontier model may review consequential drafts.
Deterministic code validates policy and exact payload.
A human GO approves one exact outbound payload.
Microsoft Graph executes only after that approval is atomically consumed.

This matches the existing project rule: AI may derive meaning; deterministic software owns state and authority.

## 1. Quickly

Repository: https://github.com/AbdelftahZowail/Quickly  
License: MIT

Relevant capabilities: Microsoft 365 OAuth, Microsoft Graph sending, reply/thread handling, unified inbox, reply classification, local Ollama support, bounce/failure classification, test mode, and event/webhook infrastructure.

### app/sender.py

https://github.com/AbdelftahZowail/Quickly/blob/main/app/sender.py

Useful patterns:

- SendResult and SendFailure distinguish success, permanent failure, and transient retry.
- send_email hides Gmail / Office365 / SMTP transport behind one adapter.
- Office365 transport is isolated in _send_via_office365.
- reply continuity accepts conversation_id and reply_graph_message_id.
- test mode produces a fake successful send without delivering mail.
- auth failure can refresh the account token and retry once.
- transport identifiers are retained for later thread continuity.

Reuse the provider-adapter shape, Graph send/reply mechanics, stable transport IDs, bounded token refresh, error taxonomy and side-effect-free test mode.

Do not reuse sales sequencing, warm-up, inbox rotation, click/open tracking or A/B optimization.

Our provider should support roughly: createDraft, sendApprovedDraft, replyApproved, fetchMailboxChanges and test-mode fake execution.

### app/models.py

https://github.com/AbdelftahZowail/Quickly/blob/main/app/models.py

Useful separation:

- EmailLog keeps sent message identifiers separate from campaign enrollment state.
- LeadReply represents a reply event separately.
- Office365Account binds OAuth state to an inbox.
- Office365SyncState persists a Microsoft Graph delta checkpoint.
- campaign status is separate from raw email history.

Reuse the separation, not the sales schema names.

### app/unibox.py

https://github.com/AbdelftahZowail/Quickly/blob/main/app/unibox.py

Useful architectural role: normalize provider-specific mailbox/thread state behind a local inbox model, avoid repeatedly querying the full mailbox, and keep synchronization separate from campaign semantics.

### app/ai_classifier.py

https://github.com/AbdelftahZowail/Quickly/blob/main/app/ai_classifier.py

Useful patterns: AI features are independently configurable, provider/model choice is separated from business logic, reply classification is a small intent problem, and Ollama is supported for local inference.

Do not copy the Python AI layer. Use our Morrow semantic-task contracts and Zod schemas.

## 2. Draftcat

Repository: https://github.com/renezander030/draftcat  
License: MIT

Core principle: AI suggests. Deterministic code decides. The operator signs off.

### docs/tool-gate.md

https://github.com/renezander030/draftcat/blob/master/docs/tool-gate.md

Most useful concept: allowed is not execution.

Flow: proposed action → policy check → human approval → persisted allowed decision → atomic consume → permit: execute → side effect.

Important properties:

- stable action_id
- exact payload/argument binding
- permit expiry
- first valid consume wins
- second consume fails
- changed payload requires fresh approval
- retries are idempotent
- repeat guard avoids duplicate human prompts

Steal this architecture.

Our send gate should bind the exact message payload hash, recipient, thread, campaign action, policy version, review result and expiry. Human GO creates an approved send action; the provider can execute only after atomic consume.

### docs/action-receipts.md

https://github.com/renezander030/draftcat/blob/master/docs/action-receipts.md

Key principle: approval is a persisted fact, not a prompt instruction.

Draftcat binds action, operator, payload hash, policy, binding, lifecycle and expiry. Their reference implementation is documented at internal/approval/receipt.go.

For v1 we only need a smaller D1 receipt:

- action_id
- kind
- thread_id
- recipient
- payload_hash
- frontier_review_id
- approved_by
- approved_at
- expires_at
- consumed_at
- provider_result

Do not import Draftcat's advanced cryptography for v1.

### docs/hitl-protocol.md

https://github.com/renezander030/draftcat/blob/master/docs/hitl-protocol.md

Useful separation: the gate owns authority while the presentation layer only renders the request and returns a decision.

For us, Campaign Gate owns policy, payload hash, expiry, approval and consume-once execution. Control Center owns presentation, edit, GO and reject.

## 3. Other useful first-pass patterns

CreatorReach AI: https://github.com/chaoyubai8-tech/creatorreach-ai

Useful reply artifact: raw reply + history context + category + summary + next action + reply draft + confidence + risk flags. Keep raw mailbox evidence separate from model interpretation.

outreach-crm-dashboard: https://github.com/SaarthurR/outreach-crm-dashboard

Useful ideas: organisation separate from outreach thread, needsAttention as explicit product state, typed reply classification, deterministic fallback, and initial outreach largely fixed with AI only filling a narrow personalization slot.

OutreachIQ: https://github.com/jqaisystems/outreachiq

Useful safety ideas: pre-send blocker/warning gate, do-not-contact list, duplicate-contact blocking, kill switch, human review.

## 4. Project-native data separation

Do not create one giant campaign record.

### Contact observation

Fields: organisation_id, email, display_name, role_candidate, source_url, observed_at, confidence, promotion_status.

Source URL is required provenance.

Suggested role enum: IT_WEB, INCLUSION_ACCESSIBILITY, COMMUNICATIONS, GENERAL, EXTERNAL_SUPPLIER, UNSUITABLE, UNKNOWN.

Morrow may classify the role. It does not create the observation.

### Mailbox observation

Fields: provider_message_id, internet_message_id, conversation_id, direction, sender, recipients, subject, body/body_ref, received_at/sent_at.

This is evidence and must not be overwritten by AI interpretation.

### Semantic derivation

Fields: message_id, intent, summary, finding_refs, suggested_action, reply_required, confidence, risk_flags, task/provider/model versions.

Suggested intent enum: THANK_YOU, QUESTION, CORRECTION, CONFIRMED_CHANGE, REQUEST_MORE_INFO, FORWARD_TO_OTHER_CONTACT, WRONG_CONTACT, OPT_OUT, NEGATIVE_RESPONSE, AUTO_REPLY, UNKNOWN.

UNKNOWN routes to human review.

### Authority/action

Fields: action_id, kind, payload_hash, policy_version, frontier_review_id, approval_state, approved_by, approved_at, expires_at, consumed_at, provider_result.

Neither Morrow nor the frontier reviewer may make consumed_at non-null.

## 5. Proposed runtime

DISCOVERY
→ public contact candidates with source provenance
→ ASSESSMENT
→ verified finding + exact page URL + trusted catalogue module
→ OUTREACH ELIGIBILITY GATE
→ deterministic base draft
→ optional bounded Morrow personalization
→ CONTROL CENTER
→ HUMAN GO
→ consume-once permit
→ Microsoft Graph
→ Exchange Online
→ Graph delta/inbound sync
→ raw message persisted
→ Morrow typed classification
→ safe state-only transitions where allowed
→ substantive reply
→ Morrow draft
→ frontier-model critic
→ deterministic claim/policy checks
→ CONTROL CENTER / NEEDS YOU
→ edit, reject, or GO
→ consume-once reply permit
→ Microsoft Graph

Normally state-only: AUTO_REPLY, OPT_OUT, WRONG_CONTACT, simple THANK_YOU.

Normally NEEDS YOU: QUESTION, CORRECTION, CONFIRMED_CHANGE, REQUEST_MORE_INFO, FORWARD_TO_OTHER_CONTACT, UNKNOWN.

The scarce human task is: Is this exact outbound communication one I am willing to send?

## 6. Frontier model role

The large model should be a critic, not the campaign orchestrator.

Input: inbound message, original outbound, relevant verified findings, catalogue guidance, Morrow classification, Morrow proposed reply and allowed claim set.

Output should be typed: PASS, REVISE, or ESCALATE, plus unsupported claims, tone issues, policy issues and optional suggested revision.

PASS still does not send. It only makes the item eligible for human GO.

## 7. What to copy vs reimplement

Copy/adapt narrowly from Quickly:

- Office365 OAuth/token refresh
- Graph send/reply mechanics
- conversation/message ID handling
- delta-sync pattern
- transport result/error taxonomy
- test-mode behavior

Copy conceptually from Draftcat:

- stable action identity
- exact payload binding
- consume-once permit
- expiry
- idempotent retry
- durable approval state
- action receipt
- authority separated from presentation

Reimplement natively here:

- D1 campaign schema
- campaign state machine
- contact discovery/promotion
- Morrow typed tasks
- frontier reviewer
- Control Center campaign UI
- finding/catalogue linkage
- WATCH/impact linkage

Do not copy cold-sales scoring, automatic sales sequences, tracking pixels, inbox warm-up/rotation, A/B optimization, autonomous send authority, generic campaign-agent MCP, or Draftcat's advanced crypto.

## 8. First implementation slices

### C0 — campaign state only

Add typed contracts and migrations for contact candidate, thread, message, interpretation and action/approval.

Acceptance: an organisation can have IT + inclusion contacts with provenance; a synthetic outbound/inbound message forms a thread; Morrow interpretation stays separate from raw mail; Control Center renders campaign status.

### C1 — governed fake send

Implement draft → payload hash → frontier-review fixture → human GO → atomic permit consume → fake provider.

Acceptance:

- one-character mutation after approval invalidates execution
- double consume cannot send twice
- expired approval fails closed
- rejected review cannot send
- retries are idempotent

### C2 — Microsoft Graph transport

Only after C1 is green: add Exchange config boundary, adapt Quickly Graph mechanics, create/send approved mail, persist Graph identifiers, sync inbound changes, correlate replies.

Do not put Graph tokens in D1 plaintext.

### C3 — Morrow reply orchestration

Use frozen reply fixtures first: raw inbound → typed Morrow intent → legal next-state calculation → optional draft.

Morrow needs no Graph, browser, or mailbox tool access.

### C4 — frontier critic + phone gate

Review Morrow draft; show reasons/risks in Control Center; edit/reject/GO; create exact send permit.

## 9. Tests worth stealing conceptually

From Draftcat:

1. identical retry does not generate a second approval
2. payload mutation after approval fails
3. permit expiry fails closed
4. consume is atomic
5. second consume fails
6. denial remains denial
7. restart does not lose pending approval

From Quickly:

1. transient vs permanent provider errors are distinct
2. token refresh is bounded
3. thread/conversation identifiers survive replies
4. test mode has no side effect
5. inbound sync uses durable delta state

Project-specific:

1. opt-out blocks future sends
2. contact without provenance cannot auto-promote
3. Morrow cannot mutate mailbox evidence
4. frontier PASS cannot send
5. only a human-approved unconsumed permit reaches provider
6. confirmed impact and observed resolution remain separate

## 10. Decision

Build the campaign engine natively in Control Center/D1/TypeScript, borrow Microsoft Graph plumbing from Quickly, and borrow governed action-permit semantics from Draftcat.

Do not install either project as a service.
Do not introduce a generic agent runtime.
Do not give Morrow Exchange tools.

Minimal architecture:

Morrow interprets.
Frontier model checks.
Deterministic gate authorizes.
Human approves.
Graph executes.

## 11. Next architecture question

Before implementing Exchange Online, decide whether the Microsoft Graph adapter should run in the Cloudflare control plane or through the existing Nebuchadnezzar outbound worker.

Evaluate secret storage, OAuth refresh, Graph delta/webhook requirements, availability, D1 state ownership, Access boundary, deployment complexity and failure recovery.

Do not choose Nebuchadnezzar merely because Morrow already runs there. Mailbox transport and local AI are separate concerns.


---

## 12. Run 2 — Microsoft Graph placement

Question:

Should Exchange Online / Microsoft Graph transport run in the Cloudflare control plane or on Nebuchadnezzar?

### Recommendation

**Run Microsoft Graph transport in the Cloudflare control plane. Keep Nebuchadnezzar out of the mailbox authority path.**

Reasoning:

1. **D1 already owns campaign state.** Mailbox message IDs, conversation IDs, delta cursors, send actions and approval receipts belong next to the campaign state they advance.

2. **Graph supports pull-based incremental sync.** Outlook message delta queries return opaque nextLink/deltaLink state. Persisting the final deltaLink lets the system fetch only new/changed messages on later runs. This maps directly to a D1 sync-state row.

3. **Cloudflare Workers can run periodic sync.** A scheduled Worker/Cron trigger can poll the Inbox delta endpoint without a permanently running inbound service. This is simpler for v1 than change-notification webhooks.

4. **Cloudflare Workers support encrypted secrets.** Static application credentials can remain Worker secrets rather than entering D1 or the client UI.

5. **Nebuchadnezzar is already the semantic compute boundary.** Putting Exchange credentials and mailbox transport there would mix two independent concerns and make campaign availability depend on the home/local worker.

6. **Morrow does not need mailbox access.** The control plane can persist the bounded inbound message/context and hand only the semantic task to the outbound Nebuchadnezzar worker.

### Proposed v1 auth

Prefer a dedicated observatory mailbox plus **app-only Microsoft Graph access scoped to that mailbox through Exchange Online RBAC for Applications**.

Microsoft documents Exchange Application RBAC as the current resource-scoped mechanism replacing legacy Application Access Policies. It can scope application Mail.Read / Mail.ReadWrite / Mail.Send roles to a defined Exchange resource scope.

This is preferable to a broad tenant-wide application grant.

Required permissions should be challenged to the minimum actually needed:

- Mail.Read for inbound sync
- Mail.Send for sending
- Mail.ReadWrite only if creating/updating drafts in the mailbox is required

Do not grant broader Exchange access merely for convenience.

### Proposed sync strategy

Start with pull/delta rather than Graph webhooks:

    Worker Cron
      → read stored deltaLink
      → Graph Inbox messages/delta
      → page through nextLink
      → persist new raw message observations
      → save final deltaLink
      → enqueue semantic interpretation if relevant

Why:

- no public Graph notification callback required
- no subscription-renewal lifecycle in v1
- easy deterministic replay/testing
- cursor fits naturally in D1
- a few minutes of reply latency is acceptable for this campaign

Later, change notifications can be added as a wake-up signal while delta remains the source of truth.

### Send path

    Control Center human GO
      → atomic consume of approved action
      → Cloudflare Graph adapter
      → Graph send/reply
      → persist provider acceptance + message IDs
      → later delta sync observes mailbox state

The send adapter must never accept arbitrary draft text from Morrow.

It receives only an already-approved action ID whose payload hash matches the staged message.

### Nebuchadnezzar role after this split

Nebuchadnezzar remains:

- Morrow inference
- semantic classification
- bounded draft generation
- optional local evaluation

It does **not** receive:

- Graph client secret
- Exchange mailbox credentials
- Mail.Send authority
- direct mailbox polling authority

Flow:

    Cloudflare/D1
      → bounded semantic job
      → Nebuchadnezzar/Morrow
      → typed result
      → Cloudflare/D1

This keeps local-model failure from blocking mailbox synchronization or corrupting campaign state.

### Secret boundary

Do not store the Graph client secret in D1.

For app-only v1:

- Entra application/client ID: configuration
- tenant ID: configuration
- client secret/certificate: Cloudflare secret
- target mailbox ID/address: configuration
- Exchange RBAC scope: tenant-side policy

If later using delegated OAuth instead, refresh-token rotation would require an encrypted durable token store and a key held separately as a Worker secret. App-only scoped service access is operationally cleaner for this single-purpose mailbox.

### Failure behavior

- Graph unavailable → campaign sync/send remains pending; no Morrow workaround
- Morrow unavailable → raw reply is still synchronized; interpretation remains pending
- frontier reviewer unavailable → outbound reply remains unsendable
- approval expires → require a fresh human GO
- Graph send transient failure → retain approved action but do not consume twice; retry policy must preserve exactly-once semantics
- permanent Graph failure → surface NEEDS YOU / transport error

### Why not Graph on Nebuchadnezzar?

It would:

- couple communication availability to a local machine
- put customer-facing mail credentials beside the local model runtime
- duplicate state between worker and D1
- complicate retries after disconnect/reboot
- make a semantic worker unnecessarily authoritative

No current requirement earns that complexity.

### Proposed architecture decision

For campaign v1:

> **Cloudflare owns mailbox transport and campaign authority; Nebuchadnezzar owns bounded local semantic work.**

This remains a proposal until the Exchange Online app-registration/RBAC setup is tested against the actual bridge-work tenant.
