const base = $('Approval summary').first().json;
const approval = $input.first().json.data;
const exportAllowed = approval?.approved === true && base.checksPermitExport === true;
return [{json:{...base,approval:approval || {approved:false,reason:'No response / expired'},exportAllowed,outcome:exportAllowed ? 'approved_proposal' : 'rejected_or_held'}}];
