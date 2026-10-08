#!/usr/bin/env bash
# One command: Vercel project + MongoDB Atlas (free, via Vercel Marketplace) + production deploy.
#
#   ./deploy/deploy.sh                    # project: trailhead-memory-<your vercel username>
#   PROJECT=my-trailhead REGION=iad1 ./deploy/deploy.sh
#   VERCEL_SCOPE=my-team ./deploy/deploy.sh   # required when your login belongs to more than one team
#
# Requires: Node 18+, `vercel login` done once. Models go through AI Gateway, which
# authenticates with the project's OIDC token on Vercel, so no API key is copied.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

REGION="${REGION:-iad1}"          # Vercel region for both the function and the Atlas cluster
VERCEL_CLI_VERSION="63.0.1"       # needs >= 50 for non-interactive `integration add` flags
# The hosted lab image installs this exact version; elsewhere fall back to npx with the same pin.
if [[ -z "${VC:-}" ]]; then
  if command -v vercel >/dev/null 2>&1; then VC="vercel"; else VC="npx -y vercel@${VERCEL_CLI_VERSION}"; fi
fi

step() { printf '\n▶ %s\n' "$*"; }

# Works from a terminal AND from a notebook cell (no TTY → --non-interactive, never hang on a prompt).
INTERACTIVE=1; [[ -t 0 ]] || INTERACTIVE=0
NI=""; [[ $INTERACTIVE == 1 ]] || NI="--non-interactive"
# With several teams on one login, non-interactive mode refuses to guess which one to use.
SCOPE=""; [[ -n "${VERCEL_SCOPE:-}" ]] && SCOPE="--scope $VERCEL_SCOPE"
vc() { $VC $NI $SCOPE "$@"; }

step "1/4 Checking Vercel login"
if ! vc whoami >/dev/null 2>&1; then
  if [[ $INTERACTIVE == 1 ]]; then vc login
  else echo "✖ Not logged in to Vercel. Run 'vercel login' in a terminal once, then re-run."; exit 1; fi
fi

# One project per person, even when a workshop shares a Vercel team: name it after the Vercel username, so re-runs
# reuse it and nobody deploys over somebody else's project (or shares their Atlas cluster).
if [[ -z "${PROJECT:-}" ]]; then
  VERCEL_USER="$(vc whoami 2>/dev/null | tail -n1 | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-\n' '-' | tr -d '\n')"
  PROJECT="trailhead-memory${VERCEL_USER:+-$VERCEL_USER}"
fi
RESOURCE="${RESOURCE:-${PROJECT}-atlas}"
echo "Project: $PROJECT"

step "2/4 Linking/creating Vercel project '$PROJECT'${VERCEL_SCOPE:+ in team '$VERCEL_SCOPE'}"
if ! LINK_OUT="$(vc link --yes --project "$PROJECT" 2>&1)"; then
  echo "$LINK_OUT"
  if grep -q missing_scope <<<"$LINK_OUT"; then
    echo
    echo "✖ Your Vercel login belongs to more than one team, so pick the one to deploy into:"
    grep -o '"name": *"[^"]*"' <<<"$LINK_OUT" | sed 's/"name": *"\(.*\)"/    \1/'
    echo "  Set VERCEL_SCOPE to one of these (in the notebook: VERCEL_SCOPE in the deploy cell) and re-run."
  fi
  exit 1
fi
echo "$LINK_OUT"

step "3/4 Provisioning MongoDB Atlas (FREE plan, M0) via Vercel Marketplace → injects MONGODB_URI"
if vc env ls production 2>/dev/null | grep -qw MONGODB_URI; then
  echo "MONGODB_URI already present on project — skipping provisioning."
else
  if ! vc integration add mongodbatlas \
    --name "$RESOURCE" \
    --plan FREE \
    -m clusterTier=FREE \
    -m vercelRegion="$REGION" \
    -e production -e preview -e development; then
    echo "✖ Atlas provisioning failed. If this is the first Marketplace install on your team, run in a terminal:"
    echo "    vercel integration accept-terms mongodbatlas"
    echo "  then re-run. (Accepting terms needs a human at an interactive terminal.)"
    exit 1
  fi
fi

step "4/4 Deploying to production"
# Non-interactive mode prints JSON, so stop the match at quotes and commas too.
URL="$(vc deploy --prod --yes --regions "$REGION" | grep -Eo 'https://[A-Za-z0-9.-]+\.vercel\.app' | tail -1)"
[[ -n "$URL" ]] || { echo "✖ Could not read the deployment URL from 'vercel deploy' output."; exit 1; }
echo "DEPLOY_URL=$URL"   # machine-readable line, parsed by the notebook's deploy cell

cat <<EOF

✅ Done. Try it:

  curl -s $URL/api/chat
  curl -s -X POST $URL/api/chat -H 'content-type: application/json' \\
    -d '{"userId":"bob","sessionId":"s1","prompt":"I have a bad knee and live in Denver. Suggest a hike."}'

  # New session, same user — semantic memory should recall the knee + city:
  curl -s -X POST $URL/api/chat -H 'content-type: application/json' \\
    -d '{"userId":"bob","sessionId":"s2","prompt":"Plan my Saturday hike."}'

Note: on a brand-new cluster the Vector Search indexes take ~1 minute to become READY;
the first semantic_search may return nothing until then.
Deployment Protection may require you to be logged in to Vercel to hit preview URLs.
EOF
