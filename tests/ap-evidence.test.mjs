import assert from 'node:assert/strict';
import test from 'node:test';

test('execution evidence removes local resume capability and credential references without changing verdicts', async () => {
  const { sanitizeExecution } = await import('../scripts/sanitize-ap-execution.mjs');
  const original = {
    status: 'success',
    data: {resumeToken:'test-only-capability',executionData:{runtimeData:{credentials:'test-only-reference'}},resultData:{runData:{payment:{statusCode:200,data:'real response preserved'}}}},
    workflowData:{nodes:[{name:'Human approval',credentials:{smtp:{id:'test-only-id'}}}]},
  };
  const clean = sanitizeExecution(original);
  assert.equal(clean.data.resumeToken, undefined);
  assert.equal(clean.data.executionData.runtimeData.credentials, undefined);
  assert.equal(clean.workflowData.nodes[0].credentials, undefined);
  assert.deepEqual(clean.data.resultData, original.data.resultData);
  assert.equal(clean.status, 'success');
  assert.equal(original.data.resumeToken, 'test-only-capability');
});
