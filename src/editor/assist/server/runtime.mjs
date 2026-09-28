import { TypeSafeClient } from "@typesafe-ai/sdk";
import { getEditorServices } from "../../server/runtime.mjs";
import { assistConfig } from "../config.mjs";
import { createGenerateService } from "./generate.mjs";
import { createJudge } from "./judge.mjs";
import { createProvider } from "./providers/index.mjs";
import { createSidecarStore } from "./sidecar-store.mjs";

let servicesPromise;

export async function getAssistServices(loadEntries) {
	if (!servicesPromise) {
		servicesPromise = (async () => {
			const { index } = await getEditorServices(loadEntries);
			const sidecars = createSidecarStore({ index });
			const jev = process.env.TYPESAFE_API_KEY
				? new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY }) : null;
			const judge = jev ? createJudge({ jev, sidecars, config: assistConfig }) : null;
			const generator = createGenerateService({ config: assistConfig, createProvider });
			return { index, sidecars, judge, generator };
		})();
		servicesPromise.catch(() => { servicesPromise = undefined; });
	}
	return servicesPromise;
}
