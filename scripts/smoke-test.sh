#!/usr/bin/env bash
#
# End-to-end check against a running AirFLAC instance.
#
#   ./scripts/smoke-test.sh http://localhost:8080
#
# Generates a short test tone, puts it through upload, conversion and download,
# and verifies the result is really a FLAC. Useful after an install or upgrade,
# and used by CI to prove the Docker image and the native install both work.
#
# Needs curl and ffmpeg. Leaves nothing behind on the server beyond the queue
# entry, which it clears at the end.

set -euo pipefail

BASE="${1:-http://localhost:8080}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass() { printf '  ok    %s\n' "$*"; }
fail() {
  printf '  FAIL  %s\n' "$*" >&2
  exit 1
}

# curl's JSON responses are small and predictable here, so the ids are pulled out
# with grep rather than adding a dependency on python or jq.
first_id() {
  grep -o '"id":"[0-9a-f-]\{36\}"' | head -1 | cut -d'"' -f4
}

printf '\nAirFLAC smoke test against %s\n\n' "$BASE"

HEALTH="$(curl -fsS "${BASE}/api/health")" || fail "health endpoint did not respond"
case "$HEALTH" in
*'"status":"ok"'*) pass "health reports ok" ;;
*) fail "health is not ok: ${HEALTH}" ;;
esac
case "$HEALTH" in
*'"ffmpeg":true'*'"ffprobe":true'*) pass "ffmpeg and ffprobe are present" ;;
*) fail "ffmpeg or ffprobe missing: ${HEALTH}" ;;
esac

ffmpeg -v error -y -f lavfi -i "sine=frequency=440:duration=2:sample_rate=44100" \
  -c:a pcm_s16le -ac 2 "${WORK}/Smoke Test.wav"
pass "generated a test tone"

UPLOAD="$(curl -fsS -X POST "${BASE}/api/upload" -F "files=@${WORK}/Smoke Test.wav")" ||
  fail "upload was rejected"
FILE_ID="$(printf '%s' "$UPLOAD" | first_id)"
[ -n "$FILE_ID" ] || fail "upload returned no file id: ${UPLOAD}"
case "$UPLOAD" in
*'"status":"ready"'*) pass "file inspected and ready" ;;
*) fail "file did not become ready: ${UPLOAD}" ;;
esac
case "$UPLOAD" in
*'"lossless":true'*) pass "WAV correctly reported as lossless" ;;
*) fail "WAV was not reported as lossless: ${UPLOAD}" ;;
esac

curl -fsS -X POST "${BASE}/api/convert" \
  -H 'Content-Type: application/json' \
  -d "{\"settings\":{\"compressionLevel\":5,\"sampleRate\":\"source\",\"bitDepth\":\"source\"},\"files\":[{\"fileId\":\"${FILE_ID}\",\"metadata\":{\"title\":\"Smoke Test\",\"artist\":\"AirFLAC\",\"album\":\"CI\"}}]}" \
  >/dev/null || fail "conversion request was rejected"
pass "conversion started"

CONVERTED=""
for _ in $(seq 1 60); do
  QUEUE="$(curl -fsS "${BASE}/api/queue")"
  case "$QUEUE" in
  *'"status":"complete"'*)
    CONVERTED=yes
    break
    ;;
  *'"status":"failed"'*) fail "conversion failed: ${QUEUE}" ;;
  esac
  sleep 1
done
[ -n "$CONVERTED" ] || fail "conversion did not finish within 60 seconds"
pass "conversion completed"

curl -fsS -o "${WORK}/out.flac" "${BASE}/api/download/${FILE_ID}" || fail "download failed"
[ "$(head -c 4 "${WORK}/out.flac")" = "fLaC" ] || fail "downloaded file is not a FLAC"
pass "downloaded a real FLAC"

CODEC="$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=nw=1:nk=1 "${WORK}/out.flac")"
[ "$CODEC" = "flac" ] || fail "expected a flac stream, got ${CODEC}"
TITLE="$(ffprobe -v error -show_entries format_tags=title -of default=nw=1:nk=1 "${WORK}/out.flac")"
[ "$TITLE" = "Smoke Test" ] || fail "expected the edited title to be written, got '${TITLE}'"
pass "metadata written to the output"

curl -fsS -X DELETE "${BASE}/api/queue" >/dev/null || fail "could not clear the queue"
pass "queue cleared"

printf '\nSmoke test passed.\n\n'
