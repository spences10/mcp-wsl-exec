#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CommandExecutor } from './command-executor.js';
import { InvalidConfirmationError } from './errors.js';
import { CommandResponse, PendingConfirmation } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
	readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);
const { name, version } = pkg;

class WslServer {
	private server: Server;
	private command_executor: CommandExecutor;
	private pending_confirmations: Map<string, PendingConfirmation>;

	constructor() {
		this.server = new Server(
			{ name, version },
			{
				capabilities: {
					tools: {},
				},
			},
		);
		this.command_executor = new CommandExecutor();
		this.pending_confirmations = new Map();
		this.setup_tool_handlers();
	}

	private format_output(result: CommandResponse): string {
		return [
			`Command: ${result.command}`,
			result.working_dir
				? `Working Directory: ${result.working_dir}`
				: null,
			`Exit Code: ${result.exit_code}`,
			result.stdout.trim()
				? `Output:\n${result.stdout.trim()}`
				: 'No output',
			result.stderr.trim()
				? `Errors:\n${result.stderr.trim()}`
				: 'No errors',
			result.error ? `Error: ${result.error}` : null,
		]
			.filter(Boolean)
			.join('\n');
	}

	private async execute_wsl_command(
		command: string,
		working_dir?: string,
		timeout?: number,
	): Promise<CommandResponse> {
		return new Promise((resolve, reject) => {
			const requires_confirmation =
				this.command_executor.is_dangerous_command(command);

			if (requires_confirmation) {
				// Generate a unique confirmation ID
				const confirmation_id = Math.random()
					.toString(36)
					.substring(7);
				this.pending_confirmations.set(confirmation_id, {
					command,
					working_dir,
					timeout,
					resolve,
					reject,
				});

				// Return early with confirmation request
				resolve({
					stdout: '',
					stderr: `Command "${command}" requires confirmation. Use confirm_command with ID: ${confirmation_id}`,
					exit_code: null,
					command,
					requires_confirmation: true,
				});
				return;
			}

			this.command_executor
				.execute_command(command, working_dir, timeout)
				.then(resolve)
				.catch(reject);
		});
	}

	private setup_tool_handlers() {
		this.server.setRequestHandler(
			ListToolsRequestSchema,
			async () => ({
				tools: [
					{
						name: 'execute_command',
						description: 'Execute a command in WSL',
						inputSchema: {
							type: 'object',
							properties: {
								command: {
									type: 'string',
									description: 'Command to execute',
								},
								working_dir: {
									type: 'string',
									description:
										'Working directory for command execution',
								},
								timeout: {
									type: 'number',
									description: 'Timeout in milliseconds',
								},
							},
							required: ['command'],
						},
					},
					{
						name: 'confirm_command',
						description: 'Confirm execution of a dangerous command',
						inputSchema: {
							type: 'object',
							properties: {
								confirmation_id: {
									type: 'string',
									description:
										'Confirmation ID received from execute_command',
								},
								confirm: {
									type: 'boolean',
									description:
										'Whether to proceed with the command execution',
								},
							},
							required: ['confirmation_id', 'confirm'],
						},
					},
				],
			}),
		);

		this.server.setRequestHandler(
			CallToolRequestSchema,
			async (request) => {
				try {
					switch (request.params.name) {
						case 'execute_command': {
							const { command, working_dir, timeout } = request.params
								.arguments as {
								command: string;
								working_dir?: string;
								timeout?: number;
							};

							const result = await this.execute_wsl_command(
								command,
								working_dir,
								timeout,
							);

							if (result.requires_confirmation) {
								return {
									content: [
										{
											type: 'text',
											text: result.stderr,
										},
									],
								};
							}

							return {
								content: [
									{
										type: 'text',
										text: this.format_output(result),
									},
								],
							};
						}

						case 'confirm_command': {
							const { confirmation_id, confirm } = request.params
								.arguments as {
								confirmation_id: string;
								confirm: boolean;
							};

							const pending =
								this.pending_confirmations.get(confirmation_id);
							if (!pending) {
								throw new InvalidConfirmationError(confirmation_id);
							}

							this.pending_confirmations.delete(confirmation_id);

							if (!confirm) {
								return {
									content: [
										{
											type: 'text',
											text: 'Command execution cancelled.',
										},
									],
								};
							}

							const result = await this.command_executor.execute_command(
								pending.command,
								pending.working_dir,
								pending.timeout,
							);

							return {
								content: [
									{
										type: 'text',
										text: this.format_output(result),
									},
								],
							};
						}

						default:
							throw new McpError(
								ErrorCode.MethodNotFound,
								`Unknown tool: ${request.params.name}`,
							);
					}
				} catch (error) {
					return {
						content: [
							{
								type: 'text',
								text: `Error executing command: ${
									error instanceof Error
										? error.message
										: String(error)
								}`,
							},
						],
						isError: true,
					};
				}
			},
		);
	}

	async run() {
		const transport = new StdioServerTransport();
		await this.server.connect(transport);
		console.error('WSL MCP server running on stdio');
	}
}

const server = new WslServer();
server.run().catch(console.error);
