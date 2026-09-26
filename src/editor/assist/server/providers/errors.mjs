export class ProviderUnavailableError extends Error {
	constructor(provider) {
		super(`${provider} is not configured`);
		this.name = "ProviderUnavailableError";
		this.status = 503;
		this.code = "provider_unavailable";
		this.provider = provider;
	}
}

export function unavailable(provider) {
	throw new ProviderUnavailableError(provider);
}
