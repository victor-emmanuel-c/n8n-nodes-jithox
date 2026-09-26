import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const file = new URL('../templates/ap-invoice-payment-check.json', import.meta.url);
const load = () => JSON.parse(readFileSync(file, 'utf8'));
const node = (name) => load().nodes.find((n) => n.name === name);
export async function run(name, json, prior = {}, binary = {}) {
  const context = { $input: { first: () => ({ json, binary }), all: () => Array.isArray(json) ? json.map(json => ({json})) : [{ json, binary }] },
    $: (n) => ({ first: () => ({ json: prior[n] }) }), Buffer, console,
    $execution: { id: 'test-execution' } };
  return vm.runInNewContext(`(async function() {${node(name).parameters.jsCode}\n}).call({helpers:{prepareBinaryData: async (b, fileName, mimeType) => ({data:b.toString('base64'),fileName,mimeType}),getBinaryDataBuffer:async()=>Buffer.from(${JSON.stringify(binary.raw ?? '')})}})`, context);
}

test('public workflow exists, uses known types, contains no credentials or probe, and identifies every HTTP call', () => {
  assert.ok(existsSync(file), 'AP workflow is missing');
  const w = load();
  const known = new Set(['emailReadImap','code','if','xml','dataTable','httpRequest','emailSend','noOp','splitInBatches']);
  for (const n of w.nodes) {
    assert.ok(n.type === 'n8n-nodes-jithox.jithoxVat' || (n.type.startsWith('n8n-nodes-base.') && known.has(n.type.split('.').at(-1))), n.type);
    assert.ok(!n.credentials, n.name);
    if (n.type.endsWith('.httpRequest')) assert.equal(n.parameters.headerParameters.parameters.find(h => h.name.toLowerCase() === 'user-agent')?.value, 'n8n-ap-payment-check/1.0');
  }
  const text = JSON.stringify(w);
  assert.doesNotMatch(text, /x-jithox-probe|jxc_live_|Bearer |apiKey|"password"|"credentials"/i);
  assert.equal(w.active, false);
  assert.equal(w.id, 'JithoxApPaymentCheck');
  assert.equal(node('Human approval').parameters.operation, 'sendAndWait');
  assert.equal(node('Supplier table').type, 'n8n-nodes-base.dataTable');
  assert.equal(node('Optional VAT').disabled, true);
  assert.equal(node('One invoice at a time').parameters.batchSize, 1);
});

test('attachment selection holds PDF-only and multiple XML attachments', async () => {
  assert.equal((await run('Select UBL attachment', {}, {}, { a: {fileName:'invoice.pdf'} }))[0].json.hasUbl, false);
  assert.equal((await run('Select UBL attachment', {}, {}, { a: {fileName:'invoice.xml'}, b: {fileName:'second.xml'} }))[0].json.hasUbl, false);
  const selected = (await run('Select UBL attachment', {}, {}, { a: {fileName:'invoice.xml'} }))[0];
  assert.equal(selected.json.hasUbl, true);
  assert.equal(selected.json.attachmentKey, 'a');
});

test('XML reader rejects DTDs, oversized and non-UTF8 input before parsing', async () => {
  for (const raw of ['<!DOCTYPE x><Invoice/>', 'x'.repeat(262145), '\u0000<Invoice/>']) {
    const out = (await run('Read XML text', {attachmentKey:'a'}, {}, {raw}))[0].json;
    assert.ok(out.inputError);
    assert.equal(out.xml, '<Rejected/>');
  }
  assert.equal((await run('Read XML text', {attachmentKey:'a'}, {}, {raw:'<Invoice/>'}))[0].json.xml, '<Invoice/>');
});

const parsed = () => JSON.parse(readFileSync(new URL('./fixtures/invoice-parsed.json', import.meta.url)));
test('UBL mapping preserves account, identifiers, totals and lines; ambiguous/unsupported input is held', async () => {
  const good = (await run('Map UBL fields', parsed()))[0].json;
  assert.equal(good.invoice.iban, 'BE71096123456769');
  assert.equal(good.invoice.totalIncludingVat, 121);
  assert.equal(good.invoice.lines[0].vatPercent, 21);
  assert.equal(good.supplierKey, 'BE0123456789');
  for (const change of [
    d => d.Invoice['cac:PaymentMeans'].push(d.Invoice['cac:PaymentMeans'][0]),
    d => d.Invoice['cac:AllowanceCharge'] = [{}],
    d => d.Invoice['cbc:DocumentCurrencyCode'] = ['USD'],
    d => d.Invoice['cac:LegalMonetaryTotal'][0]['cbc:PayableAmount'][0]._ = '122.00',
    d => d.Invoice['cac:PaymentMeans'][0]['cac:PayeeFinancialAccount'][0]['cbc:ID'].push('BE68539007547034'),
  ]) {
    const data = parsed(); change(data);
    assert.ok((await run('Map UBL fields', data))[0].json.inputError);
  }
});

