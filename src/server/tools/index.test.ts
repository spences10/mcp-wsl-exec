import * as v from 'valibot';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandExecutor } from '../../command-executor.js';
import { register_tools } from './index.js';

interface RegisteredTool {
	definition: {
		name: string;
		schema?: v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;
	};
	handler: (args: any) => Promise<any>;
}

const create_mock_server = () => {
	const tools: RegisteredTool[] = [];
	return {
		tools,
		server: {
			tool: (
				definition: RegisteredTool['definition'],
				handler: RegisteredTool['handler'],
			) => {
				tools.push({ definition, handler });
			},
		},
	};
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('register_tools', () => {
	it('registers the public WSL tool contract', () => {
		const { tools, server } = create_mock_server();

		register_tools(server as any);

		expect(tools.map((tool) => tool.definition.name)).toEqual([
			'get_system_info',
			'get_environment',
			'list_processes',
			'get_disk_usage',
			'get_directory_info',
			'execute_command',
			'confirm_command',
		]);
	});

	it('validates execute_command payloads at the registered schema', () => {
		const { tools, server } = create_mock_server();
		register_tools(server as any);

		const schema = tools.find(
			(tool) => tool.definition.name === 'execute_command',
		)!.definition.schema!;

		expect(
			v.safeParse(schema, {
				command: 'pwd',
				working_dir: '/tmp',
				timeout: 1000,
			}).success,
		).toBe(true);
		expect(v.safeParse(schema, {}).success).toBe(false);
		expect(
			v.safeParse(schema, { command: 'pwd', timeout: '1000' })
				.success,
		).toBe(false);
	});

	it('formats read-only tool responses', async () => {
		vi.spyOn(
			CommandExecutor.prototype,
			'execute_command',
		).mockResolvedValue({
			stdout: 'Linux test\n',
			stderr: '',
			exit_code: 0,
			command: 'uname -a',
		});
		const { tools, server } = create_mock_server();
		register_tools(server as any);

		const tool = tools.find(
			(entry) => entry.definition.name === 'get_system_info',
		)!;
		const response = await tool.handler({});

		expect(response.content[0].text).toContain('Output:\nLinux test');
		expect(response.isError).toBeUndefined();
	});

	it('requires confirmation for dangerous command execution', async () => {
		vi.spyOn(
			CommandExecutor.prototype,
			'is_dangerous_command',
		).mockReturnValue(true);
		const execute_spy = vi
			.spyOn(CommandExecutor.prototype, 'execute_command')
			.mockResolvedValue({
				stdout: 'done\n',
				stderr: '',
				exit_code: 0,
				command: 'sudo reboot',
			});
		const { tools, server } = create_mock_server();
		register_tools(server as any);

		const execute = tools.find(
			(entry) => entry.definition.name === 'execute_command',
		)!;
		const confirm = tools.find(
			(entry) => entry.definition.name === 'confirm_command',
		)!;

		const pending = await execute.handler({ command: 'sudo reboot' });
		const confirmation_id =
			pending.content[0].text.match(/ID: (\w+)/)![1];

		expect(execute_spy).not.toHaveBeenCalled();

		const response = await confirm.handler({
			confirmation_id,
			confirm: true,
		});

		expect(execute_spy).toHaveBeenCalledWith(
			'sudo reboot',
			undefined,
			undefined,
		);
		expect(response.content[0].text).toContain('Output:\ndone');
	});
});
