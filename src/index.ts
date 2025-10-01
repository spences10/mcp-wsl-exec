#!/usr/bin/env node

import { McpServer } from 'tmcp';
import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { StdioTransport } from '@tmcp/transport-stdio';
import * as v from 'valibot';
import type { GenericSchema } from 'valibot';
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
	private server: McpServer<GenericSchema>;
	private command_executor: CommandExecutor;
	private pending_confirmations: Map<string, PendingConfirmation>;

	constructor() {
		const adapter = new ValibotJsonSchemaAdapter();
		this.server = new McpServer<GenericSchema>(
			{
				name,
				version,
				description: 'A secure MCP server for executing commands in WSL with built-in safety features',
			},
			{
				adapter,
				capabilities: {
					tools: { listChanged: true },
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
		// execute_command tool
		this.server.tool(
			{
				name: 'execute_command',
				description: 'Execute a command in WSL',
				schema: v.object({
					command: v.pipe(
						v.string(),
						v.description('Command to execute'),
					),
					working_dir: v.optional(
						v.pipe(
							v.string(),
							v.description('Working directory'),
						),
					),
					timeout: v.optional(
						v.pipe(
							v.number(),
							v.description('Timeout (ms)'),
						),
					),
				}),
			},
			async ({ command, working_dir, timeout }) => {
				try {
					const result = await this.execute_wsl_command(
						command,
						working_dir,
						timeout,
					);

					if (result.requires_confirmation) {
						return {
							content: [
								{
									type: 'text' as const,
									text: result.stderr,
								},
							],
						};
					}

					return {
						content: [
							{
								type: 'text' as const,
								text: this.format_output(result),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: 'text' as const,
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

		// confirm_command tool
		this.server.tool(
			{
				name: 'confirm_command',
				description: 'Confirm dangerous command execution',
				schema: v.object({
					confirmation_id: v.pipe(
						v.string(),
						v.description('Confirmation ID'),
					),
					confirm: v.pipe(
						v.boolean(),
						v.description('Proceed with execution'),
					),
				}),
			},
			async ({ confirmation_id, confirm }) => {
				try {
					const pending = this.pending_confirmations.get(confirmation_id);
					if (!pending) {
						throw new InvalidConfirmationError(confirmation_id);
					}

					this.pending_confirmations.delete(confirmation_id);

					if (!confirm) {
						return {
							content: [
								{
									type: 'text' as const,
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
								type: 'text' as const,
								text: this.format_output(result),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: 'text' as const,
								text: `Error confirming command: ${
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
		const transport = new StdioTransport(this.server);
		transport.listen();
		console.error('WSL MCP server running on stdio');
	}
}

const server = new WslServer();
server.run().catch(console.error);
