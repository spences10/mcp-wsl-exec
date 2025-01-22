export interface CommandResponse {
	stdout: string;
	stderr: string;
	exit_code: number | null;
	command: string;
	requires_confirmation?: boolean;
	error?: string;
	working_dir?: string;
}

export interface PendingConfirmation {
	command: string;
	working_dir?: string;
	timeout?: number;
	resolve: (value: CommandResponse) => void;
	reject: (reason?: any) => void;
}
