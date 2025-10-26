#!/usr/bin/env bash
set -euo pipefail

if ! command -v bunx >/dev/null 2>&1; then
  echo "bunx not found. Install Bun (https://bun.sh) before running this script." >&2
  exit 1
fi

# Ensure you have logged in beforehand: bunx wrangler login

declare -a QUEUES=(crawl source identity golden)

for queue in "${QUEUES[@]}"; do
  echo "Ensuring queue '${queue}' exists"
  if bunx wrangler queues create "${queue}" >/tmp/wrangler-create.log 2>&1; then
    echo "  ✓ created ${queue}"
  else
    if bunx wrangler queues list | grep -qw "${queue}"; then
      echo "  ✓ ${queue} already exists"
    else
      echo "  ✗ failed to create ${queue}" >&2
      cat /tmp/wrangler-create.log >&2
      exit 1
    fi
  fi
  echo
done

echo "Queues ready. Deploy each worker (crawler, coordinator, source, identity, golden)"
echo "to bind the queues according to their wrangler.jsonc configs."
