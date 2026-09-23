# n8n-nodes-jithox

n8n community node for [Jithox](https://jithox.com): check EU VAT numbers
against VIES from inside a workflow.

## What it does

One operation, **Verify VAT IDs**. It sends up to 20 rows to
`POST https://jithox.com/api/v1/vat/verify` and outputs one item per row,
in the order VIES answered them.

Optional inputs:

- **Requester VAT ID** — your own EU VAT number. When set, a `valid` row
  carries the European Commission's consultation number for that lookup,
  registered to you. This is **not** a signed receipt.
- **Idempotency Key** — re-sending the same rows with the same key is
  charged once.

## Price

Each row VIES actually answers (`valid` or `invalid`) costs **1 credit
(EUR 0.01)**. Rows VIES could not reach in time cost nothing and are listed
for retry. The price and the charged/not-charged state for every call are
also returned live in the API response (`billing`, `pricing`) — read those
fields rather than trusting a cached number, including this one. Current
terms: https://jithox.com/api/pricing/v1.

There is no signed or hash-bound receipt on this route. `billing.receiptRunId`
is a reference to a credit-ledger booking, nothing more.

## Credentials

Create a **Jithox API** credential with a connection secret
(`jxc_live_…`). A person creates one, once, at
https://jithox.com/mcp/account#connection — that page also revokes it.
The secret is sent as `Authorization: Bearer <secret>`.

Without a valid credential every call fails closed with HTTP 401 before
anything runs or is charged (verified against the live endpoint while
building this node).

## Use as an AI Agent tool

The node sets `usableAsTool: true`, so an n8n **AI Agent** can call
**Verify VAT IDs** as a tool (n8n 1.85.0 or later; no extra environment
variable needed). Each call is charged like a normal run, per row VIES answers.

## Compatibility

Requires n8n **1.85.0 or later**: the node uses `NodeConnectionTypes` from
`n8n-workflow` (shipped with n8n 1.85.0). Compiled against `n8n-workflow` ^2.16.
Declarative credential, programmatic node (`execute`).

## Lint

`npm run lint` runs the same rules as the official n8n scan
(`npx @n8n/scan-community-package`, v0.37.0), see `eslint.config.mjs`.

## Resources

- [n8n community nodes docs](https://docs.n8n.io/integrations/community-nodes/)
- [Jithox OpenAPI](https://jithox.com/openapi.json)
- [Jithox account / connections](https://jithox.com/mcp/account)

## Development

```
npm install
npm run build
```

`dist/` is what ships (`files` in package.json), built from `credentials/`
and `nodes/` with `tsc`.

## License

MIT
