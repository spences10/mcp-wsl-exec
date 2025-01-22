#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
	readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);
const { name, version } = pkg;

// Define dangerous commands that require confirmation
const dangerous_commands = [
	'rm',
	'rmdir',
	'dd',
	'mkfs',
	'mkswap',
	'fdisk',
	'shutdown',
	'reboot',
	'>', // redirect that could overwrite
	'format',
	'chmod',
	'chown',
];

interface command_response {
	stdout: string;
	stderr: string;
	exit_code: number | null;
	command: string;
	requires_confirmation?: boolean;
}

class wsl_server {
	private server: Server;
	private pending_confirmations: Map<
		string,
		{
			command: string;
			resolve: (value: command_response) => void;
			reject: (reason?: any) => void;
		}
	>;

	constructor() {
		this.server = new Server(
			{ name, version },
			{
				capabilities: {
					tools: {},
				},
			},
		);
		this.pending_confirmations = new Map();
		this.setup_tool_handlers();
	}

	private is_dangerous_command(command: string): boolean {
		return dangerous_commands.some(
			(dangerous) =>
				command.toLowerCase().includes(dangerous.toLowerCase()) ||
				command.match(new RegExp(`\\b${dangerous}\\b`, 'i')),
		);
	}

	private sanitize_command(command: string): string {
		// Basic command sanitization
		return command.replace(/[;&|`$]/g, '');
	}

	private async execute_wsl_command(
		command: string,
		working_dir?: string,
		timeout?: number,
	): Promise<command_response> {
		return new Promise((resolve, reject) => {
			const sanitized_command = this.sanitize_command(command);
			const requires_confirmation =
				this.is_dangerous_command(sanitized_command);

			if (requires_confirmation) {
				// Generate a unique confirmation ID
				const confirmation_id = Math.random()
					.toString(36)
					.substring(7);
				this.pending_confirmations.set(confirmation_id, {
					command: sanitized_command,
					resolve,
					reject,
				});

				// Return early with confirmation request
				resolve({
					stdout: '',
					stderr: `Command "${sanitized_command}" requires confirmation. Use confirm_command with ID: ${confirmation_id}`,
					exit_code: null,
					command: sanitized_command,
					requires_confirmation: true,
				});
				return;
			}

			const cd_command = working_dir ? `cd "${working_dir}" && ` : '';
			const full_command = `${cd_command}${sanitized_command}`;

			const wsl_process = spawn('wsl.exe', [
				'--exec',
				'bash',
				'-c',
				full_command,
			]);

			let stdout = '';
			let stderr = '';

			wsl_process.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			wsl_process.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			let timeout_id: NodeJS.Timeout | undefined;
			if (timeout) {
				timeout_id = setTimeout(() => {
					wsl_process.kill();
					reject(new Error(`Command timed out after ${timeout}ms`));
				}, timeout);
			}

			wsl_process.on('close', (code) => {
				if (timeout_id) {
					clearTimeout(timeout_id);
				}
				resolve({
					stdout,
					stderr,
					exit_code: code,
					command: sanitized_command,
				});
			});

			wsl_process.on('error', (error) => {
				if (timeout_id) {
					clearTimeout(timeout_id);
				}
				reject(error);
			});
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
										text: `Command: ${result.command}\nExit Code: ${result.exit_code}\nOutput:\n${result.stdout}\nErrors:\n${result.stderr}`,
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
								throw new McpError(
									ErrorCode.InvalidRequest,
									'Invalid or expired confirmation ID',
								);
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

							const result = await this.execute_wsl_command(
								pending.command,
							);
							return {
								content: [
									{
										type: 'text',
										text: `Command: ${result.command}\nExit Code: ${result.exit_code}\nOutput:\n${result.stdout}\nErrors:\n${result.stderr}`,
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

const server = new wsl_server();
server.run().catch(console.error);
