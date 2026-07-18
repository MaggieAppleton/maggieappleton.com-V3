// Five poppies for the top of the essay: three big blooms plus two small accent
// blooms, coloured with the field's combat OKLCH so they match it exactly. Unlike
// the field's baked sprites, these stay live — re-rotated every frame for an
// ambient sway plus a turn toward the cursor when it's nearby.

import * as THREE from "three";
import { buildPoppy, POPPY_DEFAULTS } from "../poppy-field/poppy3d";
import { oklchToHex, darken, cssColorHex } from "../poppy-field/poppy-3d-sprites";
import { DEFAULTS as FIELD } from "../poppy-field/params";

const DEG = Math.PI / 180;

// Geometry + lighting for these blooms only — POPPY_DEFAULTS/POPPY_LIGHTING (the
// field's poppy) stay untouched.
const INTRO_SHAPE = {
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
const INTRO_LIGHTING = { elev: 36, strength: 2, ambient: 1.2 };

// Per-canvas pose: 0-2 are the big row; 3/4 are the accent blooms, tipped back.
interface Pose {
	yaw: number;
	pitch: number;
	scale: number;
}
const POSES: Pose[] = [
	{ yaw: -34, pitch: -5, scale: 0.94 },
	{ yaw: 0, pitch: 1, scale: 1 },
	{ yaw: 37, pitch: 0, scale: 0.92 },
	{ yaw: -5, pitch: -50, scale: 1.24 },
	{ yaw: 5, pitch: -50, scale: 1.24 },
];

// Mirrors the base transform baked into IntroPoppies.astro's nth-child/accent
// rules — keep the two in sync. Written as a resolved transform string each
// frame (not animated custom properties) to stay compositor-only.
interface BaseTransform {
	x: string;
	y: number;
	deg: number;
}
const BASE_TRANSFORM: BaseTransform[] = [
	{ x: "0px", y: 10, deg: -3 },
	{ x: "0px", y: -2, deg: 0 },
	{ x: "0px", y: 4, deg: 2 },
	{ x: "-50%", y: 0, deg: -4 },
	{ x: "-50%", y: 0, deg: 5 },
];

export function initIntroPoppies(root: HTMLElement): (() => void) | void {
	const canvases = Array.from(root.querySelectorAll<HTMLCanvasElement>("canvas.intro-poppies__flower"));
	if (!canvases.length) return;
	const figure = root.querySelector<HTMLElement>(".intro-poppies") ?? root;
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const dpr = Math.min(window.devicePixelRatio || 1, 2);

	const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
	renderer.setClearColor(0x000000, 0);
	renderer.setPixelRatio(1);

	const scene = new THREE.Scene();
	scene.add(new THREE.AmbientLight(0xffffff, INTRO_LIGHTING.ambient));
	const key = new THREE.DirectionalLight(0xffffff, INTRO_LIGHTING.strength);
	const el = INTRO_LIGHTING.elev * DEG;
	key.position.set(0.25, Math.sin(el), Math.cos(el));
	scene.add(key);
	const under = new THREE.DirectionalLight(0xffffff, 0.12);
	under.position.set(-0.4, -0.5, 0.3);
	scene.add(under);

	const frustum = 1.25;
	const cam = new THREE.OrthographicCamera(-frustum, frustum, frustum, -frustum, 0.1, 100);
	cam.position.set(0, 0, 10);
	cam.lookAt(0, 0, 0);
	const pivot = new THREE.Group();
	const orient = new THREE.Group();
	orient.rotation.x = Math.PI / 2;
	pivot.add(orient);
	scene.add(pivot);

	// Matches the field's combat (killed-in-action) poppies exactly.
	const battle = oklchToHex(FIELD.combatL, FIELD.combatC, FIELD.combatH);
	const poppy = buildPoppy({
		...POPPY_DEFAULTS,
		...INTRO_SHAPE,
		petalColor: battle,
		deepColor: darken(battle, 0.62),
		centreColor: cssColorHex("--color-poppy-centre", "oklch(0.2 0.06 30)"),
	});
	orient.add(poppy.group);

	const ctxs = canvases.map((cv) => cv.getContext("2d")!);

	// Guards against redundant setSize calls — reallocates the GL buffer even
	// when unchanged, and renderPose runs 5x/frame.
	let lastRenderSize = 0;

	// Read from clientWidth once (and on resize), not inside renderPose() — that
	// runs every rAF tick and would force a layout read 5x/frame.
	const sizes: number[] = canvases.map(() => 0);
	function measureSize(i: number) {
		const cv = canvases[i];
		const size = Math.max(1, Math.round((cv.clientWidth || 280) * dpr));
		sizes[i] = size;
		if (cv.width !== size) {
			cv.width = size;
			cv.height = size;
		}
	}
	canvases.forEach((_, i) => measureSize(i));

	function renderPose(_cv: HTMLCanvasElement, ctx2d: CanvasRenderingContext2D, i: number, yawOff: number, pitchOff: number) {
		const pose = POSES[i % POSES.length];
		const size = sizes[i];
		if (size !== lastRenderSize) {
			renderer.setSize(size, size, false);
			lastRenderSize = size;
		}
		cam.zoom = pose.scale;
		cam.updateProjectionMatrix();
		pivot.rotation.set((pose.pitch + pitchOff) * DEG, (pose.yaw + yawOff) * DEG, 0);
		renderer.render(scene, cam);
		ctx2d.clearRect(0, 0, size, size);
		ctx2d.drawImage(renderer.domElement, 0, 0);
	}

	if (reduce) {
		canvases.forEach((cv, i) => renderPose(cv, ctxs[i], i, 0, 0));
		poppy.dispose();
		// forceContextLoss() releases the GL context eagerly (dispose() alone waits
		// for GC), so page revisits don't hit the ~16-context browser cap.
		renderer.forceContextLoss();
		renderer.dispose();
		return;
	}

	const resizeObserver = new ResizeObserver(() => {
		canvases.forEach((_, i) => measureSize(i));
	});
	canvases.forEach((cv) => resizeObserver.observe(cv));

	const stopAnimation = animate(figure, canvases, ctxs, renderPose);
	return () => {
		stopAnimation();
		resizeObserver.disconnect();
		poppy.dispose();
		renderer.forceContextLoss();
		renderer.dispose();
	};
}

// Distance from a point to a rect's nearest edge — 0 when the point is inside.
function distToRect(px: number, py: number, rect: DOMRect) {
	const dx = Math.max(rect.left - px, 0, px - rect.right);
	const dy = Math.max(rect.top - py, 0, py - rect.bottom);
	return Math.hypot(dx, dy);
}

// Each flower gets a slow ambient sway, plus a shared yaw/pitch pull toward the
// cursor driven by where it sits relative to the whole figure (not each
// flower's own distance). Written each frame as a resolved transform string
// (see BASE_TRANSFORM), not animated custom properties, to stay compositor-only.
function animate(
	figure: HTMLElement,
	canvases: HTMLCanvasElement[],
	ctxs: CanvasRenderingContext2D[],
	renderPose: (cv: HTMLCanvasElement, ctx2d: CanvasRenderingContext2D, i: number, yawOff: number, pitchOff: number) => void,
): () => void {
	const YAW_SWAY = 10; // deg, ambient turn
	const PITCH_SWAY = 6; // deg, ambient tip
	const YAW_PULL = 16; // deg, max shared turn toward cursor
	const PITCH_PULL = 10; // deg, max shared tip toward cursor
	const PULL_MARGIN = 200; // px beyond the figure's edge where the pull fades to 0
	const ROLL_SWAY = 1; // deg, subtle in-plane flutter
	const BREEZE_X = 3; // px
	const BREEZE_Y = 2; // px

	let pointerX = -Infinity;
	let pointerY = -Infinity;
	const onPointerMove = (e: PointerEvent) => {
		pointerX = e.clientX;
		pointerY = e.clientY;
	};
	window.addEventListener("pointermove", onPointerMove, { passive: true });

	// Cached from scroll/resize instead of read fresh every frame — only needs
	// to stay roughly current, not per-pixel-accurate mid-scroll.
	let figureRect = figure.getBoundingClientRect();
	const measureFigureRect = () => {
		figureRect = figure.getBoundingClientRect();
	};
	window.addEventListener("scroll", measureFigureRect, { passive: true });
	window.addEventListener("resize", measureFigureRect);

	// Stops the rAF loop entirely once scrolled past the figure. rootMargin
	// starts it a little early to avoid a first-frame pop.
	let raf = 0;
	const observer = new IntersectionObserver(
		([entry]) => {
			if (entry.isIntersecting) {
				if (!raf) raf = requestAnimationFrame(frame);
				figure.classList.add("is-animating");
			} else if (raf) {
				cancelAnimationFrame(raf);
				raf = 0;
				figure.classList.remove("is-animating");
			}
		},
		{ rootMargin: "200px 0px" },
	);
	observer.observe(figure);

	function frame(t: number) {
		// Cursor position relative to the figure's centre, normalised to ±1 and
		// scaled to 0 once PULL_MARGIN past the edge.
		const rect = figureRect;
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const nx = Math.max(-1, Math.min(1, (pointerX - cx) / (rect.width / 2 + PULL_MARGIN)));
		const ny = Math.max(-1, Math.min(1, (pointerY - cy) / (rect.height / 2 + PULL_MARGIN)));
		const falloff = Math.max(0, 1 - distToRect(pointerX, pointerY, rect) / PULL_MARGIN);
		const yawPull = nx * YAW_PULL * falloff;
		const pitchPull = ny * PITCH_PULL * falloff;

		canvases.forEach((cv, i) => {
			const phase = i * 1.7;
			const yawAmb = Math.sin(t * 0.0006 + phase) * YAW_SWAY + Math.sin(t * 0.0004 + phase * 1.3) * YAW_SWAY * 0.4;
			const pitchAmb = Math.sin(t * 0.0008 + phase * 0.9) * PITCH_SWAY;

			renderPose(cv, ctxs[i], i, yawAmb + yawPull, pitchAmb + pitchPull);

			const windX = Math.sin(t * 0.0007 + phase * 0.8) * BREEZE_X;
			const windY = Math.sin(t * 0.0011 + phase * 1.2) * BREEZE_Y;
			const roll = Math.sin(t * 0.0009 + phase) * ROLL_SWAY;
			const base = BASE_TRANSFORM[i] ?? BASE_TRANSFORM[0];
			cv.style.transform = `translate(calc(${base.x} + ${windX.toFixed(2)}px), calc(${base.y}px + ${windY.toFixed(2)}px)) rotate(calc(${base.deg}deg + ${roll.toFixed(2)}deg))`;
		});
		raf = requestAnimationFrame(frame);
	}

	return () => {
		if (raf) cancelAnimationFrame(raf);
		observer.disconnect();
		figure.classList.remove("is-animating");
		window.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("scroll", measureFigureRect);
		window.removeEventListener("resize", measureFigureRect);
	};
}
