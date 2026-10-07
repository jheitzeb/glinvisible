# Security and privacy

This extension provides visual masking, not irreversible anonymization.
Do not rely on it to remove personal information from HTML exports, clipboard
contents, accessibility trees, browser search, or DevTools. Review masks before
sharing. Automated detectors may miss information.

Model installation uses pinned revisions with SHA-256 and size verification.
Chrome's extension CSP restricts executable code to bundled files. A dedicated
worker blocks remote fetch during inference. Data stays in the Chrome profile;
source text and masks are held in memory while redaction is active. Restore
clears the content-script detection cache and overlay. Model weights can be
removed from setup. Browser pages may independently make network requests.

To report a vulnerability, use GitHub's private vulnerability reporting if
available, or contact the repository owner privately. Include only synthetic
reproduction data, never credentials or personal information.
