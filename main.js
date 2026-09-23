
// ============================================================================
// Config
// ============================================================================

// Frame count and filenames are read from frames-manifest.json (see
// generate-frames-manifest.js) instead of assumed to be a contiguous
// 1..N range. That file lists exactly what's actually in frames/, in
// playback order - so deleted/missing frames are simply skipped, on
// purpose or not, with no gap or blank frame in the page.

let TOTAL_FRAMES = 0;
let FRAME_FILENAMES = [];

const FRAME_PATH = (index) =>
  `./frames/${FRAME_FILENAMES[index]}`;

async function loadFramesManifest() {
  const res = await fetch("./frames-manifest.json");
  FRAME_FILENAMES = await res.json();
  TOTAL_FRAMES = FRAME_FILENAMES.length;
}


// --------------------------------------------------------------------------
// Scroll distance
// --------------------------------------------------------------------------
//
// Higher = more physical scroll distance per frame.
// Lower  = less physical scroll distance per frame.
//
// Frame count went from ~803 (was 20px/frame) to 1566 with the 60fps
// re-extraction, so this is halved to ~10 to keep the total scroll
// distance (TOTAL_FRAMES * PX_PER_FRAME) about the same as before -
// same amount of scrolling, just finer-grained frames along the way.
//

const PX_PER_FRAME = 10;


// --------------------------------------------------------------------------
// Smoothness
// --------------------------------------------------------------------------
//
// Controls how quickly the animation catches up to the scroll position.
//
// 0.10 = more sliding / floaty
// 0.14 = smooth
// 0.16 = recommended
// 0.20 = more responsive
// 0.25 = very responsive
//

const SMOOTHING = 0.16;


// --------------------------------------------------------------------------
// Maximum frame movement per animation tick
// --------------------------------------------------------------------------
//
// Prevents a huge jump if the browser temporarily freezes.
//

const MAX_FRAME_STEP = 3;


// ============================================================================
// Canvas setup
// ============================================================================

const canvas = document.getElementById("canvas");

const ctx = canvas.getContext("2d", {
  alpha: false
});


// ============================================================================
// Resize
// ============================================================================

function resizeCanvas() {

  const dpr =
    Math.min(
      window.devicePixelRatio || 1,
      2
    );

  canvas.width =
    Math.round(
      window.innerWidth * dpr
    );

  canvas.height =
    Math.round(
      window.innerHeight * dpr
    );

  canvas.style.width =
    `${window.innerWidth}px`;

  canvas.style.height =
    `${window.innerHeight}px`;

  drawCurrentFrame();
}


// ============================================================================
// Loading UI
// ============================================================================

const loadingEl =
  document.getElementById("loading");

const loadingText =
  document.getElementById("loading-text");

const loadingFill =
  document.getElementById("loading-fill");


// ============================================================================
// Images
// ============================================================================

let images = [];

let currentFrameIndex = 0;

let targetFrameIndex = 0;


// ============================================================================
// Preload
// ============================================================================

function preloadImages() {

  let loaded = 0;

  const promises = [];

  images = new Array(TOTAL_FRAMES).fill(null);


  for (
    let i = 0;
    i < TOTAL_FRAMES;
    i++
  ) {

    const img = new Image();


    const promise =
      new Promise((resolve) => {

        img.onload = () => {

          loaded++;

          const pct =
            Math.round(
              (loaded / TOTAL_FRAMES) * 100
            );

          loadingText.textContent =
            `${pct}%`;

          loadingFill.style.width =
            `${pct}%`;

          resolve();
        };


        img.onerror = () => {

          loaded++;

          const pct =
            Math.round(
              (loaded / TOTAL_FRAMES) * 100
            );

          loadingText.textContent =
            `${pct}%`;

          loadingFill.style.width =
            `${pct}%`;

          console.warn(
            "Failed to load:",
            FRAME_PATH(i)
          );

          resolve();
        };

      });


    img.src =
      FRAME_PATH(i);

    images[i] = img;

    promises.push(promise);
  }


  return Promise.all(promises);
}


// ============================================================================
// Draw image - cover
// ============================================================================

function drawImageCover(img) {

  const canvasAspect =
    canvas.width /
    canvas.height;

  const imageAspect =
    img.naturalWidth /
    img.naturalHeight;


  let width;
  let height;
  let x;
  let y;


  if (
    imageAspect >
    canvasAspect
  ) {

    height =
      canvas.height;

    width =
      height *
      imageAspect;

    x =
      (canvas.width - width) / 2;

    y = 0;

  } else {

    width =
      canvas.width;

    height =
      width /
      imageAspect;

    x = 0;

    y =
      (canvas.height - height) / 2;
  }


  ctx.drawImage(
    img,
    x,
    y,
    width,
    height
  );
}


