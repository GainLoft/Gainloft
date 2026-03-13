#!/bin/bash
# Full sync of Polymarket data in 1-page (100 event) chunks
# Each chunk gets its own HTTP request to avoid Vercel/Cloudflare timeouts

BASE_URL="https://gainloft.com"
PAGE_SIZE=100
MAX_OFFSET=5000  # 50 pages max = 5000 events

offset=0
total_synced=0
total_skipped=0
page=0

echo "Starting full Polymarket sync..."
echo ""

while [ $offset -lt $MAX_OFFSET ]; do
  page=$((page + 1))
  echo -n "Page $page (offset $offset)... "

  result=$(curl -s -X POST "$BASE_URL/api/polymarket/sync" \
    -H 'Content-Type: application/json' \
    -d "{\"maxPages\": 1, \"startOffset\": $offset}" \
    --max-time 90 2>&1)

  # Check for timeout/error
  if [ $? -ne 0 ]; then
    echo "TIMEOUT/ERROR - retrying..."
    result=$(curl -s -X POST "$BASE_URL/api/polymarket/sync" \
      -H 'Content-Type: application/json' \
      -d "{\"maxPages\": 1, \"startOffset\": $offset}" \
      --max-time 90 2>&1)
    if [ $? -ne 0 ]; then
      echo "FAILED twice, skipping page $page"
      offset=$((offset + PAGE_SIZE))
      continue
    fi
  fi

  synced=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('synced',0))" 2>/dev/null)
  skipped=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('skipped',0))" 2>/dev/null)

  if [ -z "$synced" ] || [ "$synced" = "0" -a "$skipped" = "0" ]; then
    echo "No more events. Done!"
    break
  fi

  total_synced=$((total_synced + synced))
  total_skipped=$((total_skipped + skipped))
  echo "synced=$synced skipped=$skipped (total: $total_synced synced, $total_skipped skipped)"

  offset=$((offset + PAGE_SIZE))
  sleep 1
done

echo ""
echo "=== Full sync complete ==="
echo "Total synced: $total_synced"
echo "Total skipped: $total_skipped"
echo "Pages processed: $page"
