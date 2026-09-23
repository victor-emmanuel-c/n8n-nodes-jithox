// Standalone probe: exercises JithoxVat.execute() against the LIVE jithox.com API
// with a deliberately invalid credential, to prove the 401 path surfaces cleanly.
const { JithoxVat } = require('../dist/nodes/JithoxVat/JithoxVat.node.js');

async function main() {
	const node = new JithoxVat();

	const params = {
		operation: 'verifyVatIds',
		rows: { row: [{ vatId: 'BE0403170701' }] },
		requesterVatId: '',
		idempotencyKey: '',
	};

	const fakeThis = {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name, _i, fallback) => {
			if (name in params) return params[name];
			return fallback;
		},
		getNode: () => ({ name: 'Jithox VAT' }),
		helpers: {
			httpRequestWithAuthentication: {
				call: async function (_ctx, _credType, options) {
					// Mimic real n8n behaviour: inject the (fake) credential header, then
					// perform a genuine HTTPS call against production.
					const https = require('https');
					const url = new URL(options.url);
					const body = JSON.stringify(options.body);
					return new Promise((resolve, reject) => {
						const req = https.request(
							{
								hostname: url.hostname,
								path: url.pathname,
								method: options.method,
								headers: {
									'content-type': 'application/json',
									'content-length': Buffer.byteLength(body),
									authorization: 'Bearer jxc_live_INVALID_PROBE_KEY',
									...options.headers,
								},
							},
							(res) => {
								let data = '';
								res.on('data', (c) => (data += c));
								res.on('end', () => {
									const parsed = JSON.parse(data);
									if (res.statusCode >= 400) {
										const err = new Error(parsed?.error?.message || 'request failed');
										err.httpCode = res.statusCode;
										err.response = { body: parsed };
										err.statusCode = res.statusCode;
										reject(err);
										return;
									}
									resolve(parsed);
								});
							},
						);
						req.on('error', reject);
						req.write(body);
						req.end();
					});
				},
			},
		},
	};

	try {
		const result = await node.execute.call(fakeThis);
		console.log('UNEXPECTED SUCCESS', JSON.stringify(result));
	} catch (err) {
		console.log('Caught error as expected.');
		console.log('error.constructor.name =', err.constructor.name);
		console.log('message =', err.message);
		console.log('description =', err.description);
		console.log('httpCode =', err.httpCode);
		console.log('context =', JSON.stringify(err.context || {}));
	}
}

main();
