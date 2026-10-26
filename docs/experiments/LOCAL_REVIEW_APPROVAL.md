# Local signed finding approval

Date: 2026-10-26

This is the bounded local finish for the publication path. An operator prepares a canonical review request only
after re-hashing the actual evidence bytes. A human then signs those exact request bytes with an SSH key that is
not available to workers. The existing exporter verifies the signature, re-hashes the evidence again and evaluates
the finding through the existing publication policy.

This approves a finding, not a probe. The skip-link probe remains a candidate and the local command refuses the
automated assessment path.

## Trust boundary

The permitted reviewer is configured outside candidate/model input in an OpenSSH `allowed_signers` file. The
reviewer principal in the signed request must match that file, and `ssh-keygen -Y verify` must validate the detached
signature in namespace `accessibility-red-team-finding-review-v1`.

The private key must be reviewer-held: do not place it in the repository, worker environment, forwarded SSH agent or
another location accessible to the automation account. File ownership or mode bits do not prove human identity when
workers share the same operating-system account. The cryptographic boundary is credible only when workers cannot
invoke or read the signing key; a hardware-backed key or a separate human workstation is preferred. The operator
must also treat the chosen `allowed_signers` file as trusted configuration and inspect its key fingerprint.

The approval store is JSON Lines and recording uses append mode; a new decision never overwrites an older one.
Every line is independently signed. Deletion remains a denial-of-service risk unless the operator backs the store
up or protects it outside the worker account, but deletion cannot manufacture a valid approval. Modified or
unauthorized lines fail the whole export. A valid but stale approval remains historical and cannot authorize changed
report, assessment, observation/execution, claim, evidence or probe-version content.

## End-to-end command sequence

The committed sample under `samples/local-review/` is synthetic and is safe only for rehearsal. Never treat its
simulated result as real sign-off. Replace the paths and reviewer principal for a real finding.

First create trusted reviewer configuration outside the repository. The public key is safe to expose; the private
key is not:

```bash
install -d -m 700 /trusted/operator/accessibility-review
printf '%s %s\n' 'achim-reviewer' "$(cat /path/to/reviewer_key.pub)" \
  > /trusted/operator/accessibility-review/allowed_signers
chmod 600 /trusted/operator/accessibility-review/allowed_signers
ssh-keygen -lf /path/to/reviewer_key.pub
```

Prepare the request. This is the evidence-verification step, not approval:

```bash
npm run publication:review-request -- \
  docs/experiments/samples/local-review/report.json \
  docs/experiments/samples/local-review/candidates.json \
  --bindings docs/experiments/samples/local-review/bindings.json \
  --evidence-root docs/experiments/samples/local-review \
  --candidate sample-assisted \
  --reviewer achim-reviewer \
  --note 'I reviewed this exact finding, applicability and evidence.' \
  --out /trusted/operator/accessibility-review/request.json
```

The human reviewer must inspect the request and evidence, confirm the displayed SHA-256 and then intentionally sign
the exact file. This is the one action that automation cannot perform:

```bash
sha256sum /trusted/operator/accessibility-review/request.json
less /trusted/operator/accessibility-review/request.json
ssh-keygen -Y sign \
  -f /path/to/reviewer_key \
  -n accessibility-red-team-finding-review-v1 \
  /trusted/operator/accessibility-review/request.json
```

Record the verified signature, then export. Both commands verify against the separately configured reviewer list;
the export also re-verifies every approval and every artifact byte:

```bash
npm run publication:review-record -- \
  /trusted/operator/accessibility-review/request.json \
  /trusted/operator/accessibility-review/request.json.sig \
  --allowed-signers /trusted/operator/accessibility-review/allowed_signers \
  --approvals /trusted/operator/accessibility-review/approvals.jsonl

npm run publication:export-approved -- \
  docs/experiments/samples/local-review/report.json \
  docs/experiments/samples/local-review/candidates.json \
  --bindings docs/experiments/samples/local-review/bindings.json \
  --evidence-root docs/experiments/samples/local-review \
  --allowed-signers /trusted/operator/accessibility-review/allowed_signers \
  --approvals /trusted/operator/accessibility-review/approvals.jsonl \
  --out /trusted/operator/accessibility-review/publication.json
```

For a real acceptance, use the real report/candidate/bindings/evidence paths, inspect the request fields and evidence,
and sign only if the assessment and applicability are correct. No real key or real decision is created by the tests.

## Failure behavior

Request preparation refuses missing or changed artifact bytes and refuses automated findings. Export includes a
manual/assisted finding only when the signed request matches the exact current source-report bytes, candidate ID,
assessment, observation/execution, subject, obligation, claim/evidence versions, evidence refs and nullable probe
identity/version fields. Missing or stale approval leaves the candidate rejected; malformed, modified or
unauthorized approval-store entries abort the export. Output cannot alias any source, evidence, signer or approval
input. Legacy source findings retain `legacy_snapshot_not_policy_evaluated` and are never silently promoted.
