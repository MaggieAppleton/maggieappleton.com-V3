import "dotenv/config";

export const assistConfig = {
	judge: { model: "jev-latest" },
	providers: {
		anthropic: { defaultModel: "claude-sonnet-5" },
		openai: { defaultModel: process.env.OPENAI_MODEL ?? "gpt-6-sol" },
		"openai-compatible": { defaultModel: "llama3.1" },
	},
	tools: {
		"word-finder": { maxShown: 6,
			generator: { provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-6-sol" } },
		roles: { enabled: true, thresholds: { minShown: 0.10 } },
		repetition: { enabled: true, thresholds: { pair: 0.5, minGroup: 3 },
			generator: { provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-6-sol" } },
		checks: {
			enabled: { citation: true, hedging: true, objection: true, cliche: true },
			thresholds: { citation: 0.7, hedgingConfidence: 0.5, objection: 0.85,
				cliche: 0.75, mixedMetaphor: 0.75 },
			generator: { provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-6-sol" },
			chatGenerator: { provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-6-sol" },
		},
		"argument-map": { enabled: false, thresholds: { parent: 0.4, advances: 0.35 } },
		debug: {
			enabled: false,
			thresholds: { minShown: 0.5 },
			generator: { provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-6-sol" },
		},
	},
	timing: { sentenceIdleMs: 1500, documentIdleMs: 8000 },
};
