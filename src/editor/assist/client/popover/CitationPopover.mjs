import React, { useEffect, useRef } from "react";
import { ArrowSquareOutIcon, FileMagnifyingGlassIcon, SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import tippy from "tippy.js";

function resultKey(claim) {
	return `${claim.start}:${claim.end}`;
}

function sourceTypeLabel(sourceType) {
	if (!sourceType) return "Source guidance unavailable";
	return String(sourceType).replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
	} catch {
		return null;
	}
}

function Source({ claim, source, onInsertCitation }) {
	const url = safeUrl(source.url);
	return React.createElement("article", { className: "wa-citation-source" },
		React.createElement("div", { className: "wa-citation-source-heading" },
			React.createElement("strong", null, source.title || "Untitled source"),
			source.publisher && React.createElement("span", { className: "wa-citation-publisher" }, source.publisher)),
		source.match === "uncertain" && React.createElement("span", { className: "wa-citation-uncertain" }, "Uncertain match"),
		url && React.createElement("a", { href: url, target: "_blank", rel: "noreferrer", className: "wa-citation-url" }, url),
		source.passage && React.createElement("p", { className: "wa-citation-passage" }, `“${source.passage}”`),
		React.createElement("div", { className: "wa-citation-actions" },
			url && React.createElement("a", { href: url, target: "_blank", rel: "noreferrer",
				className: "wa-citation-action wa-citation-open", "aria-label": "Open source", title: "Open source" },
				React.createElement(ArrowSquareOutIcon, { size: 18, "aria-hidden": true })),
			url && React.createElement("button", { type: "button", className: "wa-citation-action wa-citation-insert",
				onClick: () => onInsertCitation?.(claim, source) }, "Insert citation")));
}

function StaleWarning({ notice }) {
	const triggerRef = useRef(null);
	useEffect(() => {
		if (!triggerRef.current) return undefined;
		const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		const instance = tippy(triggerRef.current, {
			content: notice, maxWidth: 300, duration: reducedMotion ? 0 : [240, 160],
			arrow: true, interactive: false, animation: reducedMotion ? false : "grow",
			appendTo: () => document.body, theme: "custom", touch: true,
		});
		return () => instance.destroy();
	}, [notice]);
	return React.createElement("span", { className: "wa-citation-stale" },
		React.createElement("button", { ref: triggerRef, type: "button", className: "wa-citation-stale-trigger",
			"aria-label": `Warning: ${notice}` },
			React.createElement(WarningIcon, { size: 16, "aria-hidden": "true" })));
}

function Claim({ claim, result, notice, onFindSources, onInsertCitation }) {
	const status = result?.status;
	const sources = Array.isArray(result?.sources) ? result.sources.slice(0, 2) : [];
	const searchLabel = sources.length > 0 ? "Find other sources" : "Find sources";
	return React.createElement("section", { className: "wa-citation-claim" },
		React.createElement("div", { className: "wa-citation-claim-heading" },
			React.createElement("blockquote", { className: "wa-citation-quote" }, `“${claim.text}”`,
				notice && React.createElement(StaleWarning, { notice })),
			React.createElement("button", { type: "button", className: "wa-citation-find",
				"aria-label": status === "loading" ? `Finding sources for “${claim.text}”` : `${searchLabel} for “${claim.text}”`,
				"aria-busy": status === "loading", title: status === "loading" ? "Finding sources" : searchLabel,
				disabled: status === "loading", onClick: () => onFindSources?.(claim) },
				status === "loading"
					? React.createElement(SpinnerGapIcon, { size: 18, className: "wa-citation-spinner", "aria-hidden": "true" })
					: React.createElement(FileMagnifyingGlassIcon, { size: 18, "aria-hidden": "true" }))),
		notice && React.createElement("span", { className: "visually-hidden", role: "alert" }, notice),
		React.createElement("p", { className: "wa-citation-guidance" }, sourceTypeLabel(claim.sourceType)),
		status === "error" && React.createElement("p", { className: "wa-citation-error", role: "alert" }, result.error || "Sources unavailable."),
		status === "ready" && sources.length === 0 && React.createElement("p", { className: "wa-citation-empty wa-citation-no-results" }, "No matching sources found."),
		sources.map((source, index) => React.createElement(Source, { key: source.url || `${source.title}-${index}`, claim, source, onInsertCitation })));
}

/** The citation-only body rendered inside a pinned check popover. */
export function CitationPopover({ citation, onFindSources, onInsertCitation, onRetryCitation }) {
	if (!citation) return null;
	const claims = Array.isArray(citation.claims) ? citation.claims : [];
	const results = citation.results ?? {};
	return React.createElement("div", { className: "wa-citation-popover" },
		citation.status === "loading" && React.createElement("div", { className: "wa-citation-loading", role: "status" },
			React.createElement("span", { className: "visually-hidden" }, "Finding claims…"),
			React.createElement("div", { className: "wa-citation-skeleton", "aria-hidden": "true" },
				[0, 1].map((index) => React.createElement("div", { className: "wa-citation-skeleton-claim", key: index },
					React.createElement("i", null),
					React.createElement("i", null))))),
		citation.status === "error" && React.createElement("div", { className: "wa-citation-error", role: "alert" },
			React.createElement("span", null, citation.error || "Claims unavailable."),
			React.createElement("button", { type: "button", className: "wa-citation-retry", onClick: onRetryCitation }, "Try again")),
		citation.status === "ready" && claims.length === 0 && React.createElement("p", { className: "wa-citation-empty" }, "No sourceable claims found."),
		claims.map((claim) => React.createElement(Claim, { key: resultKey(claim), claim,
			notice: citation.noticeClaimKey === resultKey(claim) ? citation.notice : null,
			result: results[resultKey(claim)], onFindSources, onInsertCitation })));
}
