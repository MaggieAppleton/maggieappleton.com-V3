import "dotenv/config";

export const assistConfig = {
	judge: { model: "jev-latest" },
	providers: {
		anthropic: { defaultModel: "claude-sonnet-5" },
		openai: { defaultModel: process.env.OPENAI_MODEL ?? "gpt-6-sol" },
		"openai-compatible": { defaultModel: "llama3.1" },
	},
	tools: {
		roles: { enabled: true, thresholds: { minShown: 0.10 } },
		repetition: { enabled: true, thresholds: { pair: 0.5, minGroup: 3 },
			generator: { provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-6-sol" } },
		debug: {
			enabled: false,
			thresholds: { minShown: 0.5 },
			generator: { provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-6-sol" },
		},
	},
	timing: { sentenceIdleMs: 1500, documentIdleMs: 8000 },
};
