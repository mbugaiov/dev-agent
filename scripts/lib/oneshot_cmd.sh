# Shared oneshot cmdline matching (stop_dev_loop + oneshot_mutex).
# Source after setting SLUG.

oneshot_cmd_factory_slug_from_cmd() {
  local cmd="$1" kind="${2:-hephaestus}"
  local re
  case "$kind" in
    argus) re='QA_FACTORY_SLUG=("?)([a-z0-9][a-z0-9-]*)' ;;
    *) re='DEV_FACTORY_SLUG=("?)([a-z0-9][a-z0-9-]*)' ;;
  esac
  if [[ "$cmd" =~ $re ]]; then
    printf '%s' "${BASH_REMATCH[2]}"
    return 0
  fi
  return 1
}

oneshot_prompt_slug_from_cmd() {
  local cmd="$1" kind="${2:-hephaestus}"
  local re
  case "$kind" in
    argus) re='Argus qa-loop oneshot for ([a-z0-9][a-z0-9-]*)' ;;
    *) re='Hephaestus oneshot for ([a-z0-9][a-z0-9-]*)' ;;
  esac
  if [[ "$cmd" =~ $re ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

oneshot_cmd_matches_slug() {
  local cmd="$1" slug="$2" kind="${3:-hephaestus}"
  local found
  found="$(oneshot_cmd_factory_slug_from_cmd "$cmd" "$kind" || true)"
  [[ -n "$found" && "$found" == "$slug" ]] && return 0
  found="$(oneshot_prompt_slug_from_cmd "$cmd" "$kind" || true)"
  [[ -n "$found" && "$found" == "$slug" ]] && return 0
  return 1
}

oneshot_cmd_conflicts_slug() {
  local cmd="$1" slug="$2" kind="${3:-hephaestus}"
  local found
  found="$(oneshot_cmd_factory_slug_from_cmd "$cmd" "$kind" || true)"
  [[ -n "$found" && "$found" != "$slug" ]] && return 0
  found="$(oneshot_prompt_slug_from_cmd "$cmd" "$kind" || true)"
  [[ -n "$found" && "$found" != "$slug" ]] && return 0
  return 1
}

oneshot_factory_path_in_cmd() {
  local cmd="$1" slug="$2"
  [[ "$cmd" == *projects/${slug}/factory* ]]
}

oneshot_runner_in_cmd() {
  local cmd="$1"
  [[ "$cmd" == *hephaestus_oneshot_runner.sh* ]]
}

# Linux: pid-file often points at runner; slug is in inherited environ, not argv.
oneshot_environ_matches_slug() {
  local pid="$1" slug="$2"
  local blob line factory_slug="" path_ok=0
  [[ -r "/proc/$pid/environ" ]] || return 1
  blob="$(tr '\0' '\n' <"/proc/$pid/environ" 2>/dev/null || true)"
  [[ -n "$blob" ]] || return 1
  while IFS= read -r line; do
    if [[ "$line" == DEV_FACTORY_SLUG=* ]]; then
      factory_slug="${line#DEV_FACTORY_SLUG=}"
      factory_slug="${factory_slug#\"}"
      factory_slug="${factory_slug%\"}"
    fi
    [[ "$line" == HEPHAESTUS_LOG=*projects/${slug}/factory* ]] && path_ok=1
    [[ "$line" == HEPHAESTUS_HEARTBEAT=*projects/${slug}/factory* ]] && path_ok=1
  done <<<"$blob"
  if [[ -n "$factory_slug" && "$factory_slug" != "$slug" ]]; then return 1; fi
  [[ "$factory_slug" == "$slug" ]] && return 0
  [[ "$path_ok" -eq 1 && -z "$factory_slug" ]] && return 0
  return 1
}

# Linux ps often attributes hephaestus-oneshot.pid to the runner child; slug lives on
# the parent bash -c (DEV_FACTORY_SLUG / HEPHAESTUS_LOG) or inherited environ.
oneshot_ancestors_match_slug() {
  local pid="$1" slug="$2" kind="${3:-hephaestus}"
  local ppid cmd i
  for i in 1 2 3 4 5 6; do
    ppid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d '[:space:]' || true)"
    [[ -z "$ppid" || "$ppid" == "0" || "$ppid" == "1" ]] && break
    if oneshot_environ_matches_slug "$ppid" "$slug"; then return 0; fi
    cmd="$(ps -p "$ppid" -o args= 2>/dev/null || true)"
    if oneshot_cmd_conflicts_slug "$cmd" "$slug" "$kind"; then return 1; fi
    if oneshot_cmd_matches_slug "$cmd" "$slug" "$kind"; then return 0; fi
    if oneshot_factory_path_in_cmd "$cmd" "$slug"; then return 0; fi
    pid="$ppid"
  done
  return 1
}

oneshot_process_matches_slug() {
  local pid="$1" slug="$2" kind="${3:-hephaestus}"
  local cmd
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  if oneshot_cmd_conflicts_slug "$cmd" "$slug" "$kind"; then return 1; fi
  if oneshot_cmd_matches_slug "$cmd" "$slug" "$kind"; then return 0; fi
  if oneshot_factory_path_in_cmd "$cmd" "$slug"; then return 0; fi
  if oneshot_runner_in_cmd "$cmd"; then
    if oneshot_ancestors_match_slug "$pid" "$slug" "$kind"; then return 0; fi
    if oneshot_environ_matches_slug "$pid" "$slug"; then return 0; fi
  fi
  if [[ "$cmd" == *cursor-agent* ]] && oneshot_environ_matches_slug "$pid" "$slug"; then
    return 0
  fi
  return 1
}

# Pid from hephaestus-oneshot.pid may be outer bash -c (ps truncates on macOS).
agent_oneshot_tree_matches_slug() {
  local pid="$1" slug="$2" kind="${3:-hephaestus}"
  local child
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null || return 1
  if oneshot_process_matches_slug "$pid" "$slug" "$kind"; then return 0; fi
  while read -r child; do
    [[ -z "$child" ]] && continue
    if oneshot_process_matches_slug "$child" "$slug" "$kind"; then return 0; fi
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  return 1
}
