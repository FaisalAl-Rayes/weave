# Security Policy

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Instead, report them by emailing the maintainer directly or by using GitHub's private vulnerability reporting feature (Security → Report a vulnerability).

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

This project is maintained on a best-effort basis. I'll respond as soon as I can but cannot guarantee specific timelines.

## Scope

Weave runs locally and does not expose any public endpoints by default. The primary attack surface is the schema YAML files and the datasource connection configuration — both are user-supplied and run with the same trust level as the user running the server.
