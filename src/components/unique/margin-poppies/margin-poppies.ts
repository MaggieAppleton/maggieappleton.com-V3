// Small 3D poppies scattered down the page margins on desktop, reusing the
// field's combat bloom (same geometry/colour/lighting as the intro poppies).
// One shared WebGLRenderer + poppy mesh renders every canvas: each frame it
// points the mesh at that bloom's pose, renders, and drawImages it into the
// bloom's own 2D canvas (same trick as intro-poppies.ts). Only mounts above
// MARGIN_BREAKPOINT; only visible blooms render.

import * as THREE from "three";
import { buildPoppy, POPPY_DEFAULTS } from "../poppy-field/poppy3d";
import { oklchToHex, darken, cssColorHex } from "../poppy-field/poppy-3d-sprites";
import { DEFAULTS as FIELD } from "../poppy-field/params";
import { MARGIN_POPPIES, MARGIN_BREAKPOINT } from "./config";

const DEG = Math.PI / 180;

// Same bloom shape + lighting as the intro poppies, kept local (not imported)
// so each stays independently tunable.
const SHAPE = {
	petals: 5,
	whorls: 1,
	petalLength: 1,
	petalWidth: 1.15,
	cupLong: 0.32,
	cupTrans: 0.46,
	openInner: 1.02,
	openOuter: 1.28,
	crumple: 0.26,
	centreSize: 0.37,
	centreDepth: 0.15,
};
const LIGHTING = { elev: 36, strength: 2, ambient: 1.2 };
const BLOOM_ZOOM = 1.16; // matches the intro accent poppies' on-canvas fill (cam.zoom 1.24)

export function initMarginPoppies(root: HTMLElement): (() => void) | void {
	const canvases = Array.from(root.querySelectorAll<HTMLCanvasElement>("canvas.margin-poppy"));
	if (!canvases.length) return;

	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const dpr = Math.min(window.devicePixelRatio || 1, 2);

	// Only spin up WebGL while the layer is actually shown; mount/unmount as the
	// viewport crosses MARGIN_BREAKPOINT.
	const wide = window.matchMedia(`(min-width: ${MARGIN_BREAKPOINT}px)`);
	let live: { teardown: () => void } | null = null;
	const start = () => {
		if (!live) live = mount(canvases, reduce, dpr);
	};
	const stop = () => {
		live?.teardown();
		live = null;
	};

	if (wide.matches) start();
	const onChange = () => (wide.matches ? start() : stop());
	wide.addEventListener("change", onChange);

	return () => {
		wide.removeEventListener("change", onChange);
		stop();
	};
}

function mount(canvases: HTMLCanvasElement[], reduce: boolean, dpr: number): { teardown: () => void } {
	const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
	renderer.setClearColor(0x000000, 0);
	renderer.setPixelRatio(1);

	const scene = new THREE.Scene();
	scene.add(new THREE.AmbientLight(0xffffff, LIGHTING.ambient));
	const key = new THREE.DirectionalLight(0xffffff, LIGHTING.strength);
	const el = LIGHTING.elev * DEG;
	key.position.set(0.25, Math.sin(el), Math.cos(el));
	scene.add(key);
	const under = new THREE.DirectionalLight(0xffffff, 0.12);
	under.position.set(-0.4, -0.5, 0.3);
	scene.add(under);

	const frustum = 1.25;
	const cam = new THREE.OrthographicCamera(-frustum, frustum, frustum, -frustum, 0.1, 100);
	cam.position.set(0, 0, 10);
	cam.lookAt(0, 0, 0);
	cam.zoom = BLOOM_ZOOM;
	cam.updateProjectionMatrix();
	const pivot = new THREE.Group();
	const orient = new THREE.Group();
	orient.rotation.x = Math.PI / 2;
	pivot.add(orient);
	scene.add(pivot);

	const battle = oklchToHex(FIELD.combatL, FIELD.combatC, FIELD.combatH);
	const poppy = buildPoppy({
		...POPPY_DEFAULTS,
		...SHAPE,
		petalColor: battle,
		deepColor: darken(battle, 0.62),
		centreColor: cssColorHex("--color-poppy-centre", "oklch(0.2 0.06 30)"),
	});
	orient.add(poppy.group);

	const ctxs = canvases.map((cv) => cv.getContext("2d")!);

	// Fixed px width per bloom (from config), so this only changes with dpr.
	const sizes = canvases.map((cv, i) => {
		const size = Math.max(1, Math.round((cv.clientWidth || MARGIN_POPPIES[i]?.size || 80) * dpr));
		if (cv.width !== size) {
			cv.width = size;
			cv.height = size;
		}
		return size;
	});

	// setSize() reallocates the GL buffer even when unchanged, so only call it
	// when the size actually changes between poses.
	let lastRenderSize = 0;

	function renderPose(i: number, yawOff: number, pitchOff: number) {
		const p = MARGIN_POPPIES[i];
		const size = sizes[i];
		if (size !== lastRenderSize) {
			renderer.setSize(size, size, false);
			lastRenderSize = size;
		}
		pivot.rotation.set((p.pitch + pitchOff) * DEG, (p.yaw + yawOff) * DEG, 0);
		renderer.render(scene, cam);
		const ctx = ctxs[i];
		ctx.clearRect(0, 0, size, size);
		ctx.drawImage(renderer.domElement, 0, 0);
	}

	if (reduce) {
		canvases.forEach((_, i) => renderPose(i, 0, 0));
		poppy.dispose();
		renderer.forceContextLoss();
		renderer.dispose();
		return { teardown() {} };
	}

	const stopAnimation = animate(canvases, renderPose);
	return {
		teardown() {
			stopAnimation();
			poppy.dispose();
			// forceContextLoss() releases the GL context eagerly so remounts (view
			// transitions, breakpoint crossings) don't hit the ~16-context browser cap.
			renderer.forceContextLoss();
			renderer.dispose();
		},
	};
}