// ============================================================================
// Draw frame
// ============================================================================

function drawFrame(floatIndex) {

  const index =
    Math.round(
      Math.max(
        0,
        Math.min(
          TOTAL_FRAMES - 1,
          floatIndex
        )
      )
    );


  const img =
    images[index];


  if (
    !img ||
    !img.complete ||
    img.naturalWidth === 0
  ) {

    return;
  }


  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );


  drawImageCover(img);
}


function drawCurrentFrame() {

  drawFrame(
    currentFrameIndex
  );
}


// ============================================================================
// Scroll spacer
// ============================================================================

function updateScrollSpacer() {

  const height =
    TOTAL_FRAMES *
    PX_PER_FRAME +
    window.innerHeight;


  document.getElementById(
    "scroll-spacer"
  ).style.height =
    `${height}px`;
}


// ============================================================================
// Scroll → target frame
// ============================================================================

function updateTargetFromScroll() {

  const maxScroll =
    document.documentElement.scrollHeight -
    window.innerHeight;


  if (maxScroll <= 0) {

    targetFrameIndex = 0;

    return;
  }


  const progress =
    window.scrollY /
    maxScroll;


  const clamped =
    Math.max(
      0,
      Math.min(
        1,
        progress
      )
    );


  targetFrameIndex =
    clamped *
    (TOTAL_FRAMES - 1);
}


window.addEventListener(
  "scroll",
  updateTargetFromScroll,
  {
    passive: true
  }
);


// ============================================================================
// Smooth frame playback
// ============================================================================
//
// The current frame smoothly follows the target frame.
//
// This creates:
//
//     scroll
//        ↓
//     frame moves
//        ↓
//     stop scrolling
//        ↓
//     frame keeps sliding slightly
//        ↓
//     smoothly settles
//
// This is intentionally NOT a constant-FPS catch-up.
// It uses interpolation to create a soft, cinematic feeling.
//

let lastTime =
  performance.now();


function tick(now) {

  const deltaTime =
    Math.min(
      now - lastTime,
      50
    );

  lastTime =
    now;


  const delta =
    targetFrameIndex -
    currentFrameIndex;


  if (
    Math.abs(delta) > 0.01
  ) {

    // --------------------------------------------------------------
    // Smooth movement toward target
    // --------------------------------------------------------------

    let frameStep =
      delta *
      SMOOTHING;


    // --------------------------------------------------------------
    // Prevent unusually large jumps
    // --------------------------------------------------------------

    frameStep =
      Math.max(
        -MAX_FRAME_STEP,
        Math.min(
          MAX_FRAME_STEP,
          frameStep
        )
      );


    currentFrameIndex +=
      frameStep;


  } else {

    currentFrameIndex =
      targetFrameIndex;
  }


  drawFrame(
    currentFrameIndex
  );


  requestAnimationFrame(
    tick
  );
}


// ============================================================================
// Resize
// ============================================================================

window.addEventListener(
  "resize",
  () => {

    updateScrollSpacer();

    resizeCanvas();

    updateTargetFromScroll();
  }
);


// ============================================================================
// Initialization
// ============================================================================
//
// Must fetch the frames manifest first - everything below (scroll spacer
// sizing, target/current frame clamping, preloading) depends on knowing
// TOTAL_FRAMES and the real filenames.
//

loadFramesManifest().then(() => {

  updateScrollSpacer();

  resizeCanvas();

  updateTargetFromScroll();


  // ------------------------------------------------------------------------
  // Start directly at current scroll position
  // ------------------------------------------------------------------------

  currentFrameIndex =
    targetFrameIndex;


  // ==========================================================================
  // Start
  // ==========================================================================

  preloadImages().then(() => {

  drawCurrentFrame();


  // Door-opening transition: the two .door panels and the logo/percentage
  // both animate off via the "open" class (see index.html), revealing the
  // canvas underneath. Fully remove the overlay once the CSS transition
  // ends so it can't block clicks/scroll.
  loadingEl.classList.add(
    "open"
  );

  // Matches the door's 1.1s transition (index.html). A plain timeout
  // instead of "transitionend" - that event bubbles from every
  // transitioning child (doors AND the faster-fading content), and the
  // first one to finish would remove the overlay before the doors do.
  setTimeout(
    () => {
      loadingEl.style.display =
        "none";
    },
    1100
  );


  requestAnimationFrame(
    tick
  );
  });

});
