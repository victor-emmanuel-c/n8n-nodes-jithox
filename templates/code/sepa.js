const state = $input.first().json;
if (state.exportAllowed !== true || state.checksPermitExport !== true || state.approval?.approved !== true) throw new Error('No approved, checked invoice');
const inv = state.invoice, op = state.operator;
const ibanValid = (s) => {
  if (typeof s !== 'string' || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const digits = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const c of digits) remainder = (remainder * 10 + Number(c)) % 97;
  return remainder === 1;
};
const amount = inv?.totalIncludingVat;
if (!op || !op.debtorName || op.debtorName.length > 70 || !ibanValid(op.debtorIban) || !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(op.debtorBic || '') || !/^\d{4}-\d{2}-\d{2}$/.test(op.executionDate || '') || new Date(op.executionDate).toISOString().slice(0,10) !== op.executionDate) throw new Error('Configure trusted debtor name, IBAN, BIC and execution date');
if (inv.currency !== 'EUR' || !ibanValid(inv.iban) || !Number.isFinite(amount) || amount <= 0 || amount > 100000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) throw new Error('Invalid payment data');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const now = new Date().toISOString(), id = `AP-${$execution.id}`.slice(0,35), sum = amount.toFixed(2);
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn>
<GrpHdr><MsgId>${esc(id)}</MsgId><CreDtTm>${now}</CreDtTm><NbOfTxs>1</NbOfTxs><CtrlSum>${sum}</CtrlSum><InitgPty><Nm>${esc(op.debtorName)}</Nm></InitgPty></GrpHdr>
<PmtInf><PmtInfId>${esc(id)}</PmtInfId><PmtMtd>TRF</PmtMtd><NbOfTxs>1</NbOfTxs><CtrlSum>${sum}</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf><ReqdExctnDt>${op.executionDate}</ReqdExctnDt><Dbtr><Nm>${esc(op.debtorName)}</Nm></Dbtr><DbtrAcct><Id><IBAN>${op.debtorIban}</IBAN></Id></DbtrAcct><DbtrAgt><FinInstnId><BIC>${op.debtorBic}</BIC></FinInstnId></DbtrAgt><ChrgBr>SLEV</ChrgBr>
<CdtTrfTxInf><PmtId><EndToEndId>${esc(id)}</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">${sum}</InstdAmt></Amt><Cdtr><Nm>${esc(inv.supplier.name.slice(0,70))}</Nm></Cdtr><CdtrAcct><Id><IBAN>${inv.iban}</IBAN></Id></CdtrAcct><RmtInf><Ustrd>${esc(inv.invoiceNumber.slice(0,140))}</Ustrd></RmtInf></CdtTrfTxInf>
</PmtInf></CstmrCdtTrfInitn></Document>`;
const bookingProposal = { kind:'accounts_payable_proposal',posted:false,invoiceNumber:inv.invoiceNumber,supplier:inv.supplier,amount:sum,currency:'EUR',payeeIban:inv.iban,lines:inv.lines,approval:state.approval,executionId:$execution.id,ledgerAccount:null,note:'Not posted or paid. Accountant must choose ledger accounts and tax treatment; bank acceptance is not proven.' };
return [{json:{...state,bookingProposal},binary:{sepa:await this.helpers.prepareBinaryData(Buffer.from(xml),`${id}-pain.001.xml`,'application/xml'),booking:await this.helpers.prepareBinaryData(Buffer.from(JSON.stringify(bookingProposal,null,2)),`${id}-booking.json`,'application/json')}}];
