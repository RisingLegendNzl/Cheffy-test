// web/src/components/ShoppingListWithDetails.jsx
// =============================================================================
// ShoppingListWithDetails — Shopping list with product cards and detail modal
//
// REDESIGN v2: Category selector now lives INSIDE the Shopping List section
// card as a native sub-section, exactly mirroring how the CalendarStripSelector
// lives inside the mpd-section-card in MealPlanDisplay.
//
// Structure:
//   .sld-section-card               ← mirrors .mpd-section-card
//     .sld-header                   ← gradient header area
//     .sld-cat-strip-wrapper        ← mirrors .mpd-cal-strip-wrapper (bleed trick)
//       .sld-cat-strip              ← mirrors .mpd-cal-strip
//         .sld-cat-cell             ← mirrors .mpd-cal-day
//           .sld-cat-count          ← mirrors .mpd-cal-num
//           .sld-cat-label          ← mirrors .mpd-cal-dow
//   Product list (outside card)
//
// FIXES:
//   - handleSelectSubstitute NO LONGER closes the modal so users can
//     swap products inline.
//   - Both `products` and `modalProductData` memos now honour
//     `currentSelectionURL` (set by useAppLogic.handleSubstituteSelection)
//     falling back to `selectedIndex → 0` when not set.
// =============================================================================

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ShoppingBag, 
  Copy,
  Printer,
  Share2
} from 'lucide-react';
import IngredientCard from './IngredientCard';
import ProductDetailModal from './ProductDetailModal';

// ── Helper: resolve the "selected" product from a result object ──────────
// Priority: currentSelectionURL match → selectedIndex → first product
const resolveSelectedProduct = (result) => {
  const allProducts = result?.allProducts || result?.products || [];
  if (allProducts.length === 0) return { allProducts, selectedProduct: null };

  // 1. Match by currentSelectionURL (set after a substitute swap)
  if (result?.currentSelectionURL) {
    const match = allProducts.find(p => p?.url === result.currentSelectionURL);
    if (match) return { allProducts, selectedProduct: match };
  }

  // 2. Fall back to selectedIndex (initial backend selection)
  const idx = result?.selectedIndex ?? 0;
  return { allProducts, selectedProduct: allProducts[idx] || allProducts[0] };
};


