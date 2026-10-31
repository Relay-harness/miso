# Provider setup and limits

| Tab | Source | Meaning |
| --- | --- | --- |
| Claude | Signed-in default Claude Code CLI, subscription usage | Provider windows, often five-hour, weekly and additional model-specific windows |
| OpenAI | Default Codex OAuth login | Codex subscription quota, not a universal ChatGPT message counter |
| Gemini | Separately approved supported browser/app session | Gemini app quota, not Gemini CLI/API |
| Grok | Supported Grok CLI subscription OAuth | Subscription windows, not xAI API wallet credit |

Install the relevant provider CLI yourself. Miso does not ship a provider account, API key or login session. For Claude, `claude auth login` authenticates the default profile; browser sign-in alone does not. For Codex, use `codex login`. The wrapper intentionally does not inherit custom CLAUDE_CONFIG_DIR/CODEX_HOME profiles or token/key environment variables.

The reader's PATH includes user-local, Grok-local, common Homebrew and system binary locations. A CLI available only through a shell alias, shell startup script, or an unsupported version-manager path may not be found. Do not fix this by passing every environment variable through the app. Report a redacted executable-resolution issue.

Current helper: CodexBar CLI 0.82.0, pinned in ThirdParty/CodexBar/dependency.json. The source was locally exercised with Claude Code 2.1.316; provider compatibility is not guaranteed for every version or account. The authenticated Claude path was verified during local development, but CI contains no private account validation. Other connectors may be unavailable for some plans, regions or endpoints.

Quota refresh is manual or about every five minutes after approval. Old readings (over ten minutes), expired/reset windows, diagnostics and synthetic placeholders are not presented as live allowance. A failed request does not mean zero. Counts from local token logs can include different accounts and cannot supply a subscription message denominator.

The app retains only in-memory account-scope digests for forecast continuity. Forecasts need at least three fresh same-scope measurements, a sufficient time span and movement, matching reset boundaries, and no long gap. An app restart clears the pace history. If identity/reset metadata is missing, the app explains why no ETA is available rather than guessing.

Quota 100% or a rate-limited quota-check endpoint is not sufficient evidence of a hard 429 in an active terminal task. No task-freeze/upload command is enabled in this release.
