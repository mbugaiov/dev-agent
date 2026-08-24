# Shared oneshot cmdline matching (stop_dev_loop + oneshot_mutex).
# Source after setting SLUG.

oneshot_cmd_matches_slug() {
  local cmd="$1" slug="$2" kind="${3:-hephaestus}"
  local re
  case "$kind" in
    argus)
      re="QA_FACTORY_SLUG=(\"?)${slug}([^a-z0-9-]|$)"
      [[ "$cmd" =~ $re ]] && return 0
      re="Argus qa-loop oneshot for ${slug}([^a-z0-9-]|$)"
      [[ "$cmd" =~ $re ]] && return 0
      ;;
    *)
      re="DEV_FACTORY_SLUG=(\"?)${slug}([^a-z0-9-]|$)"
      [[ "$cmd" =~ $re ]] && return 0
      re="Hephaestus oneshot for ${slug}([^a-z0-9-]|$)"
      [[ "$cmd" =~ $re ]] && return 0
      ;;
  esac
  return 1
}

oneshot_cmd_conflicts_slug() {
  local cmd="$1" slug="$2" kind="${3:-hephaestus}"
  local re other
  case "$kind" in
    argus) re='QA_FACTORY_SLUG=("?)([a-z0-9][a-z0-9-]*)' ;;
    *) re='DEV_FACTORY_SLUG=("?)([a-z0-9][a-z0-9-]*)' ;;
  esac
  if [[ "$cmd" =~ $re ]]; then
    other="${BASH_REMATCH[2]}"
    [[ -n "$other" && "$other" != "$slug" ]] && return 0
  fi
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

# Linux ps often attributes hephaestus-oneshot.pid to the runner child; slug lives on
# the parent bash -c (DEV_FACTORY_SLUG / HEPHAESTUS_LOG).
oneshot_ancestors_match_slug() {
  local pid="$1" slug="$2" kind="${3:-hephaestus}"
  local ppid cmd i
  for i in 1 2 3 4 5 6; do
    ppid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d '[:space:]' || true)"
    [[ -z "$ppid" || "$ppid" == "0" || "$ppid" == "1" ]] && break
    cmd="$(ps -p "$ppid" -o args= 2>/dev/null || true)"
    if oneshot_cmd_conflicts_slug "$cmd" "$slug" "$kind"; then return 1; fi
    if oneshot_cmd_matches_slug "$cmd" "$slug" "$kind"; then return 0; fi
    if oneshot_factory_path_in_cmd "$cmd" "$slug"; then return 0; fi
    pid="$ppid"
  done
  return 1
}

# Pid from hephaestus-oneshot.pid may be outer bash -c (ps truncates on macOS).
agent_oneshot_tree_matches_slug() {
  local pid="$1" slug="$2" kind="${3:-hephaestus}"
  local cmd child cmd2
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null || return 1
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  if oneshot_cmd_conflicts_slug "$cmd" "$slug" "$kind"; then return 1; fi
  if oneshot_cmd_matches_slug "$cmd" "$slug" "$kind"; then return 0; fi
  if oneshot_factory_path_in_cmd "$cmd" "$slug"; then return 0; fi
  if oneshot_runner_in_cmd "$cmd" && oneshot_ancestors_match_slug "$pid" "$slug" "$kind"; then
    return 0
  fi
  while read -r child; do
    [[ -z "$child" ]] && continue
    cmd2="$(ps -p "$child" -o args= 2>/dev/null || true)"
    if oneshot_cmd_conflicts_slug "$cmd2" "$slug" "$kind"; then continue; fi
    if oneshot_cmd_matches_slug "$cmd2" "$slug" "$kind"; then return 0; fi
    if oneshot_factory_path_in_cmd "$cmd2" "$slug"; then return 0; fi
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  return 1
}
