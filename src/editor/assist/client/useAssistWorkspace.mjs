import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSourceDocument } from "../../source/document.mjs";
import { createAssistPlugin } from "./assist-plugin.mjs";
import { createAssistTransport } from "./assist-transport.mjs";
import { createAssistController } from "./assist-controller.mjs";
import { createChatSessionStore } from "./popover/chat-session.mjs";
import { roleHoverRows } from "./popover/RoleHover.mjs";
import { enabledChecks } from "./tools/checks.mjs";
import { getDrawerViews } from "./Drawer.mjs";
import { AssistSurface } from "./AssistSurface.mjs";

const TOOL_STORAGE_KEY = "writing-assist:tools";

function savedTools(config) {
	const defaults = Object.fromEntries(Object.entries(config.tools).map(([id, tool]) => [id,
		id === "checks" ? { ...(tool.enabled ?? {}) } : Boolean(tool.enabled)]));
	try {
		const stored = JSON.parse(localStorage.getItem(TOOL_STORAGE_KEY) ?? "null");
		if (!stored || typeof stored !== "object") return defaults;
		return Object.fromEntries(Object.keys(defaults).map((id) => [id,
			id === "checks" ? Object.fromEntries(Object.keys(defaults.checks).map((key) => [key,
				Boolean(config.tools.checks.enabled[key] && (stored.checks?.[key] ?? defaults.checks[key]))]))
				: Boolean(config.tools[id].enabled && (stored[id] ?? defaults[id]))]));
	} catch { return defaults; }
}

