// Define dangerous commands that require confirmation
export const dangerous_commands = [
	'rm',
	'rmdir',
	'dd',
	'mkfs',
	'mkswap',
	'fdisk',
	'shutdown',
	'reboot',
	'>', // redirect that could overwrite
	'>>', // append redirect that could modify files
	'format',
	'chmod',
	'chown',
	'sudo',
	'su',
	'passwd',
	'mv', // moving files can be dangerous
	'find -delete',
	'truncate',
	'shred',
	'kill',
	'pkill',
	'service',
	'systemctl',
	'mount',
	'umount',
	'apt',
	'apt-get',
	'dpkg',
	'yum',
	'dnf',
	'pacman',
] as const;

// WSL process configuration
export const wsl_config = {
	executable: 'wsl.exe',
	shell: 'bash',
	default_timeout: 30000, // 30 seconds
} as const;
