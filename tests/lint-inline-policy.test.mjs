import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cwd = fileURLToPath(new URL('..', import.meta.url));
const eslint = join(dirname(require.resolve('eslint/package.json')), 'bin/eslint.js');
const nodeFile = 'nodes/JithoxVat/JithoxVat.node.ts';
const rule = '@n8n/community-nodes/node-usable-as-tool';

// Lint stdin only: never edit or execute the runtime node for this regression.
function lint(source, options = []) {
  const result = spawnSync(process.execPath, [
    eslint, '--stdin', '--stdin-filename', nodeFile, '--format', 'json', ...options,
  ], { cwd, input: source, encoding: 'utf8', timeout: 60_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  const reports = JSON.parse(result.stdout);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].fatalErrorCount, 0, result.stdout);
  return { status: result.status, report: reports[0] };
}

const errors = ({ report }) => report.messages
  .filter(message => message.severity === 2)
  .map(({ ruleId, messageId }) => ({ ruleId, messageId }));

test('local lint rejects an inline-disabled scanner rule', t => {
  const source = readFileSync(join(cwd, nodeFile), 'utf8');
  const clean = lint(source);
  assert.equal(clean.status, 0);
  assert.deepEqual(clean.report.messages, []);

  assert.match(source, /\busableAsTool: true,/);
  const missingToolFlag = source.replace(/\busableAsTool: true,/, '');
  const expected = [{ ruleId: rule, messageId: 'missingUsableAsTool' }];
  const violation = lint(missingToolFlag);
  assert.equal(violation.status, 1);
  assert.deepEqual(errors(violation), expected);

  assert.match(missingToolFlag, /export class JithoxVat/);
  const fixture = missingToolFlag.replace('export class JithoxVat',
    `// eslint-disable-next-line ${rule}\nexport class JithoxVat`);
  // The scanner uses allowInlineConfig:false; its CLI equivalent is the oracle.
  const scannerPolicy = lint(fixture, ['--no-inline-config']);
  assert.equal(scannerPolicy.status, 1);
  assert.deepEqual(errors(scannerPolicy), expected);

  const local = lint(fixture);
  t.diagnostic(`clean=${clean.status}, violation=${violation.status}, scanner-policy=${scannerPolicy.status}, local-inline=${local.status}`);
  assert.equal(local.status, scannerPolicy.status, 'Inline comments must not silence scanner rules');
  assert.deepEqual(errors(local), expected);
  assert.deepEqual(local.report.suppressedMessages, []);
});
