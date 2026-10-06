#!/usr/bin/env bash
# Runs the nine commands of the instructor's curl_test_guide.md exactly as written and
# prints a Markdown transcript. Each command is stored once and both shown and executed.
#
# Run it in Git Bash (not PowerShell) while the API is running and no booking of eq-1
# exists on 2026-10-20 (npm run db:reset gives a clean start):
#
#   bash tests/curl-guide.sh > CURL_GUIDE_EVIDENCE.md
#   bash tests/curl-guide.sh https://example.com/api > CURL_GUIDE_EVIDENCE.md
BASE_URL="${1:-http://localhost:8787/api}"
BOOKING_ID=""
case "$BASE_URL" in
  http://localhost*|http://127.0.0.1*) server='`npm run dev` (wrangler dev with the local D1 / SQLite database)' ;;
  *) server='the deployed Cloudflare Worker with its remote D1 database' ;;
esac
before=$(curl -s "$BASE_URL/bookings")
pass=0
total=0
rows=""
details=""

step() {
  local number="$1" title="$2" expected="$3" cmd="$4"
  local out status result
  out=$(eval "$cmd" 2>/dev/null | tr -d '\r')
  status=$(printf '%s\n' "$out" | head -n 1 | awk '{print $2}')
  total=$((total + 1))
  if [ "$status" = "$expected" ]; then result="PASS"; pass=$((pass + 1)); else result="FAIL"; fi
  rows="${rows}| ${number} | ${title} | ${expected} | ${status:-none} | ${result} |"$'\n'
  details="${details}"$'\n'"### ${number}. ${title}: expected ${expected}, got ${status:-none} (${result})"$'\n\n''```bash'$'\n'"${cmd}"$'\n''```'$'\n\n''```http'$'\n'"${out}"$'\n''```'$'\n'
  LAST_OUTPUT="$out"
}

read -r -d '' CMD1 <<'EOF'
curl -i "$BASE_URL/equipment"
EOF
step 1 "List equipment" 200 "$CMD1"

read -r -d '' CMD2 <<'EOF'
curl -i "$BASE_URL/bookings"
EOF
step 2 "List bookings" 200 "$CMD2"

read -r -d '' CMD3 <<'EOF'
curl -i -X POST "$BASE_URL/bookings" \
  -H "Content-Type: application/json" \
  -d '{
    "equipmentId": "eq-1",
    "borrowerName": "Somchai Jaidee",
    "startAt": "2026-10-20T09:00:00.000Z",
    "endAt": "2026-10-20T11:00:00.000Z",
    "purpose": "Class presentation"
  }'
EOF
step 3 "Create a booking" 201 "$CMD3"
BOOKING_ID=$(printf '%s' "$LAST_OUTPUT" | grep -o '"id":"[^"]*"' | head -n 1 | cut -d'"' -f4)

read -r -d '' CMD4 <<'EOF'
curl -i "$BASE_URL/bookings/$BOOKING_ID"
EOF
step 4 "Get one booking" 200 "$CMD4"

read -r -d '' CMD5 <<'EOF'
curl -i -X PATCH "$BASE_URL/bookings/$BOOKING_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "equipmentId": "eq-1",
    "borrowerName": "Somchai Jaidee",
    "startAt": "2026-10-20T12:00:00.000Z",
    "endAt": "2026-10-20T14:00:00.000Z",
    "purpose": "Updated class presentation"
  }'
EOF
step 5 "Update a booking" 200 "$CMD5"

read -r -d '' CMD6 <<'EOF'
curl -i -X POST "$BASE_URL/bookings" \
  -H "Content-Type: application/json" \
  -d '{
    "equipmentId": "eq-1",
    "borrowerName": "Somchai Jaidee",
    "startAt": "2026-10-21T11:00:00.000Z",
    "endAt": "2026-10-21T09:00:00.000Z",
    "purpose": "Invalid time range test"
  }'
EOF
step 6 "Invalid time range" 400 "$CMD6"

read -r -d '' CMD7 <<'EOF'
curl -i -X POST "$BASE_URL/bookings" \
  -H "Content-Type: application/json" \
  -d '{
    "equipmentId": "eq-1",
    "borrowerName": "Suda Dee",
    "startAt": "2026-10-20T12:30:00.000Z",
    "endAt": "2026-10-20T13:30:00.000Z",
    "purpose": "Conflict test"
  }'
EOF
step 7 "Overlapping booking" 409 "$CMD7"

read -r -d '' CMD8 <<'EOF'
curl -i "$BASE_URL/bookings/not-found"
EOF
step 8 "Missing booking" 404 "$CMD8"

read -r -d '' CMD9 <<'EOF'
curl -i -X DELETE "$BASE_URL/bookings/$BOOKING_ID"
EOF
step 9 "Delete a booking" 204 "$CMD9"

remaining=$(curl -s "$BASE_URL/bookings")

cat <<EOF
# cURL Guide Evidence

The nine commands of the instructor's cURL Quick Test Guide (\`curl_test_guide.md\`), run exactly as
written in the guide.

- **Base API URL:** \`${BASE_URL}\`
- **Result:** ${pass} of ${total} steps returned the expected status code
- **Run at:** $(date -u +%Y-%m-%dT%H:%M:%SZ) (local time: $(date '+%Y-%m-%d %H:%M:%S %z'))
- **Shell and client:** Git Bash, $(curl --version | head -n 1 | cut -d' ' -f1-3)
- **Server under test:** ${server}
- **\`BOOKING_ID\`:** \`${BOOKING_ID}\`, copied from the response of step 3

The commands print curl's progress meter to the terminal as well; it is left out here. Nothing else
was changed. The list of bookings was \`${before}\` before step 1 and \`${remaining}\` after step 9.

| Step | Case | Expected | Actual | Result |
|--:|---|---:|---:|---|
${rows}
## Commands and responses
${details}
EOF
