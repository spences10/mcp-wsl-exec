import { spawn } from 'child_process';
import { dangerous_commands, wsl_config } from './constants.js';
import { CommandValidationError, CommandTimeoutError } from './errors.js';
import { CommandResponse } from './types.js';

export class CommandExecutor {
	private sanitize_command(command: string): string {
		// Enhanced command sanitization
		const sanitized = command
			.replace(/[;&|`$]/g, '') // Remove shell metacharacters
			.replace(/\\/g, '/') // Normalize path separators
			.replace(/\.\./g, '') // Remove parent directory references
			.replace(/~/g, '') // Remove home directory references
			.trim(); // Remove leading/trailing whitespace

		// Check for empty command after sanitization
		if (!sanitized) {
			throw new CommandValidationError(
				'Invalid command: Empty after sanitization',
			);
		}

		return sanitized;
	}

	private validate_working_dir(working_dir?: string): string | undefined {
		if (!working_dir) return undefined;

		// Sanitize and validate working directory
		const sanitized = working_dir
			.replace(/[;&|`$]/g, '')
			.replace(/\\/g, '/')
			.trim();

		if (!sanitized) {
			throw new CommandValidationError('Invalid working directory');
		}

		return sanitized;
	}

	private validate_timeout(timeout?: number): number | undefined {
		if (!timeout) return undefined;

		if (isNaN(timeout) || timeout < 0) {
			throw new CommandValidationError('Invalid timeout value');
		}

		return timeout;
	}

	public is_dangerous_command(command: string): boolean {
		return dangerous_commands.some(
			(dangerous) =>
				command.toLowerCase().includes(dangerous.toLowerCase()) ||
				command.match(new RegExp(`\\b${dangerous}\\b`, 'i')),
		);
	}

	public async execute_command(
		command: string,
		working_dir?: string,
		timeout?: number,
	): Promise<CommandResponse> {
		return new Promise((resolve, reject) => {
			const sanitized_command = this.sanitize_command(command);
			const validated_dir = this.validate_working_dir(working_dir);
			const validated_timeout = this.validate_timeout(timeout);

			const cd_command = validated_dir ? `cd "${validated_dir}" && ` : '';
			const full_command = `${cd_command}${sanitized_command}`;

			const wsl_process = spawn(wsl_config.executable, [
				'--exec',
				wsl_config.shell,
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
			if (validated_timeout) {
				timeout_id = setTimeout(() => {
					wsl_process.kill();
					reject(new CommandTimeoutError(validated_timeout));
				}, validated_timeout);
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
					working_dir: validated_dir,
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
}
