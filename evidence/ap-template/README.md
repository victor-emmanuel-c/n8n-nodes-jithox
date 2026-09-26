# AP template acceptance evidence — 2026-09-26

Task: t_0f7298ae. Local branch: jx/ap-template. No push or publication.

## Executed checks

- `node --test tests/ap-template.test.mjs tests/ap-evidence.test.mjs`: 13/13 PASS (exit 0). Behavior changes were exercised red/green, including the real n8n HTTP text-response `data` field and preservation of explicit Peppol endpoints.
- `npm run lint`: PASS (exit 0). This repository's lint command covers package.json, nodes and credentials; it does not lint the new embedded Code-node scripts or .mjs files. Their behavior is covered by the Node tests and actual n8n execution.
- `bash C:/Users/victo/Projects/jithox-team/zwaar.sh npm run build`: PASS (exit 0).
- `git diff --check`: PASS. Git emitted its Windows LF/CRLF conversion notice, not a whitespace error.
- `scripts/ap-e2e.mjs` through the heavy-work lock: PASS, isolated n8n 2.40.5. The CLI import succeeded and n8n's runtime registry resolved all 10 distinct template node types.
- `.NET XmlReader` XSD validation through `scripts/validate-ap-sepa.ps1`: PASS, no issues. Pinned mirror size/hash/source are in xsd-source.json; it is not an official bank implementation guide.

## Actual executions

The three `*.execution.json` files preserve n8n timestamps and actual HTTP replies. Local resume tokens and credential references were removed with `scripts/sanitize-ap-execution.mjs`; the resultData was asserted unchanged. Binary data was materialized from n8n into base64 for a portable export. These are fictitious fixtures, not production invoices.

- live-approved: execution 1, success; payment HTTP 200 / verify_first; review HTTP 200 with anonymous VIES skipped; explicit approval true; exportAllowed true. Produced payment.pain.001.001.03.xml (1,016 bytes) and booking-proposal.json (unposted).
- mock-403-approved: execution 2, success; payment HTTP 403 from the loopback challenge fixture (no request burst); explicit approval true; exportAllowed false; no SEPA node execution. Invoice review remained a real live call.
- live-rejected: execution 3, success; live payment verify_first and review HTTP 200; explicit approval false; exportAllowed false; no SEPA node execution.

Post-run checks confirmed the embedded production Code-node bodies equal the shipped template, and exported binaries equal the execution's binary data. The XSD file's SHA-256 matched xsd-source.json. A sensitive-marker scan passed after sanitization. The final driver differs from the executed driver only by calling the tested sanitization helper when writing evidence; that helper was also applied to all three recorded exports.

## Cleanup and limitations

Only the loopback SMTP sink was configured, with no forwarding/relay implementation: 0 external emails. run-report.json records closed ports 1025, 5689, 5690 and 5691. A subsequent Windows process/port check found no corresponding listener, n8n PID 15556 or local .ap-local n8n process. No Ollama process was started.

AI Agent/Ollama: NIET GEDRAAID. ai-agent-result.json records 1,046 MiB free against the 3,000 MiB start threshold and no installed Ollama. Follow-up t_9daf7a3c owns that measurement.

Does not prove: real IMAP authentication (fixture replaces trigger), operational Data Table lookup (Set fixture), optional paid VAT operation, real human identity or independent supplier callback, account ownership, production activation, bank-specific acceptance/payment, ledger posting, or a full UBL/EN16931 validation of the original XML. Only the documented narrow mapping is supported. A successful execution means the workflow ran, not that an invoice is genuine or payable.
