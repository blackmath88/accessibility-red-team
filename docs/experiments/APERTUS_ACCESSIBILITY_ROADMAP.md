# Apertus for accessibility investigations — use-case and adaptation roadmap

Date: 2026-10-30
Status: vision and research plan, not an implemented provider, trained model or partnership.
Pilot: [Basel scope-to-evidence plan](BASEL_SCOPE_TO_EVIDENCE_PILOT.md).

## Proposition

Build a Swiss public-service accessibility investigation workflow that can use Apertus for named, measurable
tasks while retaining deterministic measurement, bounded execution and independent acceptance.

The partner proposition is a real evaluation and adaptation use case: explain evidence, abstain on unsupported
causes, recognize contradictions, group shared components and support multilingual public-service triage.
Do not lead with a logo or imply that Claude-generated measurements constitute an Apertus-powered investigator.

Current status: no Apertus adapter was found in src/experimental/adaptive/providers at the inspected #58 head.
Existing ModelProvider is a small completion interface with declared-but-unverified capabilities, suitable for a
bounded adapter. Apertus access recalled from an earlier hackathon is a lead, not proof that a key/model/credit works.

## What the linked ecosystem repository contributes

Read rnckp/awesome-ai-switzerland README on 2026-10-30, file blob SHA
79cb95adaee798dc04673bb69d4d9691309a0e18.
https://github.com/rnckp/awesome-ai-switzerland

It is explicitly independent and community-maintained. Use it as a discovery index, not authority about
model capabilities, provider certification, project success or partner interest.

Selected leads:
- Official Swiss AI/Apertus model cards, inference ecosystem and fine-tuning recipes.
- Community patterns for cited evidence, constrained decisions, replay, task-specific evaluation and adaptation.
- Official endpoint/model compatibility resources to verify rather than assuming generic chat compatibility.

We did not audit the implementations of the listed community projects. Do not import their frameworks or claim
their evaluation scores transfer to accessibility. No evidence was found here that a partnership is already offered
to this project or that training support/credits are available.

## Primary-source checks and remaining verification

Read 2026-10-30:
1. https://www.apertus-ai.org/articles/2026-09-apertus-1-5-ga/
   Official ecosystem article describes 8B/70B releases and multiple serving options, including Swiss and global
   providers. It notes that capabilities depend on inference configuration. Provider listings are discovery leads,
   not an assurance about our endpoint, retention, contract, residency or price.
2. https://huggingface.co/swiss-ai/Apertus-v1.5-8B
   Official model repository. Exact weights/revision, authored usage instructions, runtime/chat template,
   thinking/tool compatibility and access conditions must be checked for the selected route before implementation.
   Auto-generated serving snippets are not a tested recipe for Nebu.
3. https://github.com/swiss-ai/apertus-finetuning-recipes
   Official full/LoRA adaptation starting point. Pin recipe commit and intended model generation; older recipes
   and current documentation differ, so no hardware promise is made here.
4. https://www.swiss-ai.org/industry-partnerships
   Swiss AI describes SME/community and partnership entry points. This provides a legitimate conversation route,
   not confirmation of interest, sponsorship or eligibility. No message was sent.

## Adaptation ladder: configuration first, weights after evaluation

| Stage | What changes | Exit evidence |
| --- | --- | --- |
| A0: unmodified Apertus baseline | provider adapter and exact checkpoint; no training | recorded task outputs and failures |
| A1: task configuration | prompt, examples, output schema, context budget and decoding | held-out quality versus A0 |
| A2: evidence-grounded domain pack | cited standards excerpts, broker contract and compact observation packets | fewer unsupported claims without lost supported findings |
| A3: specialist LoRA/SFT adapter | weights trained from curated task examples | improvement over A1/A2 on untouched holdouts with reproducible training |
| A4: expanded investigator role | only tasks with demonstrated capability and containment | generated probe/control/replay outcomes on unseen mechanisms |

Configuration, retrieval and weight adaptation are distinct claims. Retrieval is useful for current standards;
do not bake changing legal applicability into weights and call it a source of legal authority.
Training is a later experiment, not a prerequisite for the Basel pilot.

First tasks to evaluate:
- Extract task/owner relationships with source spans, UNKNOWN when absent.
- Classify evidence claims as supported / contradicted / insufficient, citing exact measurements.
- Rank possible next measurements from a bounded option list.
- Propose reversible clusters of repeated template observations while retaining originals.
- Draft a German evidence summary without increasing certainty or inventing AT impact.

Do not start Apertus as unrestricted browser explorer, final judge of its own claims or authority over scope.
Generated code design can be tested later; a schema-valid response is not a correctness result.
Screenshot reasoning is a separate multimodal evaluation only if the actual endpoint supports and receives images.

## First evaluation — proposed, not executed

