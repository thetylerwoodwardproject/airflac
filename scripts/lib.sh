#!/usr/bin/env bash
# Shared settings and helpers for the AirFLAC install, update and uninstall scripts.
# These paths must agree across all three, which is why they live in one place.

APP_NAME="AirFLAC"
SERVICE_NAME="airflac"
SERVICE_USER="airflac"
INSTALL_DIR="/opt/airflac"
CONFIG_DIR="/etc/airflac"
CONFIG_FILE="${CONFIG_DIR}/airflac.env"
DATA_DIR="/var/lib/airflac"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
MIN_NODE_MAJOR=22
MIN_DEBIAN_MAJOR=13
NODESOURCE_MAJOR=22

info() { printf '  %s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    fail "This script must be run as root. Try: sudo $0"
  fi
}

require_debian_like() {
  [ -r /etc/os-release ] || fail "Cannot read /etc/os-release. ${APP_NAME} supports Ubuntu and Debian."

  # shellcheck disable=SC1091
  . /etc/os-release

  case "${ID:-} ${ID_LIKE:-}" in
  *debian* | *ubuntu*) info "Detected ${PRETTY_NAME:-${ID:-unknown}}" ;;
  *)
    fail "${APP_NAME} supports Ubuntu and Debian. Detected: ${PRETTY_NAME:-${ID:-unknown}}.
For other distributions, use the Docker deployment instead."
    ;;
  esac

  # Debian 13 is the oldest release AirFLAC is tested on. Older ones are warned
  # about rather than refused: they will often work, they are just not covered.
  if [ "${ID:-}" = debian ] && [ -n "${VERSION_ID:-}" ]; then
    local debian_major="${VERSION_ID%%.*}"
    if [ "$debian_major" -lt "$MIN_DEBIAN_MAJOR" ] 2>/dev/null; then
      warn "Debian ${VERSION_ID} is older than the tested minimum of ${MIN_DEBIAN_MAJOR}. The install may still work but is not covered by testing."
    fi
  fi
}

# Reads the configured port so the scripts can report and health-check the right URL.
configured_port() {
  if [ -r "$CONFIG_FILE" ]; then
    local port
    port="$(grep -E '^AIRFLAC_PORT=' "$CONFIG_FILE" | tail -1 | cut -d= -f2 | tr -d '"'"'"' ')"
    if [ -n "$port" ]; then
      printf '%s' "$port"
      return
    fi
  fi
  printf '8080'
}

ensure_ffmpeg() {
  if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
    info "ffmpeg and ffprobe are already installed"
    return
  fi

  info "Installing ffmpeg (provides both ffmpeg and ffprobe)"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg

  command -v ffmpeg >/dev/null 2>&1 || fail "ffmpeg is still missing after installation."
  command -v ffprobe >/dev/null 2>&1 || fail "ffprobe is still missing after installation."
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [ "$major" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null; then
      info "Node.js $(node -v) is already installed"
      return
    fi
    warn "Node.js $(node -v) is older than the required v${MIN_NODE_MAJOR}. Installing a current release."
  fi

  info "Installing Node.js ${NODESOURCE_MAJOR}.x from NodeSource"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates

  # The distribution's own nodejs package is frequently too old for this project.
  curl -fsSL "https://deb.nodesource.com/setup_${NODESOURCE_MAJOR}.x" | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs

  command -v node >/dev/null 2>&1 || fail "Node.js is still missing after installation."
  info "Installed Node.js $(node -v)"
}

create_service_user() {
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    info "Service user '${SERVICE_USER}' already exists"
    return
  fi

  info "Creating system user '${SERVICE_USER}'"
  useradd --system --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
}

create_data_dirs() {
  info "Creating storage under ${DATA_DIR}"
  mkdir -p "${DATA_DIR}/uploads" "${DATA_DIR}/converted" "${DATA_DIR}/archives"
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "$DATA_DIR"
  chmod 750 "$DATA_DIR"
}

# Copies the application into INSTALL_DIR and builds it.
install_application() {
  local source_dir="$1"

  [ -f "${source_dir}/package.json" ] || fail "Cannot find package.json in ${source_dir}."

  # Guard against a mistyped INSTALL_DIR before anything is removed.
  case "$INSTALL_DIR" in
  /opt/airflac) : ;;
  *) fail "Refusing to replace '${INSTALL_DIR}': expected /opt/airflac." ;;
  esac

  info "Installing application files into ${INSTALL_DIR}"
  rm -rf "${INSTALL_DIR:?}"
  mkdir -p "$INSTALL_DIR"

  local item
  for item in package.json package-lock.json tsconfig.base.json shared server client scripts systemd LICENSE README.md; do
    if [ -e "${source_dir}/${item}" ]; then
      cp -a "${source_dir}/${item}" "${INSTALL_DIR}/"
    fi
  done

  # A stale node_modules or dist copied from the source tree would be rebuilt anyway.
  rm -rf "${INSTALL_DIR}/node_modules" "${INSTALL_DIR}"/*/node_modules "${INSTALL_DIR}"/*/dist

  step "Installing dependencies (this can take a few minutes)"
  (cd "$INSTALL_DIR" && npm ci --no-audit --no-fund)

  step "Building ${APP_NAME}"
  (cd "$INSTALL_DIR" && npm run build)

  info "Removing build-only dependencies"
  (cd "$INSTALL_DIR" && npm prune --omit=dev --no-audit --no-fund)

  # The service account only needs to read the application; it never writes here.
  chown -R root:root "$INSTALL_DIR"
}

