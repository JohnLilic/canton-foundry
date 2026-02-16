# Canton Foundry

Open-source infrastructure for [Canton Network](https://www.canton.network). Developer tools, contract libraries, and applications that strengthen the Canton ecosystem.

## Our Tools

| Tool | Description |
|------|-------------|
| [canton-patterns](https://github.com/JohnLilic/canton-patterns) | Audited, reusable Daml contract patterns (OpenZeppelin for Daml) |
| [create-canton-app](https://github.com/JohnLilic/create-canton-app) | One-command project scaffolder for Canton applications |
| [canton-ci-templates](https://github.com/JohnLilic/canton-ci-templates) | Production CI/CD workflows for Daml projects |

## Quick Start

```bash
# Install the Daml SDK
curl -sSL https://get.daml.com/ | sh

# Create a new project
npx create-canton-app myapp
cd myapp

# Build, test, and run
daml build
daml test
daml start
```

## Website

The site is a single `index.html` with embedded CSS and JS. No build step required.

To run locally, open `index.html` in a browser or use any static file server:

```bash
python3 -m http.server 8000
```

Deployed via GitHub Pages from the `main` branch.

## License

[BSD-0-Clause](LICENSE) — use however you want, no strings attached.