const ShoppingListWithDetails = ({ 
  ingredients = [],
  results = {},
  totalCost = 0,
  storeName = 'Woolworths',
  onShowToast = () => {},
  onSelectSubstitute,
  onQuantityChange,
  onFetchNutrition,
  nutritionCache = {},
  loadingNutritionFor = null,
  categorizedResults = {}
}) => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedProductModal, setSelectedProductModal] = useState(null);
  const stripRef = useRef(null);

  // Auto-scroll active category into view
  useEffect(() => {
    if (!stripRef.current) return;
    const activeEl = stripRef.current.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeCategory]);

  // Store name detection
  const actualStoreName = useMemo(() => {
    for (const [key, result] of Object.entries(results)) {
      const products = result.allProducts || result.products || [];
      for (const product of products) {
        if (!product) continue;
        if (product.store) return product.store;
        if (product.url) {
          if (product.url.includes('woolworths')) return 'Woolworths';
          if (product.url.includes('coles')) return 'Coles';
          if (product.url.includes('aldi')) return 'ALDI';
        }
      }
    }
    return storeName || 'Woolworths';
  }, [results, storeName]);

  // Transform ingredients into product cards
  // FIX: Uses resolveSelectedProduct which honours currentSelectionURL
  const products = useMemo(() => {
    return ingredients.map((item, idx) => {
      const normalizedKey = item.normalizedKey || item.originalIngredient?.toLowerCase().trim();
      const result = results[normalizedKey] || {};
      const { allProducts, selectedProduct } = resolveSelectedProduct(result);

      let price = null;
      if (selectedProduct) {
        const rawPrice = selectedProduct.product_price ?? selectedProduct.price;
        if (rawPrice !== null && rawPrice !== undefined) {
          const parsed = parseFloat(rawPrice);
          if (!isNaN(parsed)) {
            price = parsed;
          }
        }
      }

      const size = selectedProduct?.product_size || selectedProduct?.size || null;

      const cheapest = allProducts.reduce((best, current) => {
        if (!current) return best;
        return (current.unit_price_per_100 ?? Infinity) < (best?.unit_price_per_100 ?? Infinity)
          ? current : best;
      }, allProducts[0]);

      const isCheapest = selectedProduct && cheapest && selectedProduct?.url === cheapest?.url;

      return {
        id: `${normalizedKey}-${idx}`,
        normalizedKey,
        name: item.originalIngredient || 'Unknown',
        price,
        size,
        cheapest: isCheapest,
        category: item.category || 'uncategorized',
      };
    });
  }, [ingredients, results]);

  // Categorize products
  const categorizedProducts = useMemo(() => {
    const cats = {};
    products.forEach(product => {
      const cat = product.category || 'uncategorized';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(product);
    });
    return cats;
  }, [products]);

  const categories = useMemo(() => {
    const cats = [{ id: 'all', label: 'All', count: products.length }];
    Object.entries(categorizedProducts).forEach(([cat, items]) => {
      cats.push({
        id: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        count: items.length,
      });
    });
    return cats;
  }, [categorizedProducts, products.length]);

  const filteredProducts = useMemo(() => {
    if (activeCategory === 'all') return products;
    return categorizedProducts[activeCategory] || [];
  }, [activeCategory, products, categorizedProducts]);

  // Modal data computation
  // FIX: Uses resolveSelectedProduct which honours currentSelectionURL
  const modalProductData = useMemo(() => {
    if (!selectedProductModal) return null;

    const freshResult = results[selectedProductModal];
    if (!freshResult) {
      return {
        ingredientKey: selectedProductModal,
        normalizedKey: selectedProductModal,
        result: { source: 'failed' },
        currentSelection: null,
        absoluteCheapestProduct: null,
        substitutes: [],
        currentQuantity: 1,
      };
    }

    const { allProducts, selectedProduct: currentSelection } = resolveSelectedProduct(freshResult);

    const cheapest = allProducts.reduce((best, current) => {
      if (!current) return best;
      return (current.unit_price_per_100 ?? Infinity) < (best?.unit_price_per_100 ?? Infinity) 
        ? current : best;
    }, allProducts[0]);
    
    const substitutes = allProducts
      .filter(p => p && p.url !== currentSelection?.url)
      .sort((a, b) => (a.unit_price_per_100 ?? Infinity) - (b.unit_price_per_100 ?? Infinity));

    return {
      ingredientKey: selectedProductModal,
      normalizedKey: selectedProductModal,
      result: freshResult,
      currentSelection,
      absoluteCheapestProduct: cheapest,
      substitutes,
      currentQuantity: freshResult.userQuantity || 1,
    };
  }, [selectedProductModal, results]);

  const handleCopyList = async () => {
    try {
      const text = products.map(p => {
        const priceStr = p.price !== null ? `$${p.price.toFixed(2)}` : 'N/A';
        const sizeStr = p.size ? ` (${p.size})` : '';
        return `${p.name} - ${priceStr}${sizeStr}`;
      }).join('\n');

      await navigator.clipboard.writeText(
        `${actualStoreName} Shopping List\nTotal: $${totalCost.toFixed(2)}\n${'─'.repeat(30)}\n${text}`
      );
      if (onShowToast) onShowToast('Shopping list copied to clipboard!', 'success');
    } catch (err) {
      console.error('Copy failed:', err);
      if (onShowToast) onShowToast('Failed to copy list');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${actualStoreName} Shopping List`,
          text: `Shopping list with ${products.length} items - Total: $${totalCost.toFixed(2)}`,
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    } else {
      handleCopyList();
    }
  };

  const handleViewProduct = (normalizedKey) => {
    setSelectedProductModal(normalizedKey);
  };

  const handleCloseModal = () => {
    setSelectedProductModal(null);
  };

  // FIX: No longer closes the modal after a substitute swap.
  // The modal stays open so users can see the updated selection in-place.
  // The `results` prop update (from useAppLogic.handleSubstituteSelection)
  // triggers a re-compute of `modalProductData` via the useMemo above,
  // which will now reflect the new currentSelectionURL.
  const handleSelectSubstitute = (normalizedKey, substitute) => {
    if (onSelectSubstitute) {
      onSelectSubstitute(normalizedKey, substitute);
    }
    // Modal stays open — removed: setSelectedProductModal(null);
  };

  return (
    <div className="sld-root">

      {/* ════════════════════════════════════════════════════════════════════════
           SECTION CARD — mirrors .mpd-section-card
           Contains: header + action buttons + category strip as unified component
           ════════════════════════════════════════════════════════════════════════ */}
      <div className="sld-section-card">

        {/* ── Header area ── */}
        <div className="sld-header">
          <div className="sld-header-left">
            <div className="sld-header-icon">
              <ShoppingBag size={22} color="#ffffff" />
            </div>
            <div>
              <h2 className="sld-header-title">Shopping List</h2>
              <p className="sld-header-sub">
                {products.length} items from {actualStoreName}
              </p>
            </div>
          </div>
          <div className="sld-header-right">
            <p className="sld-header-total">${totalCost.toFixed(2)}</p>
            <p className="sld-header-total-label">Total Cost</p>
          </div>
        </div>

        {/* ── Action Buttons — styled like mpd-copy-btn ── */}
        <div className="sld-actions">
          {[
            { Icon: Copy, label: 'Copy', onClick: handleCopyList },
            { Icon: Printer, label: 'Print', onClick: handlePrint },
            { Icon: Share2, label: 'Share', onClick: handleShare },
          ].map(({ Icon, label, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="sld-action-btn"
            >
              <Icon size={15} />
              <span className="sld-action-btn__label">{label}</span>
            </button>
          ))}
        </div>

        {/* ── Category Strip — mirrors .mpd-cal-strip-wrapper / .mpd-cal-strip ──
             Uses the same negative-margin bleed trick so the strip sits
             edge-to-edge within the section card's 22px padding.
        ── */}
        <div className="sld-cat-strip-wrapper">
          <div ref={stripRef} className="sld-cat-strip">
            {categories.map(({ id, label, count }) => {
              const isActive = activeCategory === id;
              return (
                <button
                  key={id}
                  data-active={isActive}
                  onClick={() => setActiveCategory(id)}
                  className={`sld-cat-cell ${isActive ? 'sld-cat-cell--active' : ''}`}
                >
                  <span className="sld-cat-count">{count}</span>
                  <span className="sld-cat-label">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

      </div>
      {/* ── end .sld-section-card ── */}


      {/* ════════ Product list ════════ */}
      <div className="sld-product-list">
        {filteredProducts.length === 0 ? (
          <div className="sld-empty-state">
            <ShoppingBag size={48} className="sld-empty-state__icon" />
            <div className="sld-empty-state__title">
              No {activeCategory !== 'all' ? activeCategory : ''} items yet
            </div>
            <div className="sld-empty-state__text">
              Add items to your list to get started
            </div>
          </div>
        ) : (
          filteredProducts.map((product, index) => (
            <IngredientCard
              key={product.id}
              ingredientName={product.name}
              price={product.price}
              size={product.size}
              isCheapest={product.cheapest}
              onViewProduct={() => handleViewProduct(product.normalizedKey)}
              index={index}
            />
          ))
        )}
      </div>

      {/* ════════ Product Detail Modal ════════ */}
      {modalProductData && (
        <ProductDetailModal
          isOpen={!!selectedProductModal}
          onClose={handleCloseModal}
          ingredientKey={modalProductData.ingredientKey}
          normalizedKey={modalProductData.normalizedKey}
          result={modalProductData.result}
          currentSelection={modalProductData.currentSelection}
          absoluteCheapestProduct={modalProductData.absoluteCheapestProduct}
          substitutes={modalProductData.substitutes}
          currentQuantity={modalProductData.currentQuantity}
          onSelectSubstitute={handleSelectSubstitute}
          onQuantityChange={onQuantityChange}
        />
      )}


      {/* ════════════════════════════════════════════════════════════════════════
           SCOPED STYLES
           ════════════════════════════════════════════════════════════════════════
           Every value below is copied verbatim from MealPlanDisplay's inline
           <style> block and mpd-theme-override.css so the Shopping List card
           is a pixel-perfect sibling of the Nutrition card.
           ════════════════════════════════════════════════════════════════════════ */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }

        .sld-root {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 16px;
          max-width: 800px;
          margin: 0 auto;
        }


        /* ==========================================================
           SECTION CARD
           Source: .mpd-section-card { background: #1a1d2a;
             border-radius: 20px; padding: 22px; border: 1px solid #262a3a; }
           ========================================================== */

        .sld-section-card {
          background: #1a1d2a;
          border-radius: 20px;
          padding: 22px;
          border: 1px solid #262a3a;
          margin-bottom: 20px;
          box-shadow:
            0 4px 16px rgba(0, 0, 0, 0.35),
            0 0 0 1px rgba(99, 102, 241, 0.08);
        }

        /* Source: mpd-theme-override.css [data-theme="light"] .mpd-section-card */
        [data-theme="light"] .sld-section-card {
          background: linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%);
          border: 1px solid #e0e7ff;
          box-shadow:
            0 2px 8px rgba(99, 102, 241, 0.06),
            0 0 0 1px rgba(99, 102, 241, 0.04);
        }


        /* ==========================================================
           HEADER — mirrors .mpd-header layout
           ========================================================== */

        .sld-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .sld-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .sld-header-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          flex-shrink: 0;
        }

        /* Source: .mpd-header-title { font-size: 1.15rem; font-weight: 700; color: #f0f1f5; } */
        .sld-header-title {
          font-size: 1.15rem;
          font-weight: 700;
          color: #f0f1f5;
          line-height: 1.2;
          margin: 0;
        }

        /* Source: mpd-theme-override.css [data-theme="light"] .mpd-header-title */
        [data-theme="light"] .sld-header-title {
          color: #1f2937;
        }

        /* Source: .mpd-header-sub { font-size: 0.75rem; color: #7b809a; } */
        .sld-header-sub {
          font-size: 0.75rem;
          color: #7b809a;
          margin: 1px 0 0 0;
        }

        [data-theme="light"] .sld-header-sub {
          color: #6b7280;
        }

        .sld-header-right {
          text-align: right;
          flex-shrink: 0;
        }

        .sld-header-total {
          font-size: 1.6rem;
          font-weight: 700;
          color: #f0f1f5;
          line-height: 1;
          margin: 0 0 2px 0;
          font-variant-numeric: tabular-nums;
        }

        [data-theme="light"] .sld-header-total {
          color: #1f2937;
        }

        .sld-header-total-label {
          font-size: 0.7rem;
          color: #7b809a;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
        }

        [data-theme="light"] .sld-header-total-label {
          color: #9ca3af;
        }


        /* ==========================================================
           ACTION BUTTONS — mirrors .mpd-copy-btn
           Source: .mpd-copy-btn { padding: 8px 14px; border-radius: 10px;
             background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.2);
             color: #818cf8; font-size: 0.78rem; font-weight: 600; }
           ========================================================== */

        .sld-actions {
          display: flex;
          gap: 6px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .sld-action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 10px;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.2);
          color: #818cf8;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }

        .sld-action-btn:hover {
          background: rgba(99, 102, 241, 0.22);
        }

        /* Source: mpd-theme-override.css [data-theme="light"] .mpd-copy-btn */
        [data-theme="light"] .sld-action-btn {
          background: rgba(99, 102, 241, 0.08);
          border-color: rgba(99, 102, 241, 0.18);
          color: #4f46e5;
        }

        [data-theme="light"] .sld-action-btn:hover {
          background: rgba(99, 102, 241, 0.15);
        }


        /* ==========================================================
           CATEGORY STRIP
           Source: .mpd-cal-strip-wrapper { margin: 0 -22px 18px; padding: 0 22px; }
           Source: .mpd-cal-strip { display: flex; gap: 8px; padding: 8px;
             background: rgba(255,255,255,0.04); border-radius: 14px;
             border: 1px solid #262a3a; overflow-x: auto; }
           ========================================================== */

        .sld-cat-strip-wrapper {
          margin: 0 -22px 0;
          padding: 0 22px;
        }

        .sld-cat-strip {
          display: flex;
          gap: 8px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 14px;
          border: 1px solid #262a3a;
          overflow-x: auto;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .sld-cat-strip::-webkit-scrollbar { display: none; }

        /* Source: mpd-theme-override.css [data-theme="light"] .mpd-cal-strip */
        [data-theme="light"] .sld-cat-strip {
          background: rgba(99, 102, 241, 0.04);
          border-color: #e0e7ff;
        }


        /* ==========================================================
           CATEGORY CELL
           Source: .mpd-cal-day { display: flex; flex-direction: column;
             align-items: center; padding: 8px 12px; border-radius: 12px;
             cursor: pointer; transition: all 0.25s ease; flex-shrink: 0;
             min-width: 50px; border: 1px solid transparent; background: transparent; }
           ========================================================== */

        .sld-cat-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 12px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.25s ease;
          flex-shrink: 0;
          min-width: 50px;
          border: 1px solid transparent;
          background: transparent;
          font-family: inherit;
        }

        .sld-cat-cell:hover:not(.sld-cat-cell--active) {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.06);
        }

        /* Source: mpd-theme-override.css [data-theme="light"] .mpd-cal-day:hover */
        [data-theme="light"] .sld-cat-cell:hover:not(.sld-cat-cell--active) {
          background: rgba(99, 102, 241, 0.06);
          border-color: rgba(99, 102, 241, 0.12);
        }

        /* Source: .mpd-cal-day--active { background: linear-gradient(135deg, #6366f1, #a855f7);
             border-color: transparent; box-shadow: 0 3px 12px rgba(99,102,241,0.35); } */
        .sld-cat-cell--active {
          background: linear-gradient(135deg, #6366f1, #a855f7);
          border-color: transparent;
          box-shadow: 0 3px 12px rgba(99, 102, 241, 0.35);
        }


        /* ── Category count ──
           Source: .mpd-cal-num { font-family: 'DM Sans'; font-size: 1.15rem;
             font-weight: 700; color: #e8eaf0; line-height: 1; }
           Source: .mpd-cal-day--active .mpd-cal-num { color: #ffffff; }
        */

        .sld-cat-count {
          font-family: 'DM Sans', -apple-system, sans-serif;
          font-size: 1.15rem;
          font-weight: 700;
          color: #e8eaf0;
          line-height: 1;
        }

        .sld-cat-cell--active .sld-cat-count {
          color: white;
        }

        /* Source: mpd-theme-override.css [data-theme="light"] .mpd-cal-num { color: #374151; } */
        [data-theme="light"] .sld-cat-count {
          color: #374151;
        }

        [data-theme="light"] .sld-cat-cell--active .sld-cat-count {
          color: #ffffff;
        }


        /* ── Category label ──
           Source: .mpd-cal-dow { font-size: 0.6rem; text-transform: uppercase;
             letter-spacing: 0.12em; color: #7b809a; margin-bottom: 3px;
             font-weight: 600; }
           Source: .mpd-cal-day--active .mpd-cal-dow { color: rgba(255,255,255,0.8); }
        */

        .sld-cat-label {
          font-size: 0.6rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #7b809a;
          margin-top: 3px;
          font-weight: 600;
          line-height: 1;
        }

        .sld-cat-cell--active .sld-cat-label {
          color: rgba(255, 255, 255, 0.8);
        }

        /* Source: mpd-theme-override.css [data-theme="light"] .mpd-cal-dow { color: #9ca3af; } */
        [data-theme="light"] .sld-cat-label {
          color: #9ca3af;
        }

        /* Source: mpd-theme-override.css [data-theme="light"] .mpd-cal-day--active .mpd-cal-dow */
        [data-theme="light"] .sld-cat-cell--active .sld-cat-label {
          color: rgba(255, 255, 255, 0.85);
        }


        /* ==========================================================
           PRODUCT LIST
           ========================================================== */

        .sld-product-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }


        /* ==========================================================
           EMPTY STATE — theme-aware
           ========================================================== */

        .sld-empty-state {
          text-align: center;
          padding: 60px 20px;
          background: var(--color-bg-card, #1e2130);
          border-radius: 16px;
          border: 2px dashed var(--color-border, #2d3148);
        }

        [data-theme="light"] .sld-empty-state {
          background: #ffffff;
          border-color: #e2e8f0;
        }

        .sld-empty-state__icon {
          color: var(--color-text-tertiary, #6b7280);
          margin: 0 auto 16px;
          display: block;
        }

        .sld-empty-state__title {
          font-size: 18px;
          font-weight: 600;
          color: var(--color-text-primary, #f0f1f5);
          margin-bottom: 8px;
        }

        [data-theme="light"] .sld-empty-state__title {
          color: #4a5568;
        }

        .sld-empty-state__text {
          font-size: 14px;
          color: var(--color-text-secondary, #9ca3b0);
        }

        [data-theme="light"] .sld-empty-state__text {
          color: #718096;
        }


        /* ==========================================================
           RESPONSIVE
           ========================================================== */

        @media (max-width: 768px) {
          .sld-action-btn__label { display: none; }
          .sld-action-btn {
            min-width: 40px;
            padding: 10px;
            justify-content: center;
          }
        }

        @media (max-width: 400px) {
          .sld-header-total {
            font-size: 1.3rem;
          }
          .sld-header-title {
            font-size: 1rem;
          }
        }


        /* ==========================================================
           PRINT
           ========================================================== */

        @media print {
          body { background: white !important; }
          .sld-actions,
          .sld-cat-strip-wrapper { display: none !important; }
          .sld-section-card {
            background: white !important;
            border-color: #e5e7eb !important;
            box-shadow: none !important;
            color: #111 !important;
          }
          .sld-header-title,
          .sld-header-total { color: #111 !important; }
          .glass-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};

export default ShoppingListWithDetails;