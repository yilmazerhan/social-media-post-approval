#!/usr/bin/env bash
# IMPLEMENTATION_PLAN.md Phase 25 / SECURITY.md §8. Run locally (`npm run
# security-review`) before a release, or wire into CI once one exists
# (SECURITY.md's own "npm audit in CI" line — no pipeline exists in this
# repository yet). Checks the mechanical parts of the threat table that
# can be checked mechanically; the rest of SECURITY.md §2's table is
# verified by the test suite itself (see IMPLEMENTATION_PLAN.md's Phase 25
# retrospective for the row-by-row mapping).

set -uo pipefail
FAILED=0

log() { echo "[security-review] $*"; }
fail() {
  echo "[security-review] FAIL: $*" >&2
  FAILED=1
}
pass() { echo "[security-review] OK: $*"; }

# ---- 1. .env is never tracked -----------------------------------------
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail ".env is tracked by git — it must never be committed."
else
  pass ".env is not tracked by git."
fi

# ---- 2. npm audit, checked against SECURITY.md's documented exceptions -
# A reported package (e.g. `prisma`, `next`) is fine as long as its `via`
# chain bottoms out only at one of the three root causes SECURITY.md's
# "Known dependency exceptions" table names (deepmerge-ts, mysql2,
# postcss) — anything whose chain reaches a different root is new and
# must be triaged, not silently allowed through.
KNOWN_ROOT_CAUSES="deepmerge-ts mysql2 postcss"
AUDIT_JSON=$(npm audit --omit=dev --json 2>/dev/null || true)
if [ -z "$AUDIT_JSON" ]; then
  fail "npm audit produced no output — investigate manually."
else
  UNEXPECTED=$(echo "$AUDIT_JSON" | node -e '
    let input = "";
    process.stdin.on("data", (d) => (input += d));
    process.stdin.on("end", () => {
      const knownRoots = new Set(process.argv[1].split(" "));
      let data;
      try {
        data = JSON.parse(input);
      } catch {
        process.exit(0);
      }
      const vulns = data.vulnerabilities || {};
      function reachesOnlyKnownRoots(name, seen) {
        if (seen.has(name)) return true;
        seen.add(name);
        const entry = vulns[name];
        if (!entry) return knownRoots.has(name);
        const via = (entry.via || []).map((v) =>
          typeof v === "string" ? v : v.name,
        );
        if (via.length === 0) return knownRoots.has(name);
        return via.every((v) => knownRoots.has(v) || reachesOnlyKnownRoots(v, seen));
      }
      const unexpected = Object.keys(vulns).filter(
        (name) => !reachesOnlyKnownRoots(name, new Set()),
      );
      console.log(unexpected.join("\n"));
    });
  ' "$KNOWN_ROOT_CAUSES")
  if [ -n "$UNEXPECTED" ]; then
    fail "npm audit found advisories that don't trace back to a documented exception:"
    echo "$UNEXPECTED" | sed 's/^/  - /'
  else
    pass "npm audit reports only the documented exceptions (or none)."
  fi
fi

# ---- 3. dangerouslySetInnerHTML stays confined to the reviewed sites ---
# SECURITY.md §2: "dangerouslySetInnerHTML only for sanitized post HTML,
# behind one reviewed component." Four call sites are known-reviewed
# (post preview, approval review diff, post details, comment thread) --
# a new one appearing means new code needs the same review before this
# check is updated to allow it.
KNOWN_DSI_FILES="src/components/app/editor/preview-dialog.tsx
src/components/app/approvals/approval-review-view.tsx
src/components/app/post-details/post-details-view.tsx
src/components/app/comments/comment-thread.tsx"
ACTUAL_DSI_FILES=$(grep -rl "dangerouslySetInnerHTML={{" src/ --include="*.tsx" --include="*.ts" | sort)
EXPECTED_SORTED=$(echo "$KNOWN_DSI_FILES" | sort)
if [ "$ACTUAL_DSI_FILES" = "$EXPECTED_SORTED" ]; then
  pass "dangerouslySetInnerHTML appears only in the reviewed components."
else
  fail "dangerouslySetInnerHTML call sites changed — review the diff and update this script's known-good list:"
  diff <(echo "$EXPECTED_SORTED") <(echo "$ACTUAL_DSI_FILES") | sed 's/^/  /'
fi

# ---- 4. No CDN / external script sources in shipped HTML --------------
# SECURITY.md §1: "No update check, no telemetry, no font or script
# fetch." A cheap static check: no <script src="http bare grep across app
# source for a hardcoded external URL used as a script/style/font source.
if grep -rn 'src="https\?://' src/app src/components --include="*.tsx" 2>/dev/null | grep -vE "^\S+:.*//.*(placeholder|example)" | grep -q .; then
  fail "Found a hardcoded external src= URL — CLAUDE.md forbids CDN scripts/fonts."
  grep -rn 'src="https\?://' src/app src/components --include="*.tsx" 2>/dev/null | sed 's/^/  /'
else
  pass "No hardcoded external script/style/font sources found."
fi

echo
if [ "$FAILED" -eq 1 ]; then
  log "One or more checks failed — see above."
  exit 1
fi
log "All checks passed."
