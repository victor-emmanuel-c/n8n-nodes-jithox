try {
  const bytes = await this.helpers.getBinaryDataBuffer(0, $input.first().json.attachmentKey);
  const xml = bytes.toString('utf8');
  if (bytes.length > 262144 || /<!DOCTYPE|<!ENTITY|\u0000|\uFFFD/i.test(xml)) throw new Error('Only UTF-8 UBL without DTD/entities, up to 256 KiB, is supported');
  return [{ json: { xml } }];
} catch (error) {
  return [{ json: { xml: '<Rejected/>', inputError: String(error.message) } }];
}
