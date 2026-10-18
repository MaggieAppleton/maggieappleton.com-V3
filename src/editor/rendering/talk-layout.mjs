import { identityOf } from "../source/source-ledger.mjs";
import { isTalkSlide } from "../source/writing-components.mjs";

/** Reuse the live slide frame and observed transcript elements when Lexical mounts. */
export function createTalkLayouts(originalRoot) {
	const sections = [...originalRoot.querySelectorAll(".scrolly-section")].map((section) => {
		const text = section.querySelector(".scrolly-text");
		const panel = section.querySelector(".scrolly-images");
		if (panel) panel.contentEditable = "false";
		const slides = new Map([...text.querySelectorAll("[data-slide]")].map((slide) => {
			const image = text.querySelector(`[data-for-slide="${slide.dataset.slide}"]`);
			if (image) image.contentEditable = "false";
			const wrapper = document.createElement("div");
			wrapper.style.display = "contents";
			return [slide.dataset.slide, {
				slot: slide,
				restore() {
					if (image && image.parentNode !== wrapper) wrapper.prepend(image);
					if (slide.parentNode !== wrapper) wrapper.append(slide);
				},
				mount() {
					slide.replaceChildren();
					this.restore();
					return wrapper;
				},
			}];
		}));
		return {
			slides,
			shell: {
				slot: text,
				restore() {
					if (panel && panel.parentNode !== section) section.prepend(panel);
					if (text.parentNode !== section) section.append(text);
				},
				mount() { text.replaceChildren(); this.restore(); return section; },
			},
		};
	});
	return {
		forSource(document) {
			const shells = new Map();
			let index = 0;
			function visit(node, section) {
				if (node.name === "ScrollyTalkSection") {
					section = sections[index++];
					if (section) shells.set(identityOf(node), section.shell);
				} else if (section && isTalkSlide(node)) {
					const slideIndex = node.attributes.find((attribute) => attribute.name === "data-slide").value;
					const shell = section.slides.get(slideIndex);
					if (shell) shells.set(identityOf(node), shell);
				}
				for (const child of node.children ?? []) visit(child, section);
			}
			visit(document.body);
			return shells;
		},
	};
}
