// For the isolated AP fixture run only, not a general production-data scrubber.
export function sanitizeExecution(execution) {
  const clean = structuredClone(execution);
  delete clean.data.resumeToken;
  if (clean.data.executionData?.runtimeData) delete clean.data.executionData.runtimeData.credentials;
  for (const node of clean.workflowData.nodes) delete node.credentials;
  return clean;
}
