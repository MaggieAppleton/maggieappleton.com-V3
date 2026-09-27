import assert from "node:assert/strict";
import test from "node:test";

import { createRoleGradientOverlay, displayedRoleWeights, isMixedRole, lineRects, roleGradient }
	from "../../src/editor/assist/client/overlay/role-gradients.mjs";

function role(probabilities) {
	return { id: "roles:first", tool: "roles", kind: "opinion", data: { probabilities } };
}

test("mixed role gradients use token colours and probability-weighted boundaries", () => {
	const annotation = role({ opinion: 0.56, speculation: 0.26, claim: 0.10, evidence: 0.08 });
	assert.deepEqual(displayedRoleWeights(annotation).map(([key]) => key), ["opinion", "speculation", "claim"]);
	assert.equal(isMixedRole(annotation), true);
	const gradient = roleGradient(annotation);
	assert.match(gradient, /var\(--wa-role-tint-opinion\).*54\.87%/);
	assert.match(gradient, /var\(--wa-role-tint-speculation\).*66\.87%/);
	assert.match(gradient, /var\(--wa-role-tint-claim\).*100%/);
	assert.doesNotMatch(gradient, /var\(--wa-role-tint-evidence\)/);
	assert.equal(roleGradient(role({ opinion: 0.9, claim: 0.09 })), null);
	assert.equal(roleGradient(role({ opinion: NaN, claim: -1 })), null);
});

test("line rects combine inline fragments but retain wrapped lines", () => {
	const rects = lineRects({ getClientRects: () => [
		{ left: 10, right: 40, top: 20, bottom: 38, width: 30, height: 18 },
		{ left: 42, right: 90, top: 20.5, bottom: 38.5, width: 48, height: 18 },
		{ left: 10, right: 62, top: 43, bottom: 61, width: 52, height: 18 },
	] });
	assert.deepEqual(rects, [
		{ left: 10, right: 90, top: 20, bottom: 38.5 },
		{ left: 10, right: 62, top: 43, bottom: 61 },
	]);
});

test("role overlay positions each line, clears after disable, and removes listeners", () => {
	const listeners = new Map();
	const document = {
		createElement: () => element(document),
		defaultView: {
			addEventListener: (name, callback) => listeners.set(name, callback),
			removeEventListener: (name) => listeners.delete(name),
		},
	};
	const wrapper = element(document);
	wrapper.scrollLeft = 3;
	wrapper.scrollTop = 5;
	wrapper.getBoundingClientRect = () => ({ left: 10, top: 20 });
	const root = element(document);
	root.addEventListener = (name, callback) => listeners.set(name, callback);
	root.removeEventListener = (name) => listeners.delete(name);
	let rects = [
		{ left: 30, right: 80, top: 50, bottom: 68, width: 50, height: 18 },
		{ left: 30, right: 90, top: 70, bottom: 88, width: 60, height: 18 },
	];
	let nextFrame;
	const overlay = createRoleGradientOverlay({ wrapper, root, document,
		rangeForAnnotation: () => ({ getClientRects: () => rects }), ResizeObserver: null,
		requestFrame: (callback) => { nextFrame = callback; return 1; }, cancelFrame: () => {},
	});
	overlay.update([role({ opinion: 0.56, speculation: 0.26, claim: 0.10 })]);
	assert.equal(overlay.element.children.length, 2);
	assert.equal(overlay.element.children[0].style.left, "23px");
	assert.equal(overlay.element.children[0].style.top, "35px");
	assert.equal(overlay.element.getAttribute("aria-hidden"), "true");
	rects = [{ left: 50, right: 100, top: 80, bottom: 98, width: 50, height: 18 }];
	listeners.get("scroll")();
	nextFrame();
	assert.equal(overlay.element.children.length, 1);
	assert.equal(overlay.element.children[0].style.left, "43px");
	assert.equal(overlay.element.children[0].style.top, "65px");
	overlay.update([]);
	assert.equal(overlay.element.children.length, 0);
	overlay.destroy();
	assert.equal(listeners.size, 0);
	assert.equal(wrapper.children.length, 0);
});

function element(document) {
	return {
		ownerDocument: document, children: [], style: {}, dataset: {}, parentNode: null, attributes: {},
		append(child) { child.parentNode = this; this.children.push(child); },
		replaceChildren(...children) { this.children = children; for (const child of children) child.parentNode = this; },
		remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); },
		setAttribute(name, value) { this.attributes[name] = value; },
		getAttribute(name) { return this.attributes[name] ?? null; },
	};
}
