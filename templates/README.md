# UBL invoice → checks → human approval → payment proposal

`ap-invoice-payment-check.json` is an inactive, MIT-licensed n8n workflow. It does not pay a bank, post to a ledger, update a supplier record, or prove who owns an account. Review the proposals before using them. Never upload the fictitious test payment to a bank.

## Setup

Use an n8n version with Data Table and Send Email → Send and Wait for Response. The acceptance target is n8n 2.40.5; the Jithox node's separate minimum of 1.85 does not imply this whole template works on 1.85. Install `n8n-nodes-jithox` 0.1.2, then import the JSON (UI or `n8n import:workflow --input=templates/ap-invoice-payment-check.json`). Import alone does not configure credentials.

The CLI export has the fixed ID `JithoxApPaymentCheck`; importing it again can replace a workflow with that ID. Use a fresh instance for acceptance, and duplicate the workflow or choose a different ID before importing another copy into an operational instance.

1. Configure an IMAP credential on **Invoice email**, restrict it to an AP inbox, and leave attachment downloads enabled. Nothing changes the mailbox by default. Add your own message/invoice deduplication before operational use; repeated messages can generate repeated proposals.
2. Create an n8n Data Table with string columns `supplierKey` and `ibanOnFile`. Use one unique supplier VAT identifier per row; select that table in **Supplier table**. Normalize identifiers and IBANs beforehand. Populate it only from independently verified vendor-master records, never from incoming email, invoice attachments, or an AI model. The workflow only reads it. Missing, duplicate, invalid, or failed lookups hold the invoice.
3. Fill **Operator settings** with your trusted debtor name, IBAN, BIC, execution date (YYYY-MM-DD), sender and approver email. These are controlled configuration, not invoice-derived data. Select an SMTP credential on **Human approval**. These values are intentionally blank in the public template.
4. **Optional VAT** is disabled by default. To enable it, select a Jithox API credential in n8n's credential store. It calls the paid VAT endpoint; consult the operation/API response's `pricing` and `billing` fields for the actual price and charge, rather than copying a fixed price. An error, unavailable or invalid VAT answer holds export. Anonymously, the separate invoice review does not perform VIES checks: they remain `skipped` with `hasUnknowns: true`, not passed. Disabling VAT is a conscious limitation, not a VAT verification.
5. Configure a reachable, protected n8n webhook base URL for approval links. Protect the approver mailbox; approval links are bearer capabilities and can be forwarded. Do not publish them or raw execution data. For a Slack variant, replace **Human approval** with Slack's Send and Wait approval operation and explicitly adapt/test **Approval gate** against its response. The shipped gate expects the Email node's `data.approved === true`.
6. Enable the workflow only after an isolated test with your bank's format requirements. This is a small starting template, not a complete AP control framework.

## Supported input and limits

Exactly one `.xml` attachment per email, UTF-8, at most 256 KiB, without DTD/entities. The XML node parses it; the Code mapper accepts a deliberately narrow UBL Invoice subset using the standard default Invoice namespace and `cac`/`cbc` prefixes. It requires invoice number, issue/due dates, EUR, type 380, supplier/customer names, VAT identifiers and postal addresses, one credit-transfer PaymentMeans (30) with exactly one payee IBAN, totals and 1–100 lines. Explicit supplier/customer `cbc:EndpointID` values and their `schemeID` attributes are preserved, never guessed; missing Peppol addresses will be held by the live review. Quantities/prices/rates use up to two decimal places.

No PDF extraction or OCR exists in v1. PDF-only, absent or multiple XML attachments go to **Manual entry required** and cannot export. That branch is an execution log, not an extraction form; connect an internal work queue if needed. Malformed/unsupported XML goes to human approval with a hold. Alternate prefixes, credit notes, prepayments, allowances/charges, base quantities, payment terms, rounding and non-EUR/mixed-currency invoices need a separate mapping and are intentionally held. The mapper is not a full UBL/EN16931 validator; the live review checks only the structured fields it receives.

