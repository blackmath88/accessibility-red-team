# Campaign Architecture Update

Date: 2026-09-29

This note records the current campaign/control-center direction after reviewing reusable open-source communication systems.

Canonical detailed strategy remains in `docs/CAMPAIGN.md`.

Implementation research is in:

- `docs/research/CAMPAIGN_COMMUNICATIONS_REUSE.md`

## Current direction

The campaign is intended to run with minimal manual input while remaining non-autonomous.

```text
discovery
→ contact candidates + provenance
→ verified assessment
→ exact affected URLs + catalogue guidance
→ campaign state in Control Center
→ human-approved initial outreach
→ Exchange Online
→ inbound reply
→ Morrow typed interpretation/draft
→ larger-model critic
→ human GO where outbound communication is needed
→ Exchange Online reply
→ WATCH / confirmed-impact tracking
```

## Key decisions under consideration

1. Campaign/contact information should begin during discovery, not as a separate manual CRM step.
2. Microsoft 365 / Exchange Online should be transport; D1/Control Center should remain canonical campaign state.
3. Morrow should classify and draft, not own sending or state transitions.
4. Consequential outbound replies should receive a larger-model check before the human gate.
5. Human approval should bind to the exact outbound payload.
6. Approved sends should execute through a consume-once permit so retries/double taps cannot duplicate mail.
7. Opt-out, stale approvals and unsupported states must fail closed.
8. Confirmed organisational change and scanner-observed resolution must remain separate evidence types.

No implementation authority is created by this note. The research doc proposes a staged implementation order for later review.
