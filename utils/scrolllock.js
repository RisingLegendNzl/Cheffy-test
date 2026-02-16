// web/src/utils/scrollLock.js
// =============================================================================
// Ref-counted Body Scroll Lock
//
// Multiple overlays (RecipeModal, VoiceCookingOverlay, ProductDetailModal,
// SavedPlansModal, etc.) can be open simultaneously. Each one needs to lock
// body scroll, but only the LAST one to close should restore the original
// body styles.
//
// Previously, each overlay independently saved & restored document.body
// styles. When two overlays were open at once (e.g. RecipeModal + Voice
// Cooking), the second overlay's cleanup would restore body to the state
// it was in when the second overlay opened — which was already "locked" by
// the first overlay. This left the body in a permanent position:fixed
// state after both overlays closed, freezing all navigation.
//
// This module solves it with a simple counter:
//   acquireScrollLock()  — increments count; locks body on first call
//   releaseScrollLock()  — decrements count; restores body when count hits 0
//
// Usage in any overlay component:
//   useEffect(() => {
//       acquireScrollLock();
//       return () => releaseScrollLock();
//   }, []);
// =============================================================================

let lockCount = 0;
let savedStyles = null;
let savedScrollY = 0;

/**
 * Lock body scroll. Safe to call multiple times — only the first call
 * actually modifies the DOM. Subsequent calls just increment the counter.
 */
export function acquireScrollLock() {
    if (lockCount === 0) {
        savedScrollY = window.scrollY;
        savedStyles = {
            overflow: document.body.style.overflow,
            position: document.body.style.position,
            width: document.body.style.width,
            top: document.body.style.top,
            height: document.body.style.height,
        };

        document.body.style.position = 'fixed';
        document.body.style.top = `-${savedScrollY}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
        document.body.style.height = '100%';
    }
    lockCount += 1;
}

/**
 * Release one scroll lock. Only restores body styles when the last lock
 * is released (lockCount drops to 0).
 */
export function releaseScrollLock() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0 && savedStyles) {
        document.body.style.overflow = savedStyles.overflow;
        document.body.style.position = savedStyles.position;
        document.body.style.width = savedStyles.width;
        document.body.style.top = savedStyles.top;
        document.body.style.height = savedStyles.height;
        window.scrollTo(0, savedScrollY);
        savedStyles = null;
    }
}