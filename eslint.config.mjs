// Same rules as the official n8n scan (`npx @n8n/scan-community-package`, v0.37.0,
// scanner/scanner.mjs buildScanConfig): @n8n/eslint-plugin-community-nodes recommended
// plus the eslint-plugin-n8n-nodes-base community/credentials/nodes rulesets, with the
// scanner's own off-overrides. Keep the plugin versions in package.json pinned to the
// ones the scanner installs, so `npm run lint` fails exactly where the scan would.
import { n8nCommunityNodesPlugin } from '@n8n/eslint-plugin-community-nodes';
import tsParser from '@typescript-eslint/parser';
import n8nNodesPlugin from 'eslint-plugin-n8n-nodes-base';
import { defineConfig } from 'eslint/config';

export default defineConfig(
	{ ignores: ['dist/**', 'node_modules/**', 'package-lock.json'] },
	n8nCommunityNodesPlugin.configs.recommended,
	{
		rules: { 'no-console': 'error' },
	},
	{ plugins: { 'n8n-nodes-base': n8nNodesPlugin } },
	{
		files: ['package.json'],
		rules: { ...n8nNodesPlugin.configs.community.rules },
	},
	{
		files: ['**/credentials/**/*.ts'],
		rules: {
			...n8nNodesPlugin.configs.credentials.rules,
			// Not valid for community nodes (scanner override)
			'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
			// @n8n/community-nodes credential-password-field is more accurate (scanner override)
			'n8n-nodes-base/cred-class-field-type-options-password-missing': 'off',
		},
	},
	{
		files: ['**/nodes/**/*.ts'],
		rules: {
			...n8nNodesPlugin.configs.nodes.rules,
			// Inputs and outputs can be enum instead of string "main" (scanner override)
			'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'off',
			'n8n-nodes-base/node-class-description-outputs-wrong': 'off',
			'n8n-nodes-base/node-param-type-options-max-value-present': 'off',
		},
	},
	{
		files: ['**/*.json'],
		languageOptions: { parser: tsParser },
	},
	{
		files: ['**/*.ts'],
		languageOptions: { parser: tsParser },
	},
);