Use 30 compact packets: 10 supported, 10 contradicted, 10 insufficient. Include faint text, partial occlusion,
mobile clipping, visible-focus false alarms and correct controls. Avoid calling every packet an independent case.
Include German public-service wording, but do not imply nationwide multilingual performance from German tests.

- Historical M1/t1/t2 are exposed development examples, not blind test cases.
- Split at mechanism/template/site-family level BEFORE prompt tuning or training. Near-duplicate viewports,
  translations, revisions and repaired/control pairs stay in the same split.
- Have an independent evaluator hold back mechanisms/labels and validate the answer key.
- Repeat each frozen packet 3 times per chosen condition to observe variability, not to claim a population rate.
- Core conditions: Apertus A0, Apertus configured A1/A2, Claude reference. Mistral historical results are context;
  new Mistral comparisons must use identical input packs and recorded settings.
- Record system AND user prompts, schema constraints, context/truncation, model/checkpoint, serving stack,
  quantization, thinking mode, sampler, latency, usage, abstentions and parsing failures.
- Judge is not the label authority. Use source measurements/control construction and, where needed, expert review.
- Promotion criterion for one bounded shadow role: zero contradicted claims on the frozen set and at least
  Claude reference supported-claim recall on those same packets, with review burden and resource use reported.
  Passing a small set qualifies only that role/configuration for shadow use; no general reliability claim.
- If Apertus fails, retain its results and narrow/change the task. Do not cherry-pick only successful cases.

Initial shadow calls consume frozen evidence only and cannot trigger more browser requests or publish findings.
Apertus absence must not block the deterministic/Claude pilot.

## Training data and weights: what we could offer a partner

Candidate examples: symptom + sanitized observation packet + bounded broker contract → proposal, validated probe,
countertest, cited conclusion or justified abstention. Include failed attempts and corrections with attribution.
Train for measurement-grounded restraint and executable contract use, not fluency alone.

Before dataset release/training:
- Review rights for page text/screenshots, standards excerpts and model-generated outputs. Publicly viewable
  does not mean redistributable training data; subscription outputs may have provider-specific use restrictions.
- Review attribution, personal data, embedded keys, security tokens and third-party content.
- Prefer owned synthetic fixtures and explicitly permissioned partner material.
- Human/domain review of labels; do not treat a Claude judge's approval as ground truth.
- Keep validation/test mechanisms isolated from synthetic generation and training, with contamination records.
- Define model/adapter/recipe/data licenses, provenance, intended use and rollback.
- Confirm training compute/backend separately from inference; do not assume Arc B60 or 24GB makes a recipe viable.

No model downloads, access-term acceptance, training jobs or hosting procurement under this planning slice.

## Partnership concept — draft, not outreach

Potential parties and distinct asks:
- Basel service/platform owners: select one task, verify observed behaviour and agree a permissioned pilot.
- Accessibility specialist and AT users: validate actual task impact and repair; participation must be arranged.
- Apertus/Swiss AI team or a suitable applied research group: evaluate the domain task, adaptation approach,
  failure taxonomy and reusable dataset/benchmark.
- Serving provider/Public AI community: verify an endpoint, actual model version, usage rights, data policy and
  possible evaluation credits. Listing in a directory is not endorsement.

Offer: a working evidence-first demonstrator, honest baseline/model failure analysis, a permissioned evaluation
set and a reproducible improvement question. Ask for technical feedback and a bounded evaluation collaboration,
not an unearned sponsorship badge. Owner reviews any future outreach first.

Claims ladder:
- Now: “Planning Apertus evaluation for accessibility evidence tasks.”
- After real logged calls: “Evaluated Apertus [checkpoint/config] on [specific task and set].”
- After actual integration: “Apertus performs [named role]; Claude and deterministic components perform [others].”
- Only after reproducible training: “Uses an accessibility-adapted Apertus adapter [version], evaluated on [holdout].”
- Never claim local/Swiss-only execution if a Claude or external API step handled the data.

## Routing and immediate build seam

Add an experimental ModelProvider adapter only after selected endpoint capability/auth/data/cost preflight.
Reuse the provider-neutral completion interface, validation, cancellation, timeouts and aggregate budgets.
Native tool calling is not required for the first JSON/text evidence task.
Verify JSON behaviour and actual returned model identity; missing telemetry stays unknown.
Keep per-provider budgets separate; the existing Mistral USD 5 authorization does not fund Apertus.

Claude Code subscription can coordinate external model calls made through reviewed adapters using separately
authorized credentials. That does not turn the Claude subscription into Apertus access.
Orca can run useful independent packets; no mandatory extra agent framework.

Apertus local on Nebu versus hosted 70B is a benchmark choice, not ideology: pin configuration and measure latency,
quality, fit and data handling before selecting a production role. Host suitability is currently unverified.

Readiness artifact to prepare next: endpoint preflight checklist plus sanitized frozen packet and expected schema,
with no calls until endpoint/data/budget are authorized. Keep raw credentials outside git and outputs.
