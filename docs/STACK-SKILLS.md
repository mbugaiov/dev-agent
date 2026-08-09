# Stack skills — engine install catalog

Marketplace / upstream skill packs are installed **only in this engine**
(`.agents/skills/`, gitignored). Customer app repos must not vendor packs or
skill URLs (`dev-client-repo-hygiene.mdc`).

## Auto-install (from `project.yaml` → `stack.*`)

```bash
# Preview which packs match the slug's stack:
bash scripts/sync_stack_skills.sh <SLUG> --dry-run

# Install / refresh from upstream:
bash scripts/sync_stack_skills.sh <SLUG>

# Same map without a slug:
bash scripts/sync_stack_skills.sh --list-packs

# Fail if required packs missing; write Read-list:
bash scripts/verify_stack_skills.sh <SLUG>
bash scripts/verify_stack_skills.sh <SLUG> --install   # sync + verify
# → projects/<SLUG>/factory/stack-skills.manifest  (engine-root-relative paths)
```

`setup_verify.sh <SLUG>` requires `STACK_SKILLS_OK`. Factory agents must **Read**
every `SKILL.md` in the manifest before stack implement (`dev-stack-skills.mdc`).

## Keyword → upstream (auto)

| `stack.*` keywords (case-insensitive) | Install source | How |
|--------------------------------------|----------------|-----|
| `asp.net`, `c#`, `dotnet`, `.net core` / `.net N` | [github.com/dotnet/skills](https://github.com/dotnet/skills) | `git clone` → copy plugins into `.agents/skills/dotnet-*` |
| `angular` | [analogjs/angular-skills](https://github.com/analogjs/angular-skills) | `npx skills add analogjs/angular-skills` |
| `ionic` | [capawesome-team/skills](https://github.com/capawesome-team/skills) | `npx skills add … --skill ionic-angular` (+ app-development, expert) |
| `sql server`, `mssql`, `t-sql`, `stored procedure` | [damusix/skills](https://github.com/damusix/skills) (`mssql-server`) | `npx skills add damusix/skills --skill mssql-server` |
| `supabase` | [supabase/agent-skills](https://github.com/supabase/agent-skills) | `npx skills add supabase/agent-skills --skill supabase` |

Bare `*.net` hostnames (e.g. `azurewebsites.net`) do **not** match .NET.

## Manual one-liners (same as the script)

```bash
# .NET (also done by sync_stack_skills for matching stacks)
git clone --depth 1 https://github.com/dotnet/skills.git /tmp/dotnet-skills-cache
# plugins copied into .agents/skills/dotnet-* by sync_stack_skills.sh

npx --yes skills add analogjs/angular-skills
npx --yes skills add capawesome-team/skills --skill ionic-angular
npx --yes skills add damusix/skills --skill mssql-server
npx --yes skills add supabase/agent-skills --skill supabase
```

Prefer `sync_stack_skills.sh <slug>` so installs stay aligned with `project.yaml`.

## Project-only overrides

`projects/<slug>/.cursor/skills/<name>/SKILL.md` (gitignored) — product-specific
playbooks. Listed in the same manifest after verify. Never copy into the app repo.

## Not installed here

- Playwright / JWT security packs → **qa-agent**
- Factory seats (`dev-*`, BA/UX/QA kicks) → engine `.cursor/skills/` (tracked)
- OpenSpec workflow (`openspec-*`) → **app** or host (allowed in app git)
