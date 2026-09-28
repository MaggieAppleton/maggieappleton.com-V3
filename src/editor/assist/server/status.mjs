function availability(ready, reason) {
	return ready ? { available: true } : { available: false, reason };
}

/** Only configuration state crosses to the browser; credentials never do. */
export function assistStatus(config, env = process.env) {
	const judge = availability(Boolean(env.TYPESAFE_API_KEY), "Needs TYPESAFE_API_KEY");
	const providers = {
		anthropic: availability(Boolean(env.ANTHROPIC_API_KEY), "Needs ANTHROPIC_API_KEY"),
		openai: availability(Boolean(env.OPENAI_API_KEY && (env.OPENAI_MODEL || config.providers?.openai?.defaultModel)),
			env.OPENAI_API_KEY ? "Needs OPENAI_MODEL" : "Needs OPENAI_API_KEY"),
		"openai-compatible": availability(Boolean(env.LOCAL_LLM_BASE_URL), "Needs LOCAL_LLM_BASE_URL"),
	};
	const tools = {};
	for (const [id, tool] of Object.entries(config.tools)) {
		const generator = tool.generator?.provider;
		const chatGenerator = tool.chatGenerator?.provider;
		const firstMissing = !judge.available ? judge : generator && !providers[generator]?.available
			? providers[generator] : chatGenerator && !providers[chatGenerator]?.available
				? providers[chatGenerator] : null;
		tools[id] = firstMissing ?? { available: true };
	}
	return { judge, providers, tools,
		config: { tools: Object.fromEntries(Object.entries(config.tools).map(([id, tool]) => [id, {
			enabled: tool.enabled,
			...(tool.thresholds ? { thresholds: tool.thresholds } : {}),
		}])), timing: config.timing } };
}
