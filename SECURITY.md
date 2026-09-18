# Security Policy

## Supported Versions

Only the latest release receives security fixes.

| Version | Supported |
| --- | --- |
| 0.9.x (latest) | Yes |
| < 0.9 | No - please update |

## Reporting a Vulnerability

Please **do not** open a public issue for security problems.

Report it privately instead:

1. Go to the [Security tab](https://github.com/Anviktor2411/iso-package-manager/security)
2. Click **Report a vulnerability**
3. Describe the problem

Only the maintainer can see the report. You will get an answer in the same private thread.

Please include:

- What you found and why it is a security issue
- Steps to reproduce (as safely as possible)
- Affected version, OS (Linux/Windows/macOS) and Python version

## Scope

- The application code in this repository (`main.py`, `ipm_*.py`, `tools/`, `scripts/`)
- The GitHub Actions workflows in `.github/workflows/`
- The Theme Shop website in `docs/`

Theme packs are data only: the app never executes anything from a pack. A pack that
still manages to cause harm (crash, file access outside its folder, ...) is in scope.

## Notes

This app downloads files from the internet. Only download ISOs from sources you trust,
and verify the SHA-256 checksum against the publisher's official value before installing.