// Each bloom gets an ambient sway plus a turn toward the cursor when nearby,
// written each frame as a resolved transform string (compositor-only, unlike
// animating a custom property). Only visible blooms render; the loop stops
// entirely when none are on screen.
function animate(canvases: HTMLCanvasElement[], renderPose: (i: number, yawOff: number, pitchOff: number) => void): () => void {
	const YAW_SWAY = 9; // deg, ambient turn
	const PITCH_SWAY = 5; // deg, ambient tip
	const YAW_PULL = 16; // deg, max turn toward cursor
	const PITCH_PULL = 11; // deg, max tip toward cursor
	const PULL_RADIUS = 160; // px beyond a bloom where the cursor pull fades to 0
	const ROLL_SWAY = 1.2; // deg, subtle in-plane flutter
	const BREEZE_X = 2.5; // px
	const BREEZE_Y = 2; // px

	let pointerX = -Infinity;
	let pointerY = -Infinity;
	const onPointerMove = (e: PointerEvent) => {
		pointerX = e.clientX;
		pointerY = e.clientY;
	};
	window.addEventListener("pointermove", onPointerMove, { passive: true });

	// Rects come from IntersectionObserver entries and are refreshed on scroll/
	// resize for visible blooms — only need to stay roughly current.
	const visible = canvases.map(() => false);
	const rects: (DOMRect | null)[] = canvases.map(() => null);

	let raf = 0;
	const observer = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				const i = canvases.indexOf(e.target as HTMLCanvasElement);
				if (i < 0) continue;
				visible[i] = e.isIntersecting;
				rects[i] = e.boundingClientRect;
				(e.target as HTMLElement).classList.toggle("is-animating", e.isIntersecting);
			}
			if (visible.some(Boolean) && !raf) raf = requestAnimationFrame(frame);
		},
		{ rootMargin: "120px 0px" },
	);
	canvases.forEach((cv) => observer.observe(cv));

	const refreshRects = () => {
		canvases.forEach((cv, i) => {
			if (visible[i]) rects[i] = cv.getBoundingClientRect();
		});
	};
	// Scroll only flags rects as stale (forces layout otherwise); frame()
	// recomputes at most once per animation frame.
	let rectsDirty = false;
	const onScroll = () => {
		rectsDirty = true;
	};
	window.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("resize", refreshRects); // rare, so refresh immediately

	function frame(t: number) {
		if (rectsDirty) {
			refreshRects();
			rectsDirty = false;
		}
		let anyVisible = false;
		for (let i = 0; i < canvases.length; i++) {
			if (!visible[i]) continue;
			anyVisible = true;
			const p = MARGIN_POPPIES[i];
			const phase = i * 1.9;
			const yawAmb = Math.sin(t * 0.0006 + phase) * YAW_SWAY + Math.sin(t * 0.0004 + phase * 1.3) * YAW_SWAY * 0.35;
			const pitchAmb = Math.sin(t * 0.0008 + phase * 0.9) * PITCH_SWAY;

			// Turn toward the cursor, scaled by how close it sits to this bloom.
			let yawPull = 0;
			let pitchPull = 0;
			const r = rects[i];
			if (r) {
				const cx = r.left + r.width / 2;
				const cy = r.top + r.height / 2;
				const dist = Math.hypot(pointerX - cx, pointerY - cy);
				const falloff = Math.max(0, 1 - dist / (r.width / 2 + PULL_RADIUS));
				yawPull = Math.max(-1, Math.min(1, (pointerX - cx) / (r.width / 2 + PULL_RADIUS))) * YAW_PULL * falloff;
				pitchPull = Math.max(-1, Math.min(1, (pointerY - cy) / (r.height / 2 + PULL_RADIUS))) * PITCH_PULL * falloff;
			}

			renderPose(i, yawAmb + yawPull, pitchAmb + pitchPull);

			const windX = Math.sin(t * 0.0007 + phase * 0.8) * BREEZE_X;
			const windY = Math.sin(t * 0.0011 + phase * 1.2) * BREEZE_Y;
			const roll = Math.sin(t * 0.0009 + phase) * ROLL_SWAY;
			// Left blooms anchor by their right edge (-100%), right blooms by their
			// left edge (0%) — folded in so it survives the per-frame overwrite.
			const baseX = p.side === "left" ? "-100%" : "0%";
			canvases[i].style.transform = `translate(calc(${baseX} + ${windX.toFixed(2)}px), ${windY.toFixed(2)}px) rotate(${roll.toFixed(2)}deg)`;
		}
		raf = anyVisible ? requestAnimationFrame(frame) : 0;
	}

	if (visible.some(Boolean)) raf = requestAnimationFrame(frame);

	return () => {
		if (raf) cancelAnimationFrame(raf);
		observer.disconnect();
		window.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("scroll", onScroll);
		window.removeEventListener("resize", refreshRects);
		canvases.forEach((cv) => {
			cv.classList.remove("is-animating");
			cv.style.transform = "";
		});
	};
}