test('UBL mapper preserves explicit Peppol endpoints and refuses ambiguous endpoints', async () => {
  const data = parsed();
  for (const key of ['cac:AccountingSupplierParty','cac:AccountingCustomerParty']) data.Invoice[key][0]['cac:Party'][0]['cbc:EndpointID'] = [{_: '0123456789', $:{schemeID:'0208'}}];
  const mapped = (await run('Map UBL fields', data))[0].json;
  for (const party of [mapped.invoice.supplier, mapped.invoice.customer]) {
    assert.equal(party.endpointId, '0123456789');
    assert.equal(party.endpointScheme, '0208');
  }
  data.Invoice['cac:AccountingSupplierParty'][0]['cac:Party'][0]['cbc:EndpointID'].push('other');
  assert.ok((await run('Map UBL fields', data))[0].json.inputError);
});

test('trusted supplier binding fails closed for missing/duplicate/wrong rows', async () => {
  const prior = {'Operator settings': {supplierKey:'BE0123456789', invoice:{iban:'BE71096123456769'}, operator:{}}};
  const row = {supplierKey:'BE0123456789', ibanOnFile:'BE68539007547034'};
  assert.equal((await run('Bind trusted supplier', row, prior))[0].json.ibanOnFile, row.ibanOnFile);
  for (const rows of [{}, [row, row], {...row, supplierKey:'wrong'}]) assert.ok((await run('Bind trusted supplier', rows, prior))[0].json.supplierError);
});

const paymentBody = () => ({jsonrpc:'2.0',id:'payment-change',result:{isError:false,structuredContent:{kind:'payment_change_check',data:{verdict:'verify_first',newAccount:{status:'valid',iban:'BE71 0961 2345 6769'},accountOnFile:{status:'valid',iban:'BE68 5390 0754 7034'},requiredSteps:['Call independently']}}}});
const paymentPrior = {'Bind trusted supplier':{invoice:{iban:'BE71096123456769'},ibanOnFile:'BE68539007547034'}};
test('payment parser accepts matched JSON-RPC and fails closed for HTTP/challenge/protocol/shape/account failures', async () => {
  const good = {statusCode:200,data:JSON.stringify(paymentBody())};
  assert.equal((await run('Read payment verdict', good, paymentPrior))[0].json.paymentVerdict, 'verify_first');
  const wrong = paymentBody(); wrong.result.structuredContent.data.newAccount.iban = 'BE68539007547034';
  for (const response of [{statusCode:403,data:'{"error":{"code":"challenge"}}'}, {statusCode:503,data:'unavailable'}, {error:'timeout'}, {statusCode:200,data:'<html>checkpoint</html>'}, {statusCode:200,data:'{}'}, {statusCode:200,data:JSON.stringify({...paymentBody(),id:'other'})}, {statusCode:200,data:JSON.stringify(wrong)}]) {
    assert.equal((await run('Read payment verdict', response, paymentPrior))[0].json.paymentVerdict, 'unavailable');
  }
});

const reviewBody = () => ({review:{invoiceNumber:'FICTITIOUS-AP-001',readyToSend:true,hasUnknowns:true,checks:['structure','arithmetic','payment_details','peppol'].map(id=>({id,status:'pass',source:'local'})).concat([{id:'supplier_vat',status:'skipped',source:'eu_vies'},{id:'customer_vat',status:'skipped',source:'eu_vies'}]), findings:[],totals:{payableAmount:'121.00'}}});
test('invoice review requires complete local passes and matching invoice/amount; VAT skipped stays unknown', async () => {
  const prior = {'Read payment verdict':{invoice:{invoiceNumber:'FICTITIOUS-AP-001',totalIncludingVat:121}}};
  const good = (await run('Read review verdict', {statusCode:200,data:JSON.stringify(reviewBody())}, prior))[0].json;
  assert.equal(good.reviewUsable, true); assert.equal(good.review.hasUnknowns, true);
  for (const body of [{}, {review:{readyToSend:true}}, {...reviewBody(),review:{...reviewBody().review,checks:[]}}, {...reviewBody(),review:{...reviewBody().review,readyToSend:false}}, {...reviewBody(),review:{...reviewBody().review,invoiceNumber:'other'}}]) assert.equal((await run('Read review verdict', {statusCode:200,data:JSON.stringify(body)}, prior))[0].json.reviewUsable, false);
  assert.equal((await run('Read review verdict', {statusCode:403,data:'challenge'}, prior))[0].json.reviewUsable, false);
});

