import type { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { CommandExecutor } from '../../command-executor.js';
import { InvalidConfirmationError } from '../../errors.js';
import type {
	CommandResponse,
	PendingConfirmation,
} from '../../types.js';

function format_output(result: CommandResponse): string {
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

function error_response(message: string) {
	return {
		content: [{ type: 'text' as const, text: message }],
		isError: true,
	};
}

export function register_tools(server: McpServer<GenericSchema>) {
	const command_executor = new CommandExecutor();
	const pending_confirmations = new Map<
		string,
		PendingConfirmation
	>();

	const execute_wsl_command = async (
		command: string,
		working_dir?: string,
		timeout?: number,
	): Promise<CommandResponse> => {
		return new Promise((resolve, reject) => {
			const requires_confirmation =
				command_executor.is_dangerous_command(command);

			if (requires_confirmation) {
				const confirmation_id = Math.random()
					.toString(36)
					.substring(7);
				pending_confirmations.set(confirmation_id, {
					command,
					working_dir,
					timeout,
					resolve,
					reject,
				});

				resolve({
					stdout: '',
					stderr: `Command "${command}" requires confirmation. Use confirm_command with ID: ${confirmation_id}`,
					exit_code: null,
					command,
					requires_confirmation: true,
				});
				return;
			}

			command_executor
				.execute_command(command, working_dir, timeout)
				.then(resolve)
				.catch(reject);
		});
	};

	server.tool(
		{
			name: 'get_system_info',
			description: 'Get WSL system information',
			annotations: { readOnlyHint: true },
		},
		async () => {
			try {
				const result = await command_executor.execute_command(
					'uname -a && lsb_release -a 2>/dev/null || cat /etc/os-release',
				);
				return {
					content: [
						{ type: 'text' as const, text: format_output(result) },
					],
				};
			} catch (error) {
				return error_response(
					`Error: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	);

	server.tool(
		{
			name: 'get_environment',
			description: 'Get WSL environment variables',
			schema: v.object({
				filter: v.optional(
					v.pipe(v.string(), v.description('Filter pattern (grep)')),
				),
			}),
			annotations: { readOnlyHint: true },
		},
		async ({ filter }) => {
			try {
				const cmd = filter ? `env | grep -i "${filter}"` : 'env';
				const result = await command_executor.execute_command(cmd);
				return {
					content: [
						{ type: 'text' as const, text: format_output(result) },
					],
				};
			} catch (error) {
				return error_response(
					`Error: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	);

	server.tool(
		{
			name: 'list_processes',
			description: 'List running processes in WSL',
			schema: v.object({
				filter: v.optional(
					v.pipe(v.string(), v.description('Filter by name')),
				),
			}),
			annotations: { readOnlyHint: true },
		},
		async ({ filter }) => {
			try {
				const cmd = filter
					? `ps aux | grep -i "${filter}" | grep -v grep`
					: 'ps aux';
				const result = await command_executor.execute_command(cmd);
				return {
					content: [
						{ type: 'text' as const, text: format_output(result) },
					],
				};
			} catch (error) {
				return error_response(
					`Error: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	);

	server.tool(
		{
			name: 'get_disk_usage',
			description: 'Get disk space information',
			schema: v.object({
				path: v.optional(
					v.pipe(v.string(), v.description('Path to check')),
				),
			}),
			annotations: { readOnlyHint: true },
		},
		async ({ path }) => {
			try {
				const cmd = path ? `df -h "${path}"` : 'df -h';
				const result = await command_executor.execute_command(cmd);
				return {
					content: [
						{ type: 'text' as const, text: format_output(result) },
					],
				};
			} catch (error) {
				return error_response(
					`Error: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	);

	server.tool(
		{
			name: 'get_directory_info',
			description: 'Get directory contents and info',
			schema: v.object({
				path: v.optional(
					v.pipe(v.string(), v.description('Directory path')),
				),
				details: v.optional(
					v.pipe(v.boolean(), v.description('Show detailed info')),
				),
			}),
			annotations: { readOnlyHint: true },
		},
		async ({ path, details }) => {
			try {
				const dir = path || '.';
				const cmd = details ? `ls -lah "${dir}"` : `ls -A "${dir}"`;
				const result = await command_executor.execute_command(cmd);
				return {
					content: [
						{ type: 'text' as const, text: format_output(result) },
					],
				};
			} catch (error) {
				return error_response(
					`Error: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	);

	server.tool(
		{
			name: 'execute_command',
			description:
				'Execute a command in WSL (use read-only tools when possible)',
			schema: v.object({
				command: v.pipe(
					v.string(),
					v.description('Command to execute'),
				),
				working_dir: v.optional(
					v.pipe(v.string(), v.description('Working directory')),
				),
				timeout: v.optional(
					v.pipe(v.number(), v.description('Timeout (ms)')),
				),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true },
		},
		async ({ command, working_dir, timeout }) => {
			try {
				const result = await execute_wsl_command(
					command,
					working_dir,
					timeout,
				);
				return {
					content: [
						{
							type: 'text' as const,
							text: result.requires_confirmation
								? result.stderr
								: format_output(result),
						},
					],
				};
			} catch (error) {
				return error_response(
					`Error executing command: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		},
	);

	server.tool(
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
			annotations: { readOnlyHint: false, destructiveHint: true },
		},
		async ({ confirmation_id, confirm }) => {
			try {
				const pending = pending_confirmations.get(confirmation_id);
				if (!pending)
					throw new InvalidConfirmationError(confirmation_id);

				pending_confirmations.delete(confirmation_id);

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

				const result = await command_executor.execute_command(
					pending.command,
					pending.working_dir,
					pending.timeout,
				);
				return {
					content: [
						{ type: 'text' as const, text: format_output(result) },
					],
				};
			} catch (error) {
				return error_response(
					`Error confirming command: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		},
	);
}
