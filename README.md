# mcp-wsl-exec

A Model Context Protocol (MCP) server for executing commands in
Windows Subsystem for Linux (WSL) environments. This server provides
secure command execution with built-in safety features and validation.

## Features

- 🔒 Secure command execution in WSL environments
- ⚡ Built-in safety features:
  - Dangerous command detection
  - Command confirmation system
  - Path traversal prevention
  - Command sanitization
- 📁 Working directory support
- ⏱️ Command timeout functionality
- 🔍 Detailed command output formatting
- ❌ Error handling and validation
- 🛡️ Protection against shell injection

## Configuration

This server requires configuration through your MCP client. Here are
examples for different environments:

### Cline Configuration

Add this to your Cline MCP settings:

```json
{
	"mcpServers": {
		"mcp-wsl-exec": {
			"command": "npx",
			"args": ["-y", "mcp-wsl-exec"]
		}
	}
}
```

### Claude Desktop Configuration

Add this to your Claude Desktop configuration:

```json
{
	"mcpServers": {
		"mcp-wsl-exec": {
			"command": "npx",
			"args": ["-y", "mcp-wsl-exec"]
		}
	}
}
```

## API

The server implements two MCP tools:

### execute_command

Execute a command in WSL with safety checks and validation.

Parameters:

- `command` (string, required): Command to execute
- `working_dir` (string, optional): Working directory for command
  execution
- `timeout` (number, optional): Timeout in milliseconds

### confirm_command

Confirm execution of a dangerous command that was flagged by safety
checks.

Parameters:

- `confirmation_id` (string, required): Confirmation ID received from
  execute_command
- `confirm` (boolean, required): Whether to proceed with the command
  execution

## Safety Features

### Dangerous Command Detection

The server maintains a list of potentially dangerous commands that
require explicit confirmation before execution, including:

- File system operations (rm, rmdir, mv)
- System commands (shutdown, reboot)
- Package management (apt, yum, dnf)
- File redirections (>, >>)
- Permission changes (chmod, chown)
- And more...

### Command Sanitization

All commands are sanitized to prevent:

- Shell metacharacter injection
- Path traversal attempts
- Home directory references
- Dangerous command chaining

## Development

### Setup

1. Clone the repository
2. Install dependencies:

```bash
pnpm install
```

3. Build the project:

```bash
pnpm build
```

4. Run in development mode:

```bash
pnpm dev
```

### Publishing

The project uses changesets for version management. To publish:

1. Create a changeset:

```bash
pnpm changeset
```

2. Version the package:

```bash
pnpm changeset version
```

3. Publish to npm:

```bash
pnpm release
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built on the
  [Model Context Protocol](https://github.com/modelcontextprotocol)
- Designed for secure WSL command execution
