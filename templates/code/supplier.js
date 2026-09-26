const base = $('Operator settings').first().json;
const rows = $input.all().map(i => i.json);
const row = rows[0];
const valid = rows.length === 1 && row.supplierKey === base.supplierKey && typeof row.ibanOnFile === 'string' && /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(row.ibanOnFile);
return [{ json: { ...base, ibanOnFile: valid ? row.ibanOnFile : '', supplierError: valid ? null : 'Missing, ambiguous or invalid trusted supplier record; do not pay.' } }];
