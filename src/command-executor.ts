import { spawn } from 'node:child_process';
import { dangerous_commands, wsl_config } from './constants.js';
import {
	CommandTimeoutError,
	CommandValidationError,
} from './errors.js';
import type { CommandResponse } from './types.js';

export function quote_shell_arg(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escape_regexp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class CommandExecutor {
	private validate_command(command: string): string {
		const validated = command.trim();

		if (!validated) {
			throw new CommandValidationError('Invalid command: empty');
		}

		if (validated.includes('\0')) {
			throw new CommandValidationError(
				'Invalid command: contains null byte',
			);
		}

		return validated;
	}

	private validate_working_dir(
		working_dir?: string,
	): string | undefined {
		if (!working_dir) return undefined;

		const validated = working_dir.replace(/\\/g, '/').trim();

		if (!validated) {
			throw new CommandValidationError('Invalid working directory');
		}

		if (validated.includes('\0')) {
			throw new CommandValidationError(
				'Invalid working directory: contains null byte',
			);
		}

		return validated;
	}

	private validate_timeout(timeout?: number): number | undefined {
		if (!timeout) return undefined;

		if (isNaN(timeout) || timeout < 0) {
			throw new CommandValidationError('Invalid timeout value');
		}

		return timeout;
	}

	public is_dangerous_command(command: string): boolean {
		return dangerous_commands.some((dangerous) => {
			const term = dangerous.toLowerCase();

			if (term.includes(' ') || /[^\w-]/.test(term)) {
				return command.toLowerCase().includes(term);
			}

			return new RegExp(
				`(^|[\\s;&|()])${escape_regexp(term)}(?=$|[\\s;&|()])`,
				'i',
			).test(command);
		});
	}

	public async execute_command(
		command: string,
		working_dir?: string,
		timeout?: number,
	): Promise<CommandResponse> {
		return new Promise((resolve, reject) => {
			const validated_command = this.validate_command(command);
			const validated_dir = this.validate_working_dir(working_dir);
			const validated_timeout = this.validate_timeout(timeout);

			const cd_command = validated_dir
				? `cd -- ${quote_shell_arg(validated_dir)} && `
				: '';
			const full_command = `${cd_command}${validated_command}`;

			const wsl_process = spawn(wsl_config.executable, [
				'--exec',
				wsl_config.shell,
				'-c',
				full_command,
			]);

			let stdout = '';
			let stderr = '';

			wsl_process.stdout.on('data', (data: Buffer) => {
				stdout += data.toString();
			});

			wsl_process.stderr.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			let timeout_id: NodeJS.Timeout | undefined;
			if (validated_timeout) {
				timeout_id = setTimeout(() => {
					wsl_process.kill();
					reject(new CommandTimeoutError(validated_timeout));
				}, validated_timeout);
			}

			wsl_process.on('close', (code: number | null) => {
				if (timeout_id) {
					clearTimeout(timeout_id);
				}
				resolve({
					stdout,
					stderr,
					exit_code: code,
					command: validated_command,
					working_dir: validated_dir,
				});
			});

			wsl_process.on('error', (error: Error) => {
				if (timeout_id) {
					clearTimeout(timeout_id);
				}
				reject(error);
			});
		});
	}
}
