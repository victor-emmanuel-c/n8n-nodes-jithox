module.exports = {
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: ['./tsconfig.json'],
		sourceType: 'module',
		extraFileExtensions: ['.json'],
	},
	ignorePatterns: ['.eslintrc.js', '**/*.js', 'dist/**', 'node_modules/**'],
	overrides: [
		{
			files: ['credentials/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/credentials'],
			rules: {
				// This rule only applies to nodes shipped in n8n's own repo (per its own
				// docs string); it demands documentationUrl be a bare camelCased slug,
				// which conflicts with cred-class-field-documentation-url-not-http-url
				// that (correctly, for a community node) requires a real https:// URL.
				'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
			},
		},
		{
			files: ['nodes/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/nodes'],
		},
	],
};