/** Own Writing Assist state and requests outside the core editor session. */
export function useAssistWorkspace({ article, boot, adapterKey }) {
	const [lexicalEditor, setLexicalEditor] = useState(null);
	const [assistStatus, setAssistStatus] = useState(null);
	const [assistController, setAssistController] = useState(null);
	const [enabledTools, setEnabledTools] = useState({});
	const enabledToolsRef = useRef({});
	const [assistOpen, setAssistOpen] = useState(false);
	const [mapOpen, setMapOpen] = useState(false);
	const [mapAnnotation, setMapAnnotation] = useState(null);
	const [mapError, setMapError] = useState(null);
	const [hover, setHover] = useState(null);
	const [pinned, setPinned] = useState(null);
	const chatSessions = useMemo(() => createChatSessionStore(), []);
	useEffect(() => () => chatSessions.dispose(), [chatSessions]);
	const openWordFinder = useCallback((selection) => { setHover(null); setPinned({ tool: "word-finder", selection }); }, []);
	const closeWordFinder = useCallback(() => setPinned(null), []);
	const [checkGenerated, setCheckGenerated] = useState({});
	const checkCache = useRef(new Map());
	const checkPending = useRef(new Map());
	const [citationData, setCitationData] = useState({});
	const citationPending = useRef(new Set());
	const citationSearchPending = useRef(new Set());
	const [roleAnnouncement, setRoleAnnouncement] = useState("");
	const assistPlugin = useMemo(() => createAssistPlugin(setLexicalEditor), []);
	const assistTransport = useMemo(() => createAssistTransport({ boot }), [boot]);
	const title = useMemo(() => createSourceDocument(boot.document.source).metadata.title ?? "Untitled", [boot]);
	useEffect(() => {
		let active = true;
		void assistTransport.status().then((status) => {
			if (!active) return;
			setAssistStatus(status);
			const saved = savedTools(status.config);
			enabledToolsRef.current = saved;
			setEnabledTools(saved);
		}, () => {});
		return () => { active = false; };
	}, [assistTransport]);
	useEffect(() => {
		if (!lexicalEditor || !assistStatus) return undefined;
		let active = true;
		let controller;
		void assistTransport.getSidecar().then(({ dismissals }) => {
			if (!active) return;
			controller = createAssistController({
				editor: lexicalEditor, wrapper: article, transport: assistTransport,
				documentId: boot.documentId, pathname: boot.document.previewUrl,
				title, config: assistStatus.config,
				enabledTools: Object.fromEntries(Object.entries(enabledToolsRef.current).map(([id, enabled]) => [id,
					id === "checks"
						? enabledChecks(enabled, assistStatus.tools.checks?.available)
						: Boolean(enabled && assistStatus.tools[id]?.available),
				])), dismissals,
				onToolResult({ annotations, meta, mapFailed }) {
					if (!meta.tools.includes("argument-map")) return;
					const map = annotations.some((annotation) => annotation.tool === "argument-map" && annotation.kind === "map");
					if (map) setMapError(null);
					else if (mapFailed) setMapError(meta.errors.find((error) => !error.tool || error.tool === "argument-map")?.message ?? "Argument map is unavailable.");
				},
				onHover: (next) => setHover((previous) => next ?? (previous ? { ...previous, active: false } : null)),
				onPin: (next) => { setHover(null); setPinned(next); },
			});
			setAssistController(controller);
		}, () => {});
		return () => {
			active = false;
			controller?.destroy();
			setAssistController(null);
			setHover(null);
			setPinned(null);
		};
	}, [lexicalEditor, assistStatus, assistTransport, adapterKey, article, boot, title]);
	useEffect(() => assistController?.store.subscribe((annotations) => {
		setHover((current) => {
			if (!current) return null;
			const live = annotations.find((item) => item.id === current.annotation.id);
			return !live ? null : live === current.annotation ? current : { ...current, annotation: live };
		});
		setPinned((current) => {
			if (!current) return null;
			if (!current.annotation) return current;
			const live = annotations.find((item) => item.id === current.annotation.id);
			return !live ? null : live === current.annotation ? current : { ...current, annotation: live };
		});
	}), [assistController]);
	useEffect(() => {
		const annotation = hover?.annotation ?? pinned?.annotation;
		if (!annotation || annotation.tool !== "checks" || annotation.kind === "citation") return undefined;
		const key = `${annotation.id}:${annotation.unitHash}`;
		const acceptGenerated = (generated) => {
			const phraseAccepted = annotation.kind !== "cliche" || Boolean(assistController?.setClichePhrase?.(annotation, generated.phrase));
			const checked = annotation.kind === "cliche" ? { ...generated, phraseAccepted } : generated;
			checkCache.current.set(key, checked);
			setCheckGenerated((current) => current[key] === checked ? current : { ...current, [key]: checked });
			if (annotation.kind === "cliche" && phraseAccepted) {
				const current = assistController.getAnnotation(annotation.id);
				if (current) setPinned((open) => open?.annotation?.id === annotation.id
					&& open.annotation.target?.type !== "span" ? { ...open, annotation: current } : open);
			}
		};
		const cached = checkCache.current.get(key);
		if (cached) { acceptGenerated(cached); return undefined; }
		if (checkPending.current.has(key)) return undefined;
		const match = assistController?.getSentence(annotation.target?.sentenceId);
		const paragraph = annotation.target?.type === "block" ? assistController?.model.getSnapshot().blocks
			.find((block) => block.id === annotation.target.blockId)?.sentences.map((sentence) => sentence.text).join(" ") : null;
		const prompt = paragraph ? `Paragraph: ${paragraph}` : `Sentence: ${match?.sentence.text ?? ""}`;
		const direction = annotation.kind === "hedging" ? `\nDirection: ${annotation.data?.direction ?? "unknown"}.` : "";
		const pending = assistTransport.generate({ tool: "checks", purpose: annotation.kind, json: true,
			messages: [{ role: "user", content: `${prompt}${direction}\nReturn the requested check data.` }] });
		checkPending.current.set(key, pending);
		void pending.then(({ json: generated }) => {
			if (generated) acceptGenerated(generated);
			else setCheckGenerated((current) => ({ ...current, [key]: { error: true } }));
		}, () => setCheckGenerated((current) => ({ ...current, [key]: { error: true } })))
			.finally(() => checkPending.current.delete(key));
		return undefined;
	}, [hover, pinned, assistController, assistTransport]);
	useEffect(() => {
		const annotation = pinned?.annotation;
		if (annotation?.tool !== "checks" || annotation.kind !== "citation" || !assistController) return;
		const key = `${annotation.id}:${annotation.unitHash}`;
		if (citationData[key] || citationPending.current.has(key)) return;
		const sentence = assistController.getSentence(annotation.target?.sentenceId)?.sentence.text;
		if (!sentence) return;
		citationPending.current.add(key);
		setCitationData((current) => ({ ...current, [key]: { status: "loading", sentence, claims: [], results: {} } }));
		void assistTransport.extractCitation(sentence).then(({ claims }) => {
			setCitationData((current) => ({ ...current, [key]: {
				...current[key], status: "ready", claims: Array.isArray(claims) ? claims : [],
			} }));
		}, () => setCitationData((current) => ({ ...current, [key]: {
			...current[key], status: "error",
		} }))).finally(() => citationPending.current.delete(key));
	}, [pinned, assistController, assistTransport, citationData]);
	const retryCitationExtraction = () => {
		const annotation = pinned?.annotation;
		if (annotation?.tool !== "checks" || annotation.kind !== "citation") return;
		const key = `${annotation.id}:${annotation.unitHash}`;
		setCitationData((current) => {
			if (current[key]?.status !== "error") return current;
			const next = { ...current };
			delete next[key];
			return next;
		});
	};
	const findCitationSources = (claim) => {
		const annotation = pinned?.annotation;
		if (annotation?.tool !== "checks" || annotation.kind !== "citation") return;
		const key = `${annotation.id}:${annotation.unitHash}`;
		const claimKey = `${claim.start}:${claim.end}`;
		const requestKey = `${key}:${claimKey}`;
		if (citationSearchPending.current.has(requestKey)) return;
		const saved = citationData[key];
		if (!saved?.claims?.some((item) => item.start === claim.start && item.end === claim.end && item.text === claim.text)) return;
		if (assistController?.getSentence(annotation.target.sentenceId)?.sentence.text !== saved.sentence) {
			setCitationData((current) => ({ ...current, [key]: { ...current[key],
				notice: "The sentence changed. Search again before inserting a citation.", noticeClaimKey: claimKey } }));
			return;
		}
		citationSearchPending.current.add(requestKey);
		setCitationData((current) => ({ ...current, [key]: { ...current[key], notice: null, noticeClaimKey: null,
			results: { ...current[key].results, [claimKey]: { status: "loading", sources: [] } },
		} }));
		void assistTransport.findCitationSources(claim.text, claim.sourceType).then(({ sources }) => {
			setCitationData((current) => ({ ...current, [key]: { ...current[key],
				results: { ...current[key].results, [claimKey]: { status: "ready", sources: Array.isArray(sources) ? sources : [] } },
			} }));
		}, () => setCitationData((current) => ({ ...current, [key]: { ...current[key],
			results: { ...current[key].results, [claimKey]: { status: "error", sources: [] } },
		} }))).finally(() => citationSearchPending.current.delete(requestKey));
	};
	const insertCitation = (claim, source) => {
		const annotation = pinned?.annotation;
		if (annotation?.kind !== "citation") return;
		const key = `${annotation.id}:${annotation.unitHash}`;
		const saved = citationData[key];
		const claimKey = `${claim.start}:${claim.end}`;
		if (!saved?.results?.[claimKey]?.sources?.some((item) => item.url === source.url && item.passage === source.passage)
			|| !assistController?.insertCitation(annotation, { ...claim, sentence: saved.sentence }, source.url)) {
			setCitationData((current) => ({ ...current, [key]: { ...current[key],
				notice: "The sentence changed. Search again before inserting a citation.", noticeClaimKey: claimKey } }));
			return;
		}
		setPinned(null);
	};
	useEffect(() => {
		if (!assistController) return undefined;
		const updateMap = (annotations) => setMapAnnotation(annotations.find((annotation) =>
			annotation.tool === "argument-map" && annotation.kind === "map") ?? null);
		updateMap(assistController.store.getAnnotations());
		return assistController.store.subscribe(updateMap);
	}, [assistController]);
	useEffect(() => {
		if (!assistController) return;
		assistController.setToolEnabled("argument-map", Boolean(mapOpen && assistStatus?.tools?.["argument-map"]?.available));
	}, [assistController, assistStatus, mapOpen]);
	useEffect(() => {
		const root = lexicalEditor?.getRootElement();
		if (!root || !assistController || !enabledTools.roles || !assistStatus?.tools?.roles?.available) {
			setRoleAnnouncement("");
			return undefined;
		}
		const priorDescription = root.getAttribute("aria-describedby");
		root.setAttribute("aria-describedby", [priorDescription, "wa-role-status"].filter(Boolean).join(" "));
		const announce = () => {
			const annotation = assistController.getRoleAtSelection();
			const rows = roleHoverRows(annotation?.data?.probabilities,
				assistStatus.config.tools.roles?.thresholds?.minShown);
			setRoleAnnouncement(rows.length
				? `Sentence roles: ${rows.map((row) => `${row.percent}% ${row.label}`).join(", ")}.`
				: "");
		};
		root.ownerDocument.addEventListener("selectionchange", announce);
		const unsubscribe = assistController.store.subscribe(announce);
		announce();
		return () => {
			root.ownerDocument.removeEventListener("selectionchange", announce);
			unsubscribe();
			if (priorDescription === null) root.removeAttribute("aria-describedby");
			else root.setAttribute("aria-describedby", priorDescription);
		};
	}, [lexicalEditor, assistController, enabledTools.roles, assistStatus]);
	function toggleTool(id, enabled) {
		if (id.startsWith("checks.")) {
			const key = id.slice("checks.".length);
			const checks = { ...(enabledToolsRef.current.checks ?? {}), [key]: enabled };
			const next = { ...enabledToolsRef.current, checks };
			enabledToolsRef.current = next;
			setEnabledTools(next);
			try { localStorage.setItem(TOOL_STORAGE_KEY, JSON.stringify(next)); } catch { /* Storage can be unavailable. */ }
			assistController?.setChecksEnabled?.(checks);
			return;
		}
		const next = { ...enabledToolsRef.current, [id]: enabled };
		enabledToolsRef.current = next;
		setEnabledTools(next);
		try { localStorage.setItem(TOOL_STORAGE_KEY, JSON.stringify(next)); } catch { /* Storage can be unavailable. */ }
		assistController?.setToolEnabled(id, enabled);
	}
	const onMapToggle = (open) => {
		setMapOpen(open);
		if (open) setMapError(null);
	};
	return {
		plugin: assistPlugin,
		dock: {
			assistOpen, onAssistToggle: setAssistOpen,
			assistPanelProps: { config: assistStatus?.config, status: assistStatus,
				enabledTools, onToggleTool: toggleTool },
			mapOpen, onMapToggle, hasDrawerViews: getDrawerViews().length > 0,
			mapAvailable: Boolean(assistStatus?.tools?.["argument-map"]?.available),
			mapReason: assistStatus?.tools?.["argument-map"]?.reason ?? "Writing Assist is unavailable.",
		},
		surface: React.createElement(AssistSurface, {
			lexicalEditor, assistController, assistStatus, assistTransport, title, chatSessions,
			hover, setHover, pinned, setPinned, roleAnnouncement,
			mapOpen, setMapOpen, mapAnnotation, mapError,
			checkGenerated, citationData, findCitationSources, insertCitation, retryCitationExtraction,
			openWordFinder, closeWordFinder,
		}),
	};
}
