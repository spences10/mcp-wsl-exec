import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export class WslExecutionError extends Error {
	constructor(
		message: string,
		public readonly code: ErrorCode,
		public readonly details?: any,
	) {
		super(message);
		this.name = 'WslExecutionError';
	}
}

export class CommandValidationError extends WslExecutionError {
	constructor(message: string, details?: any) {
		super(message, ErrorCode.InvalidParams, details);
		this.name = 'CommandValidationError';
	}
}

export class CommandTimeoutError extends WslExecutionError {
	constructor(timeout: number) {
		super(
			`Command timed out after ${timeout}ms`,
			ErrorCode.InternalError,
			{ timeout },
		);
		this.name = 'CommandTimeoutError';
	}
}

export class InvalidConfirmationError extends WslExecutionError {
	constructor(confirmation_id: string) {
		super(
			'Invalid or expired confirmation ID',
			ErrorCode.InvalidRequest,
			{ confirmation_id },
		);
		this.name = 'InvalidConfirmationError';
	}
}
