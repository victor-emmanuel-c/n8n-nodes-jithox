const base = $('Bind trusted supplier').first().json;
const response = $input.first().json;
let paymentVerdict = 'unavailable', paymentError = null, payment = null;
try {
  if (response.statusCode !== 200 || response.error) throw new Error('Payment check HTTP failure');
  const rpc = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  if (rpc?.jsonrpc !== '2.0' || rpc.id !== 'payment-change' || rpc.error || rpc.result?.isError !== false) throw new Error('No valid JSON-RPC verdict');
  const content = rpc.result.structuredContent;
  if (content?.kind !== 'payment_change_check' || !['no_change', 'verify_first', 'stop', 'invalid_new_account'].includes(content.data?.verdict)) throw new Error('Unknown payment verdict');
  payment = content.data;
  if (['no_change', 'verify_first'].includes(payment.verdict)) {
    const clean = s => typeof s === 'string' ? s.replace(/ /g, '') : '';
    if (payment.newAccount?.status !== 'valid' || clean(payment.newAccount.iban) !== base.invoice?.iban || payment.accountOnFile?.status !== 'valid' || clean(payment.accountOnFile.iban) !== base.ibanOnFile) throw new Error('Account binding mismatch');
  }
  paymentVerdict = payment.verdict;
} catch (error) { paymentError = String(error.message); }
return [{ json: { ...base, paymentVerdict, paymentError, payment, paymentResponse: response } }];
