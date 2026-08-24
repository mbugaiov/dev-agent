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

# Pid from hephaestus-oneshot.pid may be outer bash -c (ps truncates on macOS).
agent_oneshot_tree_matches_slug() {
  local pid="$1" slug="$2" kind="${3:-hephaestus}"
  local cmd child cmd2
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null || return 1
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  if oneshot_cmd_matches_slug "$cmd" "$slug" "$kind"; then return 0; fi
  if [[ "$cmd" == *hephaestus_oneshot_runner* ]] \
    || [[ "$cmd" == *HEPHAESTUS_LOG=projects/${slug}/factory* ]]; then
    return 0
  fi
  if [[ "$kind" == "argus" && "$cmd" == *argus-oneshot.out* ]]; then
    return 0
  fi
  while read -r child; do
    [[ -z "$child" ]] && continue
    cmd2="$(ps -p "$child" -o args= 2>/dev/null || true)"
    if oneshot_cmd_matches_slug "$cmd2" "$slug" "$kind"; then return 0; fi
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  return 1
}
