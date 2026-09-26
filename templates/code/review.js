const base = $('Read payment verdict').first().json;
const response = $input.first().json;
let review = null, reviewUsable = false, reviewError = null;
try {
  if (response.statusCode !== 200 || response.error) throw new Error('Invoice review HTTP failure');
  const body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  review = body?.review;
  if (!review || review.invoiceNumber !== base.invoice?.invoiceNumber || review.readyToSend !== true || typeof review.hasUnknowns !== 'boolean' || !Array.isArray(review.checks) || !Array.isArray(review.findings)) throw new Error('Missing, blocked or mismatched review');
  for (const id of ['structure', 'arithmetic', 'payment_details', 'peppol']) {
    const checks = review.checks.filter(c => c.id === id);
    if (checks.length !== 1 || checks[0].status !== 'pass' || checks[0].source !== 'local') throw new Error(`No passing local check: ${id}`);
  }
  if (review.findings.some(f => f.severity === 'blocker') || review.checks.some(c => c.status === 'fail') || Number(review.totals?.payableAmount) !== base.invoice.totalIncludingVat) throw new Error('Blocking finding or amount mismatch');
  reviewUsable = true;
} catch (error) { reviewError = String(error.message); }
return [{ json: { ...base, review, reviewUsable, reviewError, reviewResponse: response } }];
