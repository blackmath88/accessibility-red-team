#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from datetime import datetime, timezone


def load(path):
    return json.loads(Path(path).read_text())


def check(result, key, ok, severity, summary, evidence=None):
    result["checks"].append({
        "id": key,
        "status": "PASS" if ok else severity,
        "summary": summary,
        "evidence": evidence or {}
    })


def candidate(result, cid, title, rationale, evidence, suggested_upstream):
    result["candidates"].append({
        "id": cid,
        "status": "CANDIDATE",
        "title": title,
        "rationale": rationale,
        "evidence": evidence,
        "suggested_upstream": suggested_upstream
    })


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--snapshot", required=True)
    p.add_argument("--config", required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args()

    snapshot = load(args.snapshot)
    config = load(args.config)
    exp = config["expectations"]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    result = {
        "schema": "art/observstory-field-eval-result/v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "repository": snapshot.get("repository", {}).get("full_name"),
        "source_snapshot_schema": snapshot.get("schema"),
        "checks": [],
        "candidates": []
    }

    schema_ok = snapshot.get("schema") == "observstory.snapshot/v1"
    check(result, "snapshot.schema", schema_ok, "FAIL",
          "Snapshot uses the expected typed contract.",
          {"actual": snapshot.get("schema")})

    lane_ids = [x.get("id") for x in snapshot.get("lanes", [])]
    missing = [x for x in exp["required_lanes"] if x not in lane_ids]
    check(result, "lanes.required", not missing, "FAIL",
          "All project-specific lanes are present.",
          {"missing": missing, "actual": lane_ids})

    fallback = next((x for x in snapshot.get("lanes", []) if x.get("id") == "other"), None)
    fallback_areas = list((fallback or {}).get("areas", []))
    fallback_ok = len(fallback_areas) <= exp["max_fallback_areas"]
    check(result, "lanes.fallback", fallback_ok, "WARN",
          "Fallback lane stays within the configured tolerance.",
          {"count": len(fallback_areas), "areas": fallback_areas,
           "max": exp["max_fallback_areas"]})
    if not fallback_ok and config["candidate_rules"].get("fallback_areas"):
        candidate(result, "observstory.fallback-explainability",
                  "Explain why areas fall into the fallback lane",
                  "Custom semantic lanes are useful, but unexplained fallback areas make configuration tuning harder.",
                  {"areas": fallback_areas},
                  "Expose unclaimed/fallback areas with their files and lane-resolution reason.")

    provenance = snapshot.get("provenance", {})
    degraded = provenance.get("degraded", [])
    degraded_ok = exp["allow_degraded"] or not degraded
    check(result, "provenance.degraded", degraded_ok, "FAIL",
          "Collection completed without degraded evidence.",
          {"degraded": degraded})

    api_calls = provenance.get("api_calls")
    api_ok = api_calls is None or api_calls <= exp["max_api_calls"]
    check(result, "provenance.api_budget", api_ok, "WARN",
          "GitHub API cost stays within the field-eval budget.",
          {"api_calls": api_calls, "max": exp["max_api_calls"]})
    if not api_ok and config["candidate_rules"].get("api_cost_high"):
        candidate(result, "observstory.api-budget-guidance",
                  "Make API cost easier to predict from config",
                  "External users should understand how max_commits/window settings affect request cost before field deployment.",
                  {"api_calls": api_calls, "max": exp["max_api_calls"]},
                  "Add config-time/request-budget guidance or an estimated-call summary.")

    coordination = snapshot.get("coordination")
    coordination_ok = bool(coordination) if exp["require_coordination"] else True
    check(result, "coordination.present", coordination_ok, "FAIL",
          "Declared project coordination is present.",
          {"present": bool(coordination)})

    signal_errors = []
    for s in snapshot.get("signals", []):
        if exp["require_signal_evidence"] and not s.get("evidence"):
            signal_errors.append({"id": s.get("id"), "problem": "no evidence"})
        if exp["require_signal_rule"] and not s.get("rule"):
            signal_errors.append({"id": s.get("id"), "problem": "no rule"})
    check(result, "signals.evidence_contract", not signal_errors, "FAIL",
          "Every signal keeps evidence and rule provenance.",
          {"problems": signal_errors})

    summary = snapshot.get("summary", {})
    actual_in_flight = sum(1 for x in snapshot.get("work_items", []) if x.get("in_flight"))
    summary_consistent = summary.get("in_flight") == actual_in_flight
    check(result, "summary.in_flight_consistency", summary_consistent, "FAIL",
          "Summary in-flight count matches work-item state.",
          {"summary": summary.get("in_flight"), "derived": actual_in_flight})

    direct_recent = [
        x for x in snapshot.get("work_items", [])
        if x.get("kind") == "direct" and x.get("last_activity_at")
    ]
    direct_burst = [
        s for s in snapshot.get("signals", [])
        if s.get("type") == "burst" and any(w.startswith("direct:") for w in s.get("work_items", []))
    ]
    active_without_inflight = (
        summary.get("in_flight") == 0 and bool(direct_recent) and bool(direct_burst)
    )
    check(result, "semantics.direct_activity", not active_without_inflight, "INFO",
          "Top-level activity semantics are unambiguous for direct-to-main builds.",
          {"in_flight": summary.get("in_flight"),
           "direct_streams": [x.get("id") for x in direct_recent],
           "direct_burst_signals": [x.get("id") for x in direct_burst]})
    if active_without_inflight and config["candidate_rules"].get("direct_activity_without_in_flight"):
        candidate(result, "observstory.direct-active-summary",
                  "Distinguish unmerged in-flight work from active landed streams",
                  "A direct-to-main repository can be highly active while summary.in_flight is zero, creating a misleading first read.",
                  {"in_flight": 0,
                   "direct_streams": [x.get("id") for x in direct_recent],
                   "burst": [x.get("id") for x in direct_burst]},
                  "Keep precise in_flight semantics but expose recent/active work streams separately or label it 'unmerged in flight'.")

    if coordination and config["candidate_rules"].get("coordination_retroactive"):
        retro = []
        for c in coordination.get("commitments", []):
            if c.get("state") == "landed":
                retro.append({"id": c.get("id"), "text": c.get("text")})
        check(result, "coordination.bootstrap_retroactive", not retro, "INFO",
              "Fresh coordination declarations do not look retroactively complete.",
              {"landed_commitments": retro})
        if retro:
            candidate(result, "observstory.bootstrap-boundary",
                      "Clarify bootstrap boundary for path-linked commitments",
                      "New declarations linked to paths with recent direct-push history can reconcile as already landed.",
                      {"commitments": retro},
                      "Document or expose confirmation-time observation boundaries for bootstrap declarations.")

    hard_fail = any(c["status"] == "FAIL" for c in result["checks"])
    result["summary"] = {
        "pass": sum(1 for c in result["checks"] if c["status"] == "PASS"),
        "warn": sum(1 for c in result["checks"] if c["status"] == "WARN"),
        "info": sum(1 for c in result["checks"] if c["status"] == "INFO"),
        "fail": sum(1 for c in result["checks"] if c["status"] == "FAIL"),
        "candidates": len(result["candidates"]),
        "healthy": not hard_fail
    }

    (out / "eval.json").write_text(json.dumps(result, indent=2) + "\n")

    lines = [
        "# Observstory field evaluation",
        "",
        f"Repository: `{result['repository']}`",
        f"Generated: `{result['generated_at']}`",
        "",
        "## Summary",
        "",
        f"- PASS: {result['summary']['pass']}",
        f"- WARN: {result['summary']['warn']}",
        f"- INFO: {result['summary']['info']}",
        f"- FAIL: {result['summary']['fail']}",
        f"- improvement candidates: {result['summary']['candidates']}",
        "",
        "## Checks",
        ""
    ]
    for c in result["checks"]:
        lines.append(f"- **{c['status']} · {c['id']}** — {c['summary']}")
    lines += ["", "## Improvement candidates", ""]
    if result["candidates"]:
        for x in result["candidates"]:
            lines += [
                f"### {x['id']}",
                "",
                x["title"],
                "",
                x["rationale"],
                "",
                f"Suggested upstream: {x['suggested_upstream']}",
                ""
            ]
    else:
        lines.append("No framework improvement candidates generated in this run.")
    (out / "report.md").write_text("\n".join(lines) + "\n")

    print(json.dumps(result["summary"], indent=2))
    raise SystemExit(1 if hard_fail else 0)


if __name__ == "__main__":
    main()
