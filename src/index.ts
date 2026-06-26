#!/usr/bin/env node

import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { StdioTransport } from '@tmcp/transport-stdio';
import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import { register_tools } from './server/tools/index.js';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
	readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);
const { name, version } = pkg;

class WslServer {
	private server: McpServer<GenericSchema>;

	constructor() {
		const adapter = new ValibotJsonSchemaAdapter();

		this.server = new McpServer<GenericSchema>(
			{
				name,
				version,
				description:
					'A secure MCP server for executing commands in WSL with built-in safety features',
			},
			{
				adapter,
				capabilities: {
					tools: { listChanged: true },
				},
			},
		);

		register_tools(this.server);

		process.on('SIGINT', async () => {
			process.exit(0);
		});
	}

	async run() {
		const transport = new StdioTransport(this.server);
		transport.listen();
		console.error('WSL MCP server running on stdio');
	}
}

const server = new WslServer();
server.run().catch(console.error);
