/**
 * Registers an init function that runs on first load and after each
 * view-transition navigation. The init function can return a cleanup
 * callback that will run before the next init and before DOM swap.
 */
export function onPageLifecycle(init: () => (() => void) | void) {
  let cleanup: (() => void) | void;

  function setup() {
    if (typeof cleanup === "function") cleanup();
    cleanup = init();
  }

  setup();
  document.addEventListener("astro:page-load", setup);
  document.addEventListener("astro:before-swap", () => {
    if (typeof cleanup === "function") cleanup();
  });
}