create_config_if_missing() {
  mkdir -p "$CONFIG_DIR"

  if [ -f "$CONFIG_FILE" ]; then
    info "Keeping existing configuration at ${CONFIG_FILE}"
    return
  fi

  info "Writing default configuration to ${CONFIG_FILE}"
  cat >"$CONFIG_FILE" <<EOF
# ${APP_NAME} configuration. Restart after editing: systemctl restart ${SERVICE_NAME}
AIRFLAC_HOST=0.0.0.0
AIRFLAC_PORT=8080

AIRFLAC_MAX_UPLOAD_MB=1000
AIRFLAC_FILE_RETENTION_HOURS=24
AIRFLAC_FLAC_COMPRESSION_LEVEL=5

AIRFLAC_STORAGE_PATH=${DATA_DIR}

AIRFLAC_MAX_CONCURRENT_CONVERSIONS=2
AIRFLAC_MAX_ARTWORK_MB=10

# Set to true only when running behind a reverse proxy you control.
AIRFLAC_TRUST_PROXY=false

AIRFLAC_LOG_LEVEL=info
EOF

  chmod 640 "$CONFIG_FILE"
  chown root:"$SERVICE_USER" "$CONFIG_FILE"
}

install_service() {
  local source_dir="$1"
  local unit_source="${source_dir}/systemd/${SERVICE_NAME}.service"

  [ -f "$unit_source" ] || fail "Cannot find the systemd unit at ${unit_source}."

  # ensure_node accepts any suitable Node on PATH, which is not always the
  # /usr/bin/node the shipped unit assumes: a Node installed from a tarball or by
  # nvm lands elsewhere. The installed unit is pointed at whichever one this
  # system actually has, or the service would fail to start.
  local node_bin
  node_bin="$(command -v node)" || fail "Node.js is not on PATH."

  info "Installing systemd unit (node: ${node_bin})"
  cp "$unit_source" "$UNIT_FILE"
  sed -i "s|^ExecStart=.*|ExecStart=${node_bin} ${INSTALL_DIR}/server/dist/index.js|" "$UNIT_FILE"
  chmod 644 "$UNIT_FILE"
  systemctl daemon-reload
}

# Polls /api/health until the service answers, so a failed start is reported here
# rather than discovered later.
wait_for_health() {
  local port remaining
  port="$(configured_port)"
  remaining=30

  while [ "$remaining" -gt 0 ]; do
    if curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    remaining=$((remaining - 1))
  done

  return 1
}
