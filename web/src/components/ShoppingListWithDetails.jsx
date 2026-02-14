// web/src/components/ShoppingListWithDetails.jsx
// =============================================================================
// ShoppingListWithDetails — Shopping list with product cards and detail modal
//
// REDESIGN: Category selector now uses Calendar-Strip style (Concept D)
// matching the "Your Nutrition" day selector. Full dark/light mode support.
//
// FIXES PRESERVED:
// 1. KEY LOOKUP: Use item.normalizedKey (from backend normalizeKey()) instead
//    of item.originalIngredient.toLowerCase().trim() — the results object is
//    keyed by snake_case normalizedKey, not by lowercase original ingredient.
//    This was the primary cause of most products not appearing.
// 2. PRICE FILTER REMOVED: The old .filter(p => p.price !== null) silently
//    dropped every ingredient whose lookup failed or had price=0.
//    All ingredients now render; items without price show "N/A".
// 3. PRICE=0 FIX: parseFloat guard now treats 0 as a valid price.
// 4. isOpen PROP: Confirmed !!selectedProductModal (not inverted).
// =============================================================================

import React, { useState, useMemo } from 'react';
import { 
  ShoppingBag, 
  Copy,
  Printer,
  Share2
} from 'lucide-react';
import IngredientCard from './IngredientCard';
import ProductDetailModal from './ProductDetailModal';

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
  const products = useMemo(() => {
    return ingredients.map((item, idx) => {
      // FIX 1: Use item.normalizedKey (backend snake_case key) for the results lookup.
      const normalizedKey = item.normalizedKey || item.originalIngredient?.toLowerCase().trim();
      const result = results[normalizedKey] || {};
      const allProducts = result.allProducts || result.products || [];
      const selectedIndex = result.selectedIndex ?? 0;
      const selectedProduct = allProducts[selectedIndex];

      // FIX 3: parseFloat guard treats 0 as valid
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
    // FIX 2: No .filter(p => p.price !== null)
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

    const allProducts = freshResult.allProducts || freshResult.products || [];
    const selectedIndex = freshResult.selectedIndex ?? 0;
    const currentSelection = allProducts[selectedIndex];

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

  const handleSelectSubstitute = (normalizedKey, substitute) => {
    if (onSelectSubstitute) {
      onSelectSubstitute(normalizedKey, substitute);
    }
    setSelectedProductModal(null);
  };

  return (
    <div style={{
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: '20px',
      maxWidth: '800px',
      margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '20px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 8px 24px rgba(102, 126, 234, 0.25)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '14px',
              padding: '12px',
              marginRight: '16px',
              backdropFilter: 'blur(10px)',
            }}>
              <ShoppingBag size={28} color="#ffffff" />
            </div>
            <div>
              <h2 style={{
                fontSize: '22px',
                fontWeight: '700',
                color: '#ffffff',
                margin: '0 0 4px 0',
              }}>
                Shopping List
              </h2>
              <p style={{
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.75)',
                margin: 0,
              }}>
                {products.length} items from {actualStoreName}
              </p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#ffffff',
              margin: '0 0 2px 0',
              lineHeight: 1,
            }}>
              ${totalCost.toFixed(2)}
            </p>
            <p style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.65)',
              margin: 0,
            }}>
              Total Cost
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { Icon: Copy, label: 'Copy', onClick: handleCopyList },
            { Icon: Printer, label: 'Print', onClick: handlePrint },
            { Icon: Share2, label: 'Share', onClick: handleShare },
          ].map(({ Icon, label, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="shopping-action-button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1.5px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '12px',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backdropFilter: 'blur(10px)',
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ════════ Category Selector — Calendar Strip Style (Concept D) ════════ */}
      <div style={{ marginBottom: '20px' }}>
        <div className="cat-strip-wrapper">
          <div className="cat-strip">
            {categories.map(({ id, label, count }) => {
              const isActive = activeCategory === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveCategory(id)}
                  className={`cat-strip__item ${isActive ? 'cat-strip__item--active' : ''}`}
                >
                  <span className="cat-strip__count">{count}</span>
                  <span className="cat-strip__label">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Product list */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        {filteredProducts.length === 0 ? (
          <div className="shopping-empty-state">
            <ShoppingBag 
              size={48} 
              className="shopping-empty-state__icon"
            />
            <div className="shopping-empty-state__title">
              No {activeCategory !== 'all' ? activeCategory : ''} items yet
            </div>
            <div className="shopping-empty-state__text">
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

      {/* Product Detail Modal — FIX 4: isOpen is !!selectedProductModal (not inverted) */}
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

      {/* Styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        
        * { box-sizing: border-box; }


        /* ==============================================
           CATEGORY SELECTOR — Calendar Strip (Concept D)
           Mirrors the MealPlanDisplay .mpd-cal-strip
           ============================================== */

        .cat-strip-wrapper {
          /* Negative margin trick to bleed into container edges, matching mpd-cal-strip-wrapper */
        }

        .cat-strip {
          display: flex;
          gap: 8px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 14px;
          border: 1px solid var(--color-border, #2d3148);
          overflow-x: auto;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .cat-strip::-webkit-scrollbar { display: none; }

        /* Light mode strip */
        [data-theme="light"] .cat-strip {
          background: rgba(99, 102, 241, 0.04);
          border-color: #e0e7ff;
        }


        /* ── Individual category cell ── */

        .cat-strip__item {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 10px 14px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.25s ease;
          flex-shrink: 0;
          min-width: 56px;
          border: 1px solid transparent;
          background: transparent;
          font-family: inherit;
          -webkit-tap-highlight-color: transparent;
        }

        .cat-strip__item:hover:not(.cat-strip__item--active) {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.08);
        }

        [data-theme="light"] .cat-strip__item:hover:not(.cat-strip__item--active) {
          background: rgba(99, 102, 241, 0.06);
          border-color: rgba(99, 102, 241, 0.12);
        }

        .cat-strip__item:active {
          transform: scale(0.95);
        }


        /* ── Active state — gradient background matching Cheffy brand ── */

        .cat-strip__item--active {
          background: linear-gradient(135deg, #6366f1, #a855f7);
          border-color: rgba(99, 102, 241, 0.4);
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.35);
        }

        [data-theme="light"] .cat-strip__item--active {
          background: linear-gradient(135deg, #6366f1, #a855f7);
          border-color: transparent;
          box-shadow: 0 3px 12px rgba(99, 102, 241, 0.35);
        }


        /* ── Count number ── */

        .cat-strip__count {
          font-size: 16px;
          font-weight: 700;
          color: #e8eaf0;
          line-height: 1;
          margin-bottom: 3px;
          font-family: 'DM Sans', -apple-system, sans-serif;
        }

        .cat-strip__item--active .cat-strip__count {
          color: #ffffff;
        }

        [data-theme="light"] .cat-strip__count {
          color: #374151;
        }

        [data-theme="light"] .cat-strip__item--active .cat-strip__count {
          color: #ffffff;
        }


        /* ── Category label ── */

        .cat-strip__label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #7b809a;
          font-weight: 600;
          line-height: 1;
        }

        .cat-strip__item--active .cat-strip__label {
          color: rgba(255, 255, 255, 0.85);
        }

        [data-theme="light"] .cat-strip__label {
          color: #9ca3af;
        }

        [data-theme="light"] .cat-strip__item--active .cat-strip__label {
          color: rgba(255, 255, 255, 0.85);
        }


        /* ==============================================
           EMPTY STATE — Dark/Light mode aware
           ============================================== */

        .shopping-empty-state {
          text-align: center;
          padding: 60px 20px;
          background: var(--color-bg-card, #1e2130);
          border-radius: 16px;
          border: 2px dashed var(--color-border, #2d3148);
        }

        [data-theme="light"] .shopping-empty-state {
          background: #ffffff;
          border-color: #e2e8f0;
        }

        .shopping-empty-state__icon {
          color: var(--color-text-tertiary, #6b7280);
          margin: 0 auto 16px;
          display: block;
        }

        .shopping-empty-state__title {
          font-size: 18px;
          font-weight: 600;
          color: var(--color-text-primary, #f0f1f5);
          margin-bottom: 8px;
        }

        [data-theme="light"] .shopping-empty-state__title {
          color: #4a5568;
        }

        .shopping-empty-state__text {
          font-size: 14px;
          color: var(--color-text-secondary, #9ca3b0);
        }

        [data-theme="light"] .shopping-empty-state__text {
          color: #718096;
        }


        /* ==============================================
           EXISTING STYLES (preserved)
           ============================================== */

        .shopping-action-button:hover {
          background: rgba(255, 255, 255, 0.3) !important;
          transform: translateY(-1px);
        }
        .shopping-action-button:active { transform: translateY(0); }

        @media (max-width: 768px) {
          .shopping-action-button span { display: none; }
          .shopping-action-button {
            min-width: 44px !important;
            padding: 12px !important;
          }
        }
        
        @media print {
          body { background: white !important; }
          .shopping-action-button,
          .cat-strip-wrapper { display: none !important; }
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