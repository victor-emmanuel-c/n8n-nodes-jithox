// Deliberately narrow v1: canonical UBL prefixes, EUR, one credit transfer, no adjustments.
try {
  const root = $input.first().json;
  const one = (obj, key, optional = false) => {
    const a = obj?.[key];
    if (optional && a === undefined) return undefined;
    if (!Array.isArray(a) || a.length !== 1) throw new Error(`Expected exactly one ${key}`);
    return a[0];
  };
  const text = (obj, key, optional = false) => {
    const v = one(obj, key, optional);
    if (v === undefined) return undefined;
    const s = typeof v === 'object' ? v._ : v;
    if (typeof s !== 'string' || !s.trim()) throw new Error(`Missing text: ${key}`);
    return s.trim();
  };
  const number = (obj, key) => {
    const s = text(obj, key);
    if (!/^\d+(\.\d{1,2})?$/.test(s) || Number(s) > 100000000) throw new Error(`Unsupported decimal: ${key}`);
    return Number(s);
  };
  const r = root?.Invoice;
  if (!r || r.$?.xmlns !== 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2' || r.$?.['xmlns:cac'] !== 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2' || r.$?.['xmlns:cbc'] !== 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2') throw new Error('Canonical UBL Invoice namespaces required');
  let accounts = 0;
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    for (const [k, child] of Object.entries(v)) {
      if (/AllowanceCharge|PrepaidPayment|PayeeParty|PaymentTerms|AlternativeCurrency|AccountingCost|InvoicePeriod|BaseQuantity|PayableRoundingAmount|PrepaidAmount/.test(k)) throw new Error(`Unsupported v1 field: ${k}`);
      if (k === 'cac:PayeeFinancialAccount') accounts += child.length;
      if (k === '$' && child.currencyID && child.currencyID !== 'EUR') throw new Error('Mixed currency');
      walk(child);
    }
  };
  walk(r);
  if (accounts !== 1 || text(r, 'cbc:InvoiceTypeCode') !== '380' || text(r, 'cbc:DocumentCurrencyCode') !== 'EUR') throw new Error('Only a EUR invoice with one payee account is supported');
  const party = (key) => {
    const p = one(one(r, key), 'cac:Party');
    const addr = one(p, 'cac:PostalAddress');
    const endpoint = one(p, 'cbc:EndpointID', true);
    if (endpoint !== undefined && !endpoint.$?.schemeID) throw new Error('Peppol endpoint scheme required');
    return { name: text(one(p, 'cac:PartyName'), 'cbc:Name'), countryCode: text(one(addr, 'cac:Country'), 'cbc:IdentificationCode'), vatId: text(one(p, 'cac:PartyTaxScheme'), 'cbc:CompanyID'), street: text(addr, 'cbc:StreetName'), city: text(addr, 'cbc:CityName'), postalZone: text(addr, 'cbc:PostalZone'), endpointId: text(p, 'cbc:EndpointID', true), endpointScheme: endpoint?.$?.schemeID };
  };
  const payment = one(r, 'cac:PaymentMeans');
  if (text(payment, 'cbc:PaymentMeansCode') !== '30') throw new Error('Only credit transfer (30) is supported');
  const iban = text(one(payment, 'cac:PayeeFinancialAccount'), 'cbc:ID').replace(/ /g, '').toUpperCase();
  const monetary = one(r, 'cac:LegalMonetaryTotal');
  const total = number(monetary, 'cbc:TaxInclusiveAmount');
  if (total <= 0 || total !== number(monetary, 'cbc:PayableAmount')) throw new Error('Payable amount must equal positive tax-inclusive total');
  const rawLines = r['cac:InvoiceLine'];
  if (!Array.isArray(rawLines) || !rawLines.length || rawLines.length > 100) throw new Error('Expected 1-100 lines');
  const lines = rawLines.map(l => {
    const item = one(l, 'cac:Item'), tax = one(item, 'cac:ClassifiedTaxCategory');
    const quantity = number(l, 'cbc:InvoicedQuantity'), unitPrice = number(one(l, 'cac:Price'), 'cbc:PriceAmount');
    if (Math.round(quantity * unitPrice * 100) !== Math.round(number(l, 'cbc:LineExtensionAmount') * 100)) throw new Error('Line amount mismatch');
    return { description: text(item, 'cbc:Name'), quantity, unitPrice, vatPercent: number(tax, 'cbc:Percent'), taxCategory: text(tax, 'cbc:ID'), unitCode: one(l, 'cbc:InvoicedQuantity').$?.unitCode || 'EA' };
  });
  const net = Math.round(lines.reduce((a, l) => a + Math.round(l.quantity * l.unitPrice * 100), 0));
  const tax = Math.round(number(one(r, 'cac:TaxTotal'), 'cbc:TaxAmount') * 100);
  if (net !== Math.round(number(monetary, 'cbc:LineExtensionAmount') * 100) || net !== Math.round(number(monetary, 'cbc:TaxExclusiveAmount') * 100) || net + tax !== Math.round(total * 100)) throw new Error('Invoice totals mismatch');
  const invoice = { invoiceNumber: text(r, 'cbc:ID'), issueDate: text(r, 'cbc:IssueDate'), dueDate: text(r, 'cbc:DueDate'), currency: 'EUR', buyerReference: text(r, 'cbc:BuyerReference', true), supplier: party('cac:AccountingSupplierParty'), customer: party('cac:AccountingCustomerParty'), lines, iban, payment: { iban }, totalIncludingVat: total };
  return [{ json: { invoice, supplierKey: invoice.supplier.vatId, inputError: null } }];
} catch (e) {
  return [{ json: { inputError: String(e.message), supplierKey: '__INVALID_INVOICE__' } }];
}
