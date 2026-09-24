import "./draft-form.css";
import { waitForDraftReady } from "./draft-ready.mjs";

function localDate() {
	const today = new Date();
	return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function suggestedSlug(title, collection) {
	const ascii = title.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, 100)
		.replace(/^-+|-+$/g, "");
	return ascii || `untitled-${collection === "essays" ? "essay" : "note"}-${localDate()}`;
}

async function bootstrapToken() {
	const response = await fetch("/_editor", { credentials: "same-origin" });
	if (!response.ok) throw new Error("The local editor is unavailable.");
	const html = await response.text();
	const document = new DOMParser().parseFromString(html, "text/html");
	const raw = document.querySelector("#local-editor-bootstrap")?.textContent;
	const bootstrap = raw && JSON.parse(raw);
	if (!bootstrap?.token) throw new Error("The local editor is unavailable.");
	return bootstrap.token;
}

function errorMessage(error) {
	return error?.message || "Couldn’t create this draft.";
}

export function mountDraftForm(root) {
	if (!root) return;
	const configuredOrigin = root.dataset.editorOrigin;
	if (configuredOrigin && window.location.origin !== configuredOrigin) {
		window.location.replace(`${configuredOrigin}${window.location.pathname}${window.location.search}`);
		return;
	}
	const open = root.querySelector(".local-draft-open");
	const form = root.querySelector("form");
	const title = form.elements.title;
	const slug = form.elements.slug;
	const essayFields = root.querySelector(".local-draft-essay");
	const description = form.elements.description;
	const cover = form.elements.coverId;
	const submit = root.querySelector(".local-draft-submit");
	const message = root.querySelector(".local-draft-message");
	let slugWasSuggested = true;
	let requestId = crypto.randomUUID();
	let token;

	const collection = () => form.elements.collection.value;
	const showMessage = (text) => {
		message.textContent = text;
		message.hidden = !text;
	};
	const updateSuggestedSlug = () => {
		if (slugWasSuggested) slug.value = suggestedSlug(title.value, collection());
	};
	const setEssayFields = async () => {
		const essay = collection() === "essays";
		essayFields.hidden = !essay;
		description.required = essay;
		cover.required = essay;
		if (!essay || cover.options.length > 1) return;
		try {
			token ??= await bootstrapToken();
			const response = await fetch("/_editor/api/covers", {
				headers: { "X-Local-Editor-Token": token },
				credentials: "same-origin",
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload?.error?.message);
			for (const item of payload.covers ?? []) {
				const option = document.createElement("option");
				option.value = item.id;
				option.textContent = item.label;
				cover.append(option);
			}
		} catch (error) {
			showMessage(errorMessage(error));
		}
	};
	const setPending = (pending) => {
		for (const control of form.querySelectorAll("input, textarea, select, button")) control.disabled = pending;
		submit.textContent = pending ? "Creating…" : "Create draft";
	};

	open.addEventListener("click", () => {
		window.__localDraftFormActive = true;
		form.hidden = false;
		open.hidden = true;
		open.setAttribute("aria-expanded", "true");
		title.focus();
		updateSuggestedSlug();
	});
	title.addEventListener("input", () => {
		requestId = crypto.randomUUID();
		updateSuggestedSlug();
	});
	slug.addEventListener("input", () => {
		slugWasSuggested = slug.value === suggestedSlug(title.value, collection());
		requestId = crypto.randomUUID();
	});
	description.addEventListener("input", () => { requestId = crypto.randomUUID(); });
	cover.addEventListener("change", () => { requestId = crypto.randomUUID(); });
	for (const input of form.querySelectorAll('input[name="collection"]')) {
		input.addEventListener("change", () => {
			requestId = crypto.randomUUID();
			updateSuggestedSlug();
			setEssayFields();
		});
	}
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		showMessage("");
		window.__localDraftCreationPending = true;
		setPending(true);
		try {
			token ??= await bootstrapToken();
			const response = await fetch("/_editor/api/drafts", {
				method: "POST",
				credentials: "same-origin",
				headers: {
					"Content-Type": "application/json",
					"X-Local-Editor-Token": token,
				},
				body: JSON.stringify({
					requestId,
					collection: collection(),
					slug: slug.value,
					title: title.value,
					description: description.value || undefined,
					coverId: cover.value || undefined,
				}),
			});
			const payload = await response.json();
			if (!response.ok) {
				if (payload?.error?.details?.suggestedSlug) {
					slug.value = payload.error.details.suggestedSlug;
					slugWasSuggested = false;
				}
				throw new Error(payload?.error?.message);
			}
			await waitForDraftReady(payload.documentId, token);
			window.location.assign(payload.editorUrl);
		} catch (error) {
			window.__localDraftCreationPending = false;
			showMessage(errorMessage(error));
			setPending(false);
		}
	});

	setEssayFields();
}
