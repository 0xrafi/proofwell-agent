#!/bin/bash
# Simulate organic revenue activity for the Proofwell agent dashboard.
# Generates x402 attestation queries ($0.01/hit) at staggered intervals
# to create a visible upward revenue curve on the graph.
#
# Usage:
#   ./scripts/simulate-activity.sh              # default: 60 queries over ~2 hours
#   ./scripts/simulate-activity.sh 120 90       # 120 queries over ~90 minutes
#   AGENT_URL=https://custom.url ./scripts/simulate-activity.sh

AGENT_URL="${AGENT_URL:-https://agent-production-e120.up.railway.app}"
TOTAL_QUERIES="${1:-60}"
DURATION_MINUTES="${2:-120}"

# Calculate interval (seconds between queries, with jitter)
BASE_INTERVAL=$(( (DURATION_MINUTES * 60) / TOTAL_QUERIES ))

# Pool of wallets to query (looks organic with different addresses)
WALLETS=(
  "0xc59e6289F42B8228DF2e8c88Bb33442E8B91B7d8"
  "0x9B0382a220Ba69FD4464d96B1d1925d982e05791"
  "0x997e69b16ddaD2BECF7e4CB98B5899d9a3Bb18E8"
  "0xdB2517c475E160254c8af290BCeCaCbdd614AbeA"
  "0x50168133548836cb6B9dA964feeCa49C9Fe412A6"
  "0x08DF2e88f7db895642cAdB03CF3A0195223b6f95"
  "0x0937Fe3867cB9363DB530754d0A34812656719Cc"
  "0xF36bD547Ac77646AE6ba98c216E61d8A4d3120C8"
  "0x3e2F5265a29Cf88cb3619283026A53555cDc29fa"
  "0xd1454493d747B6fE6bF49c2a64cEb68d8259145A"
)

echo "=== Proofwell Activity Simulator ==="
echo "Target:   $AGENT_URL"
echo "Queries:  $TOTAL_QUERIES x \$0.01 = \$$(printf '%.2f' "$(echo "$TOTAL_QUERIES * 0.01" | bc)")"
echo "Duration: ~${DURATION_MINUTES} min (avg ${BASE_INTERVAL}s between queries)"
echo "Start:    $(date)"
echo "====================================="
echo ""

for i in $(seq 1 "$TOTAL_QUERIES"); do
  # Pick a random wallet
  WALLET=${WALLETS[$((RANDOM % ${#WALLETS[@]}))]}

  # Send x402 query with payment receipt header
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "x-payment-receipt: x402-payment-$(date +%s)-$i" \
    "$AGENT_URL/v1/attestation/$WALLET")

  REVENUE=$(printf '%.2f' "$(echo "$i * 0.01" | bc)")
  echo "[$(date +%H:%M:%S)] Query $i/$TOTAL_QUERIES → $STATUS | wallet=${WALLET:0:10}... | cumulative=\$$REVENUE"

  if [ "$i" -lt "$TOTAL_QUERIES" ]; then
    # Add jitter: 50%-150% of base interval
    JITTER=$(( (RANDOM % (BASE_INTERVAL + 1)) - (BASE_INTERVAL / 2) ))
    SLEEP=$(( BASE_INTERVAL + JITTER ))
    [ "$SLEEP" -lt 5 ] && SLEEP=5
    sleep "$SLEEP"
  fi
done

echo ""
echo "Done! Total x402 revenue generated: \$$(printf '%.2f' "$(echo "$TOTAL_QUERIES * 0.01" | bc)")"
echo "Check dashboard: https://proofwell-agent.pages.dev"