test('summary preserves unavailable/unknown labels, escapes invoice HTML, and handles optional VAT errors', async () => {
  const base = {invoice:{invoiceNumber:'<img src=x>',iban:'BE71096123456769'},paymentVerdict:'verify_first',reviewUsable:true,review:reviewBody().review};
  const out = (await run('Approval summary', base, {'Read review verdict':base}))[0].json;
  assert.equal(out.checksPermitExport, true);
  assert.match(out.summaryHtml, /verify_first/); assert.match(out.summaryHtml, /skipped/);
  assert.doesNotMatch(out.summaryHtml, /<img/);
  assert.equal((await run('Approval summary', {error:'unauthorized'}, {'Read review verdict':base}))[0].json.checksPermitExport, false);
  const failed = {...base,paymentVerdict:'unavailable'};
  const held = (await run('Approval summary', failed, {'Read review verdict':failed}))[0].json;
  assert.equal(held.checksPermitExport, false); assert.match(held.summaryHtml, /DO NOT PAY/);
});

test('approval gate requires literal true and prior passing checks; timeout/decline/challenge never export', async () => {
  for (const checksPermitExport of [true,false]) for (const approved of [true,false,'true',undefined]) {
    const out = (await run('Approval gate', {data:{approved}}, {'Approval summary':{checksPermitExport}}))[0].json;
    assert.equal(out.exportAllowed, checksPermitExport && approved === true);
  }
});

test('SEPA binary and unposted booking proposal bind approved account and exact amount; bad approval/settings refuse', async () => {
  const mapped = (await run('Map UBL fields',parsed()))[0].json;
  const base = {...mapped,exportAllowed:true,checksPermitExport:true,approval:{approved:true},operator:{debtorName:'Fictional & Buyer',debtorIban:'BE68539007547034',debtorBic:'KREDBEBB',executionDate:'2026-10-15'}};
  const out = (await run('SEPA and booking proposal',base))[0];
  const xml = Buffer.from(out.binary.sepa.data,'base64').toString();
  assert.match(xml,/pain\.001\.001\.03/); assert.match(xml,/<IBAN>BE71096123456769<\/IBAN>/); assert.match(xml,/<InstdAmt Ccy="EUR">121.00<\/InstdAmt>/); assert.match(xml,/Fictional &amp; Buyer/);
  assert.equal(out.json.bookingProposal.posted,false); assert.equal(out.json.bookingProposal.amount,'121.00');
  for (const bad of [{...base,approval:{approved:false}},{...base,checksPermitExport:false},{...base,operator:{...base.operator,debtorIban:''}},{...base,invoice:{...base.invoice,totalIncludingVat:NaN}}]) await assert.rejects(run('SEPA and booking proposal',bad));
});

test('workflow graph cannot reach export without human approval and the true export gate', () => {
  const w=load();
  const incoming=[];
  for(const [from, connections] of Object.entries(w.connections)) for(const [branch, edges] of connections.main.entries()) for(const edge of edges || []) {
    assert.ok(w.nodes.some(n=>n.name===edge.node));
    if(edge.node==='SEPA and booking proposal') incoming.push([from,branch]);
  }
  assert.deepEqual(incoming,[['Export allowed',0]]);
  const reachable=(skip)=>{
    const seen=new Set(), todo=['Invoice email'];
    while(todo.length){const n=todo.pop();if(n===skip||seen.has(n))continue;seen.add(n);for(const edges of w.connections[n]?.main || []) for(const edge of edges || [])todo.push(edge.node);}
    return seen;
  };
  assert.equal(reachable().has('SEPA and booking proposal'),true);
  for(const guard of ['Human approval','Approval gate','Payment change check','Invoice review']) assert.equal(reachable(guard).has('SEPA and booking proposal'),false,guard);
  assert.equal(node('XML to JSON').parameters.options.mergeAttrs,false);
  assert.equal(node('XML to JSON').alwaysOutputData,true);
});
