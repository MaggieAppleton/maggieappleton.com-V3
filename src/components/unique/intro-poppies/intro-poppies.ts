// Five poppies for the top of the essay: three big canonical blooms in a row plus
// two small accent blooms nestled in the gaps, each rendered at its own tilt/scale.
// Coloured with the field's "killed in action" (combat) OKLCH so they match the
// field exactly. On-page positions come from the .astro CSS.
//
// Unlike the field's sprites, these stay live: the renderer keeps running so each
// flower can be gently re-rotated (yaw/pitch) every frame for an ambient sway plus
// a turn toward the cursor when it's nearby — a real 3D tilt, not a flat rotate.

import * as THREE from "three";
import { buildPoppy, POPPY_DEFAULTS } from "../poppy-field/poppy3d";
import { oklchToHex, darken, cssColorHex } from "../poppy-field/poppy-3d-sprites";
import { DEFAULTS as FIELD } from "../poppy-field/params";

const DEG = Math.PI / 180;

// Geometry + lighting for these blooms only — POPPY_DEFAULTS / POPPY_LIGHTING drive
// the field's canonical poppy and stay untouched. Tuned and locked in.
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

// Per-canvas pose. Indices 0–2 are the big row; 3/4 are the accent blooms in the
// gaps, tipped back (negative pitch) to angle upward.
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

	// Match the field's "killed in action" (combat) poppies exactly: same combat
	// OKLCH petal, same darken(0.62) underside, same centre.
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

	// Render one canvas at its base pose plus a live yaw/pitch offset (deg) —
	// this is a real 3D turn of the mesh, not a flat rotate of a baked image.
	function renderPose(cv: HTMLCanvasElement, ctx2d: CanvasRenderingContext2D, i: number, yawOff: number, pitchOff: number) {
		const pose = POSES[i % POSES.length];
		const size = Math.max(1, Math.round((cv.clientWidth || 280) * dpr));
		if (cv.width !== size) {
			cv.width = size;
			cv.height = size;
		}
		renderer.setSize(size, size, false);
		cam.zoom = pose.scale;
		cam.updateProjectionMatrix();
		pivot.rotation.set((pose.pitch + pitchOff) * DEG, (pose.yaw + yawOff) * DEG, 0);
		renderer.render(scene, cam);
		ctx2d.clearRect(0, 0, size, size);
		ctx2d.drawImage(renderer.domElement, 0, 0);
	}

	if (reduce) {
		canvases.forEach((cv, i) => renderPose(cv, ctxs[i], i, 0, 0));
		// Static — free the GPU context, nothing will re-render it.
		poppy.dispose();
		renderer.dispose();
		return;
	}

	const stopAnimation = animate(figure, canvases, ctxs, renderPose);
	return () => {
		stopAnimation();
		// Mirror the reduced-motion path: free the GPU context once nothing
		// will re-render it. A fresh renderer/scene is built on the next
		// astro:page-load re-init, so disposing here is safe.
		poppy.dispose();
		renderer.dispose();
	};
}

// Distance from a point to a rect's nearest edge — 0 when the point is inside.
function distToRect(px: number, py: number, rect: DOMRect) {
	const dx = Math.max(rect.left - px, 0, px - rect.right);
	const dy = Math.max(rect.top - py, 0, py - rect.bottom);
	return Math.hypot(dx, dy);
}

// Gentle live motion: each flower gets a slow ambient yaw/pitch sway (matching
// the poppy field's wind treatment), re-rendered every frame. On top of that,
// hovering in or near the whole figure tips *all* the flowers toward the
// cursor together — one shared yaw/pitch pull driven by where the cursor sits
// relative to the figure as a whole, not each flower's own distance to it.
// Floating position (X/Y) and a light roll still ride on top via the
// --wx/--wy/--wr custom properties consumed by IntroPoppies.astro's CSS,
// layered on each canvas's hand-placed base transform.
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

	// Only pay the render cost while the figure is actually on screen — it
	// sits once at the top of the essay, so this fully stops the rAF loop
	// (and the WebGL render + drawImage per flower inside it) for the rest
	// of the page. rootMargin starts it a little early so there's no
	// first-frame pop as it scrolls into view.
	let raf = 0;
	const observer = new IntersectionObserver(
		([entry]) => {
			if (entry.isIntersecting) {
				if (!raf) raf = requestAnimationFrame(frame);
			} else if (raf) {
				cancelAnimationFrame(raf);
				raf = 0;
			}
		},
		{ rootMargin: "200px 0px" },
	);
	observer.observe(figure);

	function frame(t: number) {
		// Shared pull: where the cursor sits relative to the figure's centre
		// (normalised to its half-size, clamped to ±1), scaled by how close the
		// cursor is to the figure at all (0 once it's PULL_MARGIN past the edge).
		const rect = figure.getBoundingClientRect();
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
			cv.style.setProperty("--wx", `${windX.toFixed(2)}px`);
			cv.style.setProperty("--wy", `${windY.toFixed(2)}px`);
			cv.style.setProperty("--wr", `${roll.toFixed(2)}deg`);
		});
		raf = requestAnimationFrame(frame);
	}

	return () => {
		if (raf) cancelAnimationFrame(raf);
		observer.disconnect();
		window.removeEventListener("pointermove", onPointerMove);
	};
}
