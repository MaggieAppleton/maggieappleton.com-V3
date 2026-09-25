export class EditorServiceError extends Error {
	constructor(status, code, message, details) {
		super(message);
		this.name = "EditorServiceError";
		this.status = status;
		this.code = code;
		if (details) this.details = details;
	}
}
