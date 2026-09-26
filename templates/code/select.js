return $input.all().map((item, i) => {
  const xml = Object.entries(item.binary || {}).filter(([, b]) => /\.xml$/i.test(b.fileName || ''));
  return { json: { hasUbl: xml.length === 1, attachmentKey: xml.length === 1 ? xml[0][0] : null,
    manualReason: xml.length === 1 ? null : 'Provide exactly one UBL XML attachment. PDF extraction and multiple invoices are not supported.' },
    binary: item.binary, pairedItem: { item: i } };
});
