# Miley

> **Fork notice:** Miley is a derivative work of [Cyrus](https://github.com/ceedaragents/cyrus) by [Ceedar](https://ceedaragents.com), licensed under the Apache License 2.0. See [NOTICE](NOTICE) for attribution details.

A self-hosted Linear-to-Claude Code bridge agent. Miley monitors Linear issues assigned to it, creates isolated Git worktrees for each issue, runs Claude Code sessions to process them, and streams detailed agent activity updates back to Linear.

**Note:** Miley requires you to bring your own Anthropic API key.

---

## Getting Started

### Pro & Team Plans

Configure Cyrus through the dashboard at [app.atcyrus.com](https://app.atcyrus.com).

#### For self-hosted deployments

```bash
# Install Cyrus
npm install -g cyrus-ai

# Authenticate with your token (provided during onboarding)
cyrus auth <your-token>
```

For Cyrus to create pull requests, configure Git and GitHub CLI. See **[Git & GitHub Setup](./docs/GIT_GITHUB.md)**.

Keep Cyrus running as a persistent process:

- **tmux**: `tmux new -s cyrus` then run `cyrus` (Ctrl+B, D to detach)
- **pm2**: `pm2 start cyrus --name cyrus`
- **systemd**: See [Running as a Service](./docs/SELF_HOSTING.md#running-as-a-service)

#### For cloud-hosted deployments

No installation required. Everything is managed through [app.atcyrus.com](https://app.atcyrus.com).

---

### End-to-End Self-Hosted (Community)

Zero cost option. This requires hosting everything yourself, including your own Linear OAuth app.

Follow the complete **[End-to-End Community Guide](./docs/SELF_HOSTING.md)**.

---

## Documentation

- **[End-to-End Community Guide](./docs/SELF_HOSTING.md)** - Complete community manual setup
- **[Git & GitHub Setup](./docs/GIT_GITHUB.md)** - Git and GitHub CLI configuration for PRs
- **[Configuration Reference](./docs/CONFIG_FILE.md)** - Detailed config.json options
- **[Cloudflare Tunnel Setup](./docs/CLOUDFLARE_TUNNEL.md)** - Expose your local instance
- **[Setup Scripts](./docs/SETUP_SCRIPTS.md)** - Repository and global initialization scripts

---

## License

This project is licensed under the Apache 2.0 license - see the [LICENSE](LICENSE) file for details.

## Credits

- [Cyrus](https://github.com/ceedaragents/cyrus) by Ceedar — the upstream project this fork is based on
- [Linear API](https://linear.app/developers)
- [Anthropic Claude Code](https://www.claude.com/product/claude-code)
