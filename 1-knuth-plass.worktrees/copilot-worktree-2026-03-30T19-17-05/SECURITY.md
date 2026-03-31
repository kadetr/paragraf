# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.x (latest minor) | ✅ |
| Older minor releases | ❌ |

Only the latest minor version of the current major receives security patches. Upgrade to the latest release before filing a report.

---

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/YOUR_ORG/knuth-plass/security/advisories/new) or by emailing `security@YOUR_DOMAIN`.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a minimal proof-of-concept
- Affected versions
- Any suggested mitigations (optional)

You will receive an acknowledgement within **3 business days** and a resolution timeline within **14 days**.

---

## Scope

This is a typography/text-layout library. It processes font files and text strings. Relevant attack surfaces:

**In scope**
- Path traversal or unsafe file access in font loading (`FontRegistry`, `loadFont`)
- Resource exhaustion from pathological input (very long paragraphs, extremely narrow line widths)
- Incorrect output that could be exploited in a security-sensitive rendering context (e.g. invisible text, overlapping glyphs used to obscure content)

**Out of scope**
- Vulnerabilities in `opentype.js` or `hyphen` — report those to their respective maintainers
- Issues that require an attacker to control the application's own font registry or source code
- General bugs that do not have a security impact

---

## Disclosure policy

Once a fix is available, we will:
1. Publish a patched release
2. Document the fix in [CHANGELOG.md](./CHANGELOG.md)
3. Credit the reporter in the release notes (unless anonymity is requested)
