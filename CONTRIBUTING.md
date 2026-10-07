# Contributing

Use Node.js 22+, run `npm ci`, and follow the development checks in README.md.
Keep model implementations behind Detector. Return original UTF-16 offsets,
never normalized-text offsets. Inference must run with networking disabled.
Do not add analytics or upload page data. Never commit model weights, browser
profiles, screenshots containing real personal information, or secrets.

For new model adapters, document the license, exact revision, asset hashes,
label mapping, memory requirements, and limitations. Include a real-model
cold-start offline smoke check. Accuracy evaluation should measure recall,
false negatives, and false positives on consented or synthetic datasets.

Bug reports should include Chrome version, OS, model ID, and a synthetic page
that reproduces the issue. Keep private page content out of public issues.
