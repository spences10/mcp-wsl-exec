export class WslExecutionError extends Error {
	constructor(
		message: string,
		public readonly details?: any,
	) {
		super(message);
		this.name = 'WslExecutionError';
	}
}

export class CommandValidationError extends WslExecutionError {
	constructor(message: string, details?: any) {
		super(message, details);
		this.name = 'CommandValidationError';
	}
}

export class CommandTimeoutError extends WslExecutionError {
	constructor(timeout: number) {
		super(`Command timed out after ${timeout}ms`, { timeout });
		this.name = 'CommandTimeoutError';
	}
}

export class InvalidConfirmationError extends WslExecutionError {
	constructor(confirmation_id: string) {
		super('Invalid or expired confirmation ID', { confirmation_id });
		this.name = 'InvalidConfirmationError';
	}
}
