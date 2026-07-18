// Small 3D poppies scattered down the page margins on desktop. They reuse the
// field's "killed in action" (combat) bloom — same geometry, colour and lighting
// as the intro poppies — so they read as the same flower, just smaller and
// dotted through the gutters.
//
// One shared WebGLRenderer + one poppy mesh renders every canvas: each frame we
// point the mesh at that bloom's pose, render into the shared GL canvas, and
// drawImage it into the bloom's own 2D canvas (same trick as intro-poppies.ts).
// On top of the static pose each bloom gets a slow ambient yaw/pitch sway plus a
// gentle turn toward the cursor when it's nearby — a real 3D tilt, not a flat
// rotate — with a light floating/roll ridden on via a resolved transform string.
//
// Only blooms currently on screen are rendered; when none are visible the rAF
// loop fully stops. The whole thing only mounts above MARGIN_BREAKPOINT (the
// layer is display:none below it), and unmounts if the viewport crosses back.

import * as THREE from "three";
import { buildPoppy, POPPY_DEFAULTS } from "../poppy-field/poppy3d";
import { oklchToHex, darken, cssColorHex } from "../poppy-field/poppy-3d-sprites";
import { DEFAULTS as FIELD } from "../poppy-field/params";
import { MARGIN_POPPIES, MARGIN_BREAKPOINT } from "./config";

const DEG = Math.PI / 180;

// Same bloom shape + lighting as the intro poppies so the two decorations match.
// Kept local rather than imported from intro-poppies.ts so each stays tunable on
// its own.
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
// Zoom the mesh a touch within each canvas so the bloom fills roughly the same
// fraction as the intro accent poppies (which render at cam.zoom 1.24).
const BLOOM_ZOOM = 1.16;

export function initMarginPoppies(root: HTMLElement): (() => void) | void {
	const canvases = Array.from(root.querySelectorAll<HTMLCanvasElement>("canvas.margin-poppy"));
	if (!canvases.length) return;

	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const dpr = Math.min(window.devicePixelRatio || 1, 2);

	// Only spin up WebGL while the layer is actually shown. Below the breakpoint
	// the canvases are display:none, so mounting there would build a renderer for
	// nothing; we mount/unmount as the viewport crosses MARGIN_BREAKPOINT.
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

	// Match the field's combat poppies exactly: same combat OKLCH petal, same
	// darken(0.62) underside, same centre.
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

	// Device-pixel render size per canvas. The CSS width is a fixed px value per
	// bloom (from config), so this only changes with dpr and is read once.
	const sizes = canvases.map((cv, i) => {
		const size = Math.max(1, Math.round((cv.clientWidth || MARGIN_POPPIES[i]?.size || 80) * dpr));
		if (cv.width !== size) {
			cv.width = size;
			cv.height = size;
		}
		return size;
	});

	// setSize() reassigns the canvas width/height, which reallocates and clears the
	// GL drawing buffer even when the dimensions are unchanged. All blooms share one
	// renderer and most render at the same dpr-scaled size, so only call setSize when
	// the size actually changes between poses.
	let lastRenderSize = 0;

	// Render one bloom at its base pose plus a live yaw/pitch offset (deg) — a real
	// 3D turn of the mesh, not a flat rotate of a baked image.
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
		// Static — free the GPU context, nothing will re-render it. forceContextLoss()
		// actually releases the underlying WebGL context; dispose() alone only frees
		// Three's JS-side resources, so contexts would accumulate on re-init (view
		// transitions / breakpoint crossings) until the browser's ~16-context cap.
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
			// forceContextLoss() actually releases the underlying WebGL context;
			// dispose() alone only frees Three's JS-side resources, so contexts would
			// accumulate on remount (view transitions / breakpoint crossings) until the
			// browser's ~16-context cap throws "Too many active WebGL contexts".
			renderer.forceContextLoss();
			renderer.dispose();
		},
	};
}

// Gentle live motion: each bloom gets a slow ambient yaw/pitch sway (matching the
// field's wind), plus a turn toward the cursor when it drifts near, plus a light
// float/roll written each frame as a resolved `transform` string (a direct
// el.style.transform write goes straight to the compositor, where animating a CSS
// custom property would force a style recalc first). Only visible blooms render;
// the loop stops entirely when none are on screen.
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

	// Per-canvas visibility + cached viewport rect. Rects come from the
	// IntersectionObserver entries (free) and are refreshed on scroll/resize for
	// blooms currently in view — the cursor-pull math only needs them roughly
	// current. Only visible blooms are rendered each frame.
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
				// will-change only while this bloom is live, not held permanently.
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
	// Scroll fires far more often than we paint. Reading getBoundingClientRect() per
	// event forces synchronous layout (thrash), so the scroll handler only flags the
	// rects as stale and frame() recomputes them at most once per animation frame,
	// and only while the loop is actually running.
	let rectsDirty = false;
	const onScroll = () => {
		rectsDirty = true;
	};
	window.addEventListener("scroll", onScroll, { passive: true });
	// Resize is rare, so refresh immediately rather than waiting on the loop (which
	// may be stopped when nothing is visible).
	window.addEventListener("resize", refreshRects);

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
			// Left blooms are placed by their right edge (translateX(-100%)); right
			// blooms by their left edge (0). Fold that side base into the animated
			// transform so it survives being overwritten each frame.
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
