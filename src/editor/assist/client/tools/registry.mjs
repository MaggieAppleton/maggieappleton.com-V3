const clientTools = new Map();

export function registerClientTool(tool) {
	if (!tool?.id || !tool.label || !tool.group
		|| !["sentence", "document"].includes(tool.level)
		|| (tool.markerPresenter !== undefined && typeof tool.markerPresenter !== "function")) {
		throw new TypeError("A client tool needs an id, label, group, level, and optional marker presenter");
	}
	clientTools.set(tool.id, tool);
	return () => {
		if (clientTools.get(tool.id) === tool) clientTools.delete(tool.id);
	};
}

export function getClientTools() {
	return [...clientTools.values()];
}

export function getClientTool(id) {
	return clientTools.get(id);
}
