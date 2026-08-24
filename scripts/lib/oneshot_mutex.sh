# Atomic oneshot mutex (mkdir lock + live-pid scan).
# Source from ensure_hephaestus_agent.sh / keep in sync with qa-agent copy.
#
# Usage (after setting SLUG, FACTORY, PID_FILE, ONESHOT_KIND=hephaestus|argus):
#   source "$ROOT/scripts/lib/oneshot_mutex.sh"
#   if oneshot_already_running; then … exit 0; fi
#   oneshot_lock_acquire || { oneshot_already_running && exit 0; … }
#   … spawn …
#   oneshot_lock_release
#
# KIND=hephaestus matches DEV_FACTORY_SLUG=<slug> or "Hephaestus oneshot for <slug>"
# KIND=argus       matches QA_FACTORY_SLUG=<slug> or "Argus qa-loop oneshot for <slug>"

oneshot_lock_dir() {
  printf '%s/oneshot.lock' "${FACTORY:?}"
}

oneshot_cmd_matches_slug() {
  local cmd="$1" slug="$2" kind="${3:-hephaestus}"
  case "$kind" in
    argus)
      [[ "$cmd" =~ QA_FACTORY_SLUG=${slug}([^a-z0-9-]|$) ]] && return 0
      [[ "$cmd" =~ Argus\ qa-loop\ oneshot\ for\ ${slug}([^a-z0-9-]|$) ]] && return 0
      ;;
    *)
      [[ "$cmd" =~ DEV_FACTORY_SLUG=${slug}([^a-z0-9-]|$) ]] && return 0
      [[ "$cmd" =~ Hephaestus\ oneshot\ for\ ${slug}([^a-z0-9-]|$) ]] && return 0
      ;;
  esac
  return 1
}

oneshot_pid_is_ours() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null || return 1
  local cmd
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  oneshot_cmd_matches_slug "$cmd" "$SLUG" "${ONESHOT_KIND:-hephaestus}"
}

# Print a live pid for this slug, or empty. Prefers PID_FILE, then pgrep.
oneshot_find_live_pid() {
  local old cmd pid
  if [[ -f "${PID_FILE:?}" ]]; then
    old="$(tr -d '[:space:]' <"$PID_FILE" || true)"
    if oneshot_pid_is_ours "$old"; then
      printf '%s' "$old"
      return 0
    fi
  fi
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    # Ignore this ensure script itself.
    [[ "$cmd" == *ensure_hephaestus_agent.sh* || "$cmd" == *ensure_argus.sh* ]] && continue
    if oneshot_cmd_matches_slug "$cmd" "$SLUG" "${ONESHOT_KIND:-hephaestus}"; then
      printf '%s' "$pid"
      return 0
    fi
  done < <(pgrep -f "oneshot for ${SLUG}([^a-z0-9-]|$)|DEV_FACTORY_SLUG=${SLUG}([^a-z0-9-]|$)|QA_FACTORY_SLUG=${SLUG}([^a-z0-9-]|$)" 2>/dev/null || true)
  return 1
}

oneshot_already_running() {
  local live
  live="$(oneshot_find_live_pid || true)"
  [[ -n "$live" ]] || return 1
  echo "$live" >"$PID_FILE"
  return 0
}

oneshot_lock_acquire() {
  local dir i owner
  dir="$(oneshot_lock_dir)"
  for i in $(seq 1 20); do
    if mkdir "$dir" 2>/dev/null; then
      echo "$$" >"$dir/owner"
      return 0
    fi
    if oneshot_find_live_pid >/dev/null; then
      return 1
    fi
    owner="$(tr -d '[:space:]' <"$dir/owner" 2>/dev/null || true)"
    if [[ -n "$owner" ]] && kill -0 "$owner" 2>/dev/null; then
      sleep 0.15
      continue
    fi
    # Owner dead or missing — stale lock, steal.
    rm -rf "$dir" 2>/dev/null || true
    sleep 0.05
  done
  return 1
}

oneshot_lock_release() {
  rm -rf "$(oneshot_lock_dir)" 2>/dev/null || true
}
