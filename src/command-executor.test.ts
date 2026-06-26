import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandExecutor } from './command-executor.js';
import { CommandValidationError } from './errors.js';

vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
}));

const mock_spawn = vi.mocked(spawn);

function mock_process({
	stdout = 'ok\n',
	stderr = '',
	code = 0,
}: {
	stdout?: string;
	stderr?: string;
	code?: number;
}) {
	const proc = new EventEmitter() as EventEmitter & {
		stdout: EventEmitter;
		stderr: EventEmitter;
		kill: ReturnType<typeof vi.fn>;
	};
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.kill = vi.fn();

	mock_spawn.mockReturnValue(proc as never);

	queueMicrotask(() => {
		if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
		if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
		proc.emit('close', code);
	});

	return proc;
}

describe('CommandExecutor', () => {
	beforeEach(() => {
		mock_spawn.mockReset();
	});
	it('executes sanitized commands through WSL', async () => {
		mock_process({ stdout: 'hello\n' });

		const result = await new CommandExecutor().execute_command(
			'echo hello; rm -rf /',
			'/tmp/project',
		);

		expect(mock_spawn).toHaveBeenCalledWith('wsl.exe', [
			'--exec',
			'bash',
			'-c',
			"cd -- '/tmp/project' && echo hello; rm -rf /",
		]);
		expect(result).toEqual(
			expect.objectContaining({
				stdout: 'hello\n',
				exit_code: 0,
				command: 'echo hello; rm -rf /',
				working_dir: '/tmp/project',
			}),
		);
	});

	it('rejects empty commands', async () => {
		await expect(
			new CommandExecutor().execute_command('   '),
		).rejects.toBeInstanceOf(CommandValidationError);
	});

	it('detects dangerous commands before sanitization', () => {
		const executor = new CommandExecutor();

		expect(executor.is_dangerous_command('sudo rm -rf /tmp/x')).toBe(
			true,
		);
		expect(executor.is_dangerous_command('echo safe')).toBe(false);
	});
});
