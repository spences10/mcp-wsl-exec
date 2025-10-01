# mcp-wsl-exec

A Model Context Protocol (MCP) server for **Windows + Claude Desktop users** to interact with Windows Subsystem for Linux (WSL). Provides both read-only information gathering and secure command execution capabilities.

<a href="https://glama.ai/mcp/servers/wv6df94kb8">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/wv6df94kb8/badge" />
</a>

## ⚠️ Important: Who Should Use This?

**✅ You SHOULD use this if:**
- You're using **Claude Desktop on Windows**
- You need to interact with your WSL environment
- You want to provide WSL context to Claude (system info, processes, files, etc.)

**❌ You DON'T need this if:**
- You're using **Claude Code** (it has native bash access)
- You're on Linux/macOS (use native tools instead)
- You only need Windows PowerShell/CMD (use a different MCP server)

## Features

### 📊 Information Gathering (Read-Only)
- 🖥️ Get system information (OS, kernel, hostname)
- 📁 Browse directory contents
- 💾 Check disk usage
- ⚙️ List environment variables
- 🔄 Monitor running processes

### 🔧 Command Execution (With Safety)
- 🔒 Secure command execution in WSL environments
- ⚡ Built-in safety features:
  - Dangerous command detection
  - Command confirmation system
  - Path traversal prevention
  - Command sanitization
- 📁 Working directory support
- ⏱️ Command timeout functionality
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

The server provides 7 MCP tools:

### Information Gathering (Read-Only) 📊

These tools provide context about your WSL environment without making changes:

#### get_system_info

Get system information (OS version, kernel, hostname).

**Parameters:** None

#### get_directory_info

Get directory contents and file information.

**Parameters:**
- `path` (string, optional): Directory path (defaults to current directory)
- `details` (boolean, optional): Show detailed information (permissions, sizes, etc.)

#### get_disk_usage

Get disk space information.

**Parameters:**
- `path` (string, optional): Specific path to check (defaults to all filesystems)

#### get_environment

Get environment variables.

**Parameters:**
- `filter` (string, optional): Filter pattern to search for specific variables

#### list_processes

List running processes.

**Parameters:**
- `filter` (string, optional): Filter by process name

### Command Execution (Potentially Destructive) 🔧

Use these tools when you need to make changes or run custom commands:

#### execute_command

Execute a command in WSL with safety checks and validation.

**Parameters:**
- `command` (string, required): Command to execute
- `working_dir` (string, optional): Working directory for command execution
- `timeout` (number, optional): Timeout in milliseconds

**Note:** Dangerous commands will require confirmation via `confirm_command`.

#### confirm_command

Confirm execution of a dangerous command that was flagged by safety checks.

**Parameters:**
- `confirmation_id` (string, required): Confirmation ID received from execute_command
- `confirm` (boolean, required): Whether to proceed with the command execution

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
