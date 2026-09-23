import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class JithoxApi implements ICredentialType {
	name = 'jithoxApi';

	displayName = 'Jithox API';

	icon: Icon = {
		light: 'file:../nodes/JithoxVat/jithox.svg',
		dark: 'file:../nodes/JithoxVat/jithox.dark.svg',
	};

	documentationUrl = 'https://jithox.com/mcp/account';

	properties: INodeProperties[] = [
		{
			displayName: 'Connection Secret',
			name: 'connectionSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'A Jithox connection secret, prefix jxc_live_. Create one at https://jithox.com/mcp/account#connection. Shown once; the same page revokes it.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.connectionSecret}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://jithox.com',
			url: '/api/v1/vat/verify',
			method: 'POST',
			body: {
				rows: [{ vatId: 'BE0403170701' }],
			},
		},
	};
}
