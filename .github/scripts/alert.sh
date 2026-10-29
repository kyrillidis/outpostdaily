#!/usr/bin/env bash
# Opens, updates and closes GitHub issues so a broken pipeline is noticed. Needs gh, jq and GH_TOKEN (issues: write).
#   alert.sh fail  "<title>" "<body>"     open ONE issue with this title if none is open; otherwise comment, at most once per COOLDOWN_H (default 6)
#   alert.sh ok    "<title>" "<comment>"  comment "recovered" on the open issue with this title and close it (nothing to do if there is none)
#   alert.sh creds [breaking.json]        one issue per source whose last collection failed with HTTP 401/402/403 (a dead key or an unpaid plan);
#                                         closes the issue of a source that no longer fails. Never fails the run.
set -uo pipefail
COOLDOWN_H="${COOLDOWN_H:-6}"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"

# number<TAB>time of the latest activity (creation or last comment, epoch seconds) of the open issue titled exactly $1
open_issue() {
  gh issue list --state open --limit 200 --json number,title,createdAt,comments \
    | jq -r --arg t "$1" '[.[] | select(.title == $t)] | first // empty | [.number, (([.createdAt] + [.comments[].createdAt]) | map(sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) | max)] | @tsv'
}

fail() {
  local row n last
  row=$(open_issue "$1") || return 1
  if [ -z "$row" ]; then gh issue create --title "$1" --body "$2"; return; fi
  n=${row%%$'\t'*}; last=${row##*$'\t'}
  if [ $(( $(date +%s) - last )) -ge $(( COOLDOWN_H * 3600 )) ]; then gh issue comment "$n" --body "$2"; else echo "issue #$n has recent activity; not commenting again yet"; fi
}

ok() {
  local row n
  row=$(open_issue "$1") || return 1
  [ -z "$row" ] && return 0
  n=${row%%$'\t'*}
  gh issue comment "$n" --body "$2" && gh issue close "$n"
}

creds() {
  local file="${1:-data/breaking.json}" prefix="Source credential problem: " failing name detail
  [ -f "$file" ] || return 0
  # "X cyber", "X redteam", ... are one provider (twitterapi.io), so they share one issue
  failing=$(jq -r '(.health // []) | map(select(.ok == false and ((.error // "") | test("HTTP (401|402|403)\\b"))))
    | map({p: (if (.name | startswith("X ")) then "X (twitterapi.io)" else .name end), d: "\(.name): \(.error)"})
    | group_by(.p)[] | [.[0].p, (map(.d) | join("; "))] | @tsv' "$file") || return 0
  while IFS=$'\t' read -r name detail; do
    [ -n "$name" ] || continue
    fail "$prefix$name" "The last collection run was refused: $detail. This usually means an expired key, a revoked token or an unpaid plan; the source returns nothing until it is fixed. Run: $RUN_URL" || true
  done <<< "$failing"
  # close the issue of any provider that no longer fails
  gh issue list --state open --limit 200 --json number,title | jq -r --arg p "$prefix" '.[] | select(.title | startswith($p)) | [.number, .title] | @tsv' \
    | while IFS=$'\t' read -r n title; do
        name=${title#"$prefix"}
        printf '%s\n' "$failing" | cut -f1 | grep -qxF -- "$name" || { gh issue comment "$n" --body "Recovered: the last collection run was not refused by this source. Run: $RUN_URL" && gh issue close "$n"; }
      done
  return 0
}

case "${1:-}" in
  fail) fail "$2" "$3" ;;
  ok) ok "$2" "$3" ;;
  creds) creds "${2:-}" ;;
  *) echo "usage: alert.sh fail|ok <title> <text> | creds [file]" >&2; exit 2 ;;
esac