The calls are sequential per invoice: supplier lookup → free `check_payment_change` on the public MCP endpoint → free anonymous invoice review → optional credential-backed VAT → summary → approval. The loop processes one item at a time. Configure n8n's production concurrency limit to 1 for a dedicated AP instance if you also need to serialize separate IMAP-triggered executions; the per-execution loop alone does not serialize independent incoming emails.

## Approval and failures

Every supported invoice reaches **Human approval**. `verify_first` means call the supplier through a trusted number already on file, have them read the account back, record who/when, and obtain second-person approval before approving. The workflow cannot verify that this call took place. `no_change` is not a statement of account ownership or invoice authenticity and still requires approval.

HTTP timeouts, 403 challenges (including HTML or non-JSON-RPC bodies), 5xx, wrong RPC IDs, malformed/unknown responses, mismatched accounts, missing local review checks, bad totals and review blockers are a **DO NOT PAY** hold. They still reach the human, but even clicking Approve does not permit an export: resolve the issue and rerun. There are no retry bursts. `stop` and `invalid_new_account` also cannot export. Rejection, an expired 24-hour wait, a missing response or any value other than boolean `true` logs a rejection/hold. SMTP delivery failure stops the execution without creating a payment proposal.

Only an approved, checked invoice produces binary `sepa` (pain.001.001.03 XML) and `booking` (JSON), also with a `bookingProposal` in the item JSON. The proposal has `posted: false` and no guessed ledger accounts or tax treatment. Export is not payment. Schema validity is not proof that a particular bank accepts this older pain version; check the bank's current implementation rules.

## Development and evidence

`node scripts/build-ap-template.mjs` embeds the readable `templates/code/*.js` Code-node bodies into the standalone workflow. Those bodies run inside n8n's async function wrapper, not as standalone CommonJS modules.

`node --test tests/ap-template.test.mjs tests/ap-evidence.test.mjs` runs the dependency-free repository tests. They execute the actual embedded Code-node bodies and check the public export for known node types, absence of credentials/keys/probe markers, and the User-Agent on each HTTP Request node. A separate evidence test checks removal of local resume tokens and credential references without changing API answers.

Local acceptance runner: install `n8n@2.40.5` under `.ap-local` (not a production dependency), then run `node scripts/ap-e2e.mjs` through the team heavy-work lock. It creates fresh local n8n state, imports the public workflow, injects the fictitious XML at the trigger (does not contact an IMAP server), substitutes a Set node for the supplier table, and captures SMTP on loopback without a relay. Only test copies mark Jithox calls as own traffic. Approval is exercised using curl on the actual captured signed link. No credential or probe marker is added to the public JSON.

See `evidence/ap-template/run-report.json` and the execution exports for what actually ran, including failures and cleanup. Production activation, real supplier account ownership, bank upload, accounting posting and a real IMAP mailbox are not proven by these tests. The AI Agent/Ollama result is recorded separately; do not infer an AI Agent call from `usableAsTool` or the node's presence in the registry.

Recorded acceptance on 2026-09-26: all three n8n executions succeeded. Live checks plus approval yielded a 1,016-byte payment proposal; live rejection and a local mocked HTTP 403 challenge plus approval produced no export. The live invoice review recorded VIES as skipped, not passed. No email left the loopback SMTP sink. XSD validation passed with .NET XmlReader using the pinned mirror recorded in `evidence/ap-template/xsd-source.json`; it is not a bank-specific acceptance test. Download that schema to `.ap-local/pain.001.001.03.xsd`, verify its recorded SHA-256, and run `powershell.exe -NoProfile -File scripts/validate-ap-sepa.ps1` to repeat validation. AI Agent/Ollama: **NIET GEDRAAID**, with the measured memory shortage and absent installation recorded in `ai-agent-result.json`.
