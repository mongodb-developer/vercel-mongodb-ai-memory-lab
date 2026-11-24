#!/usr/bin/env bash
# One command: Vercel project + MongoDB Atlas (free, via Vercel Marketplace) + production deploy.
#
#   ./deploy/deploy.sh                    # project: trailhead-memory-<your vercel username>
#   PROJECT=my-trailhead REGION=iad1 ./deploy/deploy.sh
#   VERCEL_SCOPE=my-team ./deploy/deploy.sh   # required when your login belongs to more than one team
#
# Requires: Node 18+, `vercel login` done once, and AI Gateway enabled on your Vercel team: the deployed
# app's models go through AI Gateway with the project's OIDC token (no API key is uploaded).
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
# Run whoami outside deploy/: inside it, a .vercel/ link left by another Vercel account pins that account's team,
# and whoami then fails with "forbidden" even though you are logged in.
whoami_out() { (cd / && vc whoami 2>&1); }
if ! WHOAMI="$(whoami_out)"; then
  if [[ $INTERACTIVE == 1 ]] && grep -qiE 'not.*logged|login|credentials' <<<"$WHOAMI"; then vc login; WHOAMI="$(whoami_out)" || { echo "$WHOAMI"; exit 1; }
  else
    echo "$WHOAMI"
    echo "✖ 'vercel whoami' failed (output above). If it says you are not logged in, run 'vercel login' in a terminal, then re-run."
    exit 1
  fi
fi

# One project per person, even when a workshop shares a Vercel team: name it after the Vercel username, so re-runs
# reuse it and nobody deploys over somebody else's project (or shares their Atlas cluster).
if [[ -z "${PROJECT:-}" ]]; then
  VERCEL_USER="$( (cd / && vc whoami 2>/dev/null) | tail -n1 | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-\n' '-' | tr -d '\n')"
  # Never fall back to a shared name: that is exactly how two people end up deploying over each other.
  [[ -n "$VERCEL_USER" ]] || { echo "✖ Could not read your Vercel username ('vercel whoami'). Set PROJECT=<a-unique-name> and re-run."; exit 1; }
  PROJECT="trailhead-memory-$VERCEL_USER"
fi
# The resource name becomes the Atlas cluster name, which Atlas truncates to 23 characters. A cut that ends on "-"
# is an invalid hostname (e.g. "trailhead-memory-sales-"), so keep it short and never end it with a dash.
if [[ -z "${RESOURCE:-}" ]]; then
  RESOURCE="th-${PROJECT#trailhead-memory-}"
  RESOURCE="${RESOURCE:0:23}"
  while [[ $RESOURCE == *- ]]; do RESOURCE="${RESOURCE%-}"; done
fi
echo "Project: $PROJECT"

# A link to a different project (another Vercel login on this machine, or a renamed PROJECT) would make every
# command below act on it, usually with "forbidden". Drop it, and the env it pulled, before linking ours.
if [[ -f .vercel/project.json ]] && ! grep -q "\"projectName\":\"$PROJECT\"" .vercel/project.json; then
  echo "Removing a stale .vercel link to another project: $(cat .vercel/project.json)"
  rm -rf .vercel .env.local
fi

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
    echo "✖ Atlas provisioning failed — the reason is in the output above. If it mentions terms (first Marketplace install on your team), run in a terminal:"
    echo "    vercel integration accept-terms mongodbatlas"
    echo "  then re-run. (Accepting terms needs a human at an interactive terminal.)"
    exit 1
  fi
fi

# AI Gateway: no key is uploaded. The deployed functions authenticate with the project's Vercel OIDC token, so
# usage lands on the deployer's own team, which must have AI Gateway enabled.
echo "ℹ Models go through Vercel AI Gateway with this project's OIDC token: make sure AI Gateway is enabled on your Vercel team."

step "4/4 Deploying to production"
# Deploy a copy outside any git repo. Inside the lab clone the CLI attaches the lab's last commit, and Vercel blocks
# a deployment whose commit author (the lab's maintainer, not you) can't be matched to a member of your team.
DEPLOY_SRC="$(mktemp -d)"
trap 'rm -rf "$DEPLOY_SRC"' EXIT
tar --exclude=./node_modules --exclude=./.next --exclude='./.env*' -cf - . | tar -xf - -C "$DEPLOY_SRC"
# Non-interactive mode prints JSON, so stop the match at quotes and commas too.
URL="$(vc deploy --cwd "$DEPLOY_SRC" --prod --yes --regions "$REGION" | grep -Eo 'https://[A-Za-z0-9.-]+\.vercel\.app' | tail -1)"
[[ -n "$URL" ]] || { echo "✖ Could not read the deployment URL from 'vercel deploy' output."; exit 1; }
echo "DEPLOY_URL=$URL"   # machine-readable line, parsed by the notebook's deploy cell

cat <<EOF

✅ Done. Open $URL and chat with Trailhead:
   tell it about yourself, click "New session", and ask for a trail — it remembers you from MongoDB Atlas.

   Health check:  curl -s $URL/api/chat

Note: on a brand-new cluster the Vector Search indexes take ~1 minute to become READY;
the first recall may come back empty until then.
EOF
