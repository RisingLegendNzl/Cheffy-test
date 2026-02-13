// web/src/components/StickyTabs.jsx
// ============================================================================
// StickyTabs — NO-OP WRAPPER (Concept 2: Welded Segmented Tabs)
//
// The tab bar is now rendered INSIDE Header.jsx as a single welded block.
// This component exists solely to keep MainApp.jsx's import and JSX intact.
// It renders nothing — all tab logic and UI lives in Header.
//
// WHY:
//  Two separate fixed elements (Header at z:1020, StickyTabs at z:990)
//  could never be gap-free because:
//   1. Header height changes dynamically (80px → 64px on scroll)
//   2. The height is relayed via state (onHeaderHeightChange → headerHeight)
//   3. React state updates + CSS transitions = timing mismatch = gap
//
//  By embedding tabs inside the Header's own <header> element, both
//  share the same positioned container, background, and border.
//  The gap is structurally impossible.
//
// PROPS (accepted but ignored — kept for API compatibility):
//  - activeTab    {string}
//  - onTabChange  {func}
//  - hidden       {bool}
//  - disabled     {bool}
//  - headerHeight {number}
// ============================================================================

const StickyTabs = () => null;

export default StickyTabs;