import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

interface VatRowInput {
	reference?: string;
	vatId: string;
}

export class JithoxVat implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Jithox VAT',
		name: 'jithoxVat',
		icon: { light: 'file:jithox.svg', dark: 'file:jithox.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Check EU VAT numbers against VIES via Jithox',
		defaults: {
			name: 'Jithox VAT',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'jithoxApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Verify VAT IDs',
						value: 'verifyVatIds',
						description:
							'Send up to 20 EU VAT numbers to Jithox, which checks them against VIES. One credit (EUR 0.01) is charged per row VIES answers (valid or invalid); rows VIES could not reach cost nothing.',
						action: 'Verify vat i ds',
					},
				],
				default: 'verifyVatIds',
			},
			{
				displayName: 'Rows',
				name: 'rows',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				placeholder: 'Add VAT number',
				default: {},
				displayOptions: {
					show: {
						operation: ['verifyVatIds'],
					},
				},
				options: [
					{
						name: 'row',
						displayName: 'Row',
						values: [
							{
								displayName: 'VAT ID',
								name: 'vatId',
								type: 'string',
								default: '',
								required: true,
								description:
									'The VAT number with its country prefix, e.g. BE0403170701. Spaces, dots and dashes are fine.',
							},
							{
								displayName: 'Reference',
								name: 'reference',
								type: 'string',
								default: '',
								description: 'Your own label for this row, echoed back (max 80 characters)',
							},
						],
					},
				],
			},
			{
				displayName: 'Requester VAT ID',
				name: 'requesterVatId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['verifyVatIds'],
					},
				},
				description:
					'Optional. Your own EU VAT number. A valid row then carries the European Commission consultation number for that lookup, registered to you. Not a signed receipt.',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['verifyVatIds'],
					},
				},
				description:
					'Optional. 8-100 characters (A-Z a-z 0-9 . _ : -). Re-sending the same rows with the same key is charged once.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;

			if (operation !== 'verifyVatIds') {
				throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
					itemIndex: i,
				});
			}

			const rowsCollection = this.getNodeParameter('rows', i, {}) as {
				row?: VatRowInput[];
			};
			const rows = (rowsCollection.row ?? []).map((row) => {
				const out: { vatId: string; reference?: string } = { vatId: row.vatId };
				if (row.reference) {
					out.reference = row.reference;
				}
				return out;
			});

			if (rows.length === 0) {
				throw new NodeOperationError(this.getNode(), 'Add at least one row with a VAT ID', {
					itemIndex: i,
				});
			}

			const requesterVatId = this.getNodeParameter('requesterVatId', i, '') as string;
			const idempotencyKey = this.getNodeParameter('idempotencyKey', i, '') as string;

			const body: { rows: unknown[]; requesterVatId?: string } = { rows };
			if (requesterVatId) {
				body.requesterVatId = requesterVatId;
			}

			const headers: Record<string, string> = {};
			if (idempotencyKey) {
				headers['x-jithox-idempotency-key'] = idempotencyKey;
			}

			let response: any;
			try {
				response = await this.helpers.httpRequestWithAuthentication.call(this, 'jithoxApi', {
					method: 'POST',
					url: 'https://jithox.com/api/v1/vat/verify',
					headers,
					body,
					json: true,
				});
			} catch (error) {
				throw new NodeApiError(this.getNode(), error as any, {
					itemIndex: i,
					message: 'Jithox VAT verify request failed',
				});
			}

			const outRows = response?.result?.rows ?? [];
			if (outRows.length === 0) {
				returnData.push({
					json: response,
					pairedItem: { item: i },
				});
				continue;
			}

			for (const row of outRows) {
				returnData.push({
					json: {
						...row,
						billing: response.billing,
						pricing: response.pricing,
						consultation: response.consultation,
						source: response.source,
					},
					pairedItem: { item: i },
				});
			}
		}

		return [returnData];
	}
}
