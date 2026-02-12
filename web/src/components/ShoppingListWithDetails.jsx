// web/src/components/ShoppingListWithDetails.jsx
// =============================================================================
// ShoppingListWithDetails — Shopping list with product cards and detail modal
//
// FIXES APPLIED:
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
      // The old code did item.originalIngredient?.toLowerCase().trim() which produced
      // "chicken breast" but results is keyed by "chicken_breast". This mismatch
      // caused most items to silently fail the lookup and get filtered out.
      const normalizedKey = item.normalizedKey || item.originalIngredient?.toLowerCase().trim();
      const result = results[normalizedKey] || {};
      const allProducts = result.allProducts || result.products || [];
      const selectedIndex = result.selectedIndex ?? 0;
      const selectedProduct = allProducts[selectedIndex];

      const rawPrice = selectedProduct?.price ?? selectedProduct?.current_price ?? selectedProduct?.product_price;
      const size = selectedProduct?.size || selectedProduct?.product_size || selectedProduct?.package_size;
      
      // FIX 3: parseFloat properly — treat 0 as a valid price, only null/undefined/NaN → null
      const parsedPrice = rawPrice != null ? parseFloat(rawPrice) : null;
      const price = (parsedPrice !== null && !isNaN(parsedPrice)) ? parsedPrice : null;

      // Find absolute cheapest
      const cheapest = allProducts.reduce((best, current) => {
        if (!current) return best;
        const currentPrice = current.unit_price_per_100 ?? Infinity;
        const bestPrice = best?.unit_price_per_100 ?? Infinity;
        return currentPrice < bestPrice ? current : best;
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
    // FIX 2: No .filter(p => p.price !== null) — show ALL ingredients,
    // even those without a resolved price. IngredientCard handles null price gracefully.
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
      .sort((a, b) => (a.unit_price_per_100 ?? Infinity) - (b.unit_price_per_100 ?? Infinity))
      .slice(0, 5);

    return {
      ingredientKey: freshResult.originalIngredient || selectedProductModal,
      normalizedKey: selectedProductModal,
      result: freshResult,
      currentSelection,
      absoluteCheapestProduct: cheapest,
      substitutes,
      currentQuantity: freshResult.userQuantity || 1
    };
  }, [selectedProductModal, results]);

  // Event handlers
  const handleCopyList = async () => {
    let text = `Shopping List - ${actualStoreName}\n`;
    text += `Total Cost: $${totalCost.toFixed(2)}\n`;
    text += `Items: ${products.length}\n`;
    text += '='.repeat(40) + '\n\n';

    Object.entries(categorizedResults).forEach(([category, items]) => {
      text += `${category.toUpperCase()}\n`;
      text += '-'.repeat(40) + '\n';
      items.forEach(({ ingredient }) => {
        text += `☐ ${ingredient}\n`;
      });
      text += '\n';
    });

    try {
      await navigator.clipboard.writeText(text);
      if (onShowToast) onShowToast('Shopping list copied to clipboard!');
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
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShoppingBag size={28} color="#ffffff" />
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#ffffff',
              margin: 0,
            }}>
              Shopping List
            </h2>
          </div>
          <div style={{
            background: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            padding: '8px 16px',
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.9)',
              fontWeight: '500',
              marginBottom: '2px',
            }}>
              {actualStoreName}
            </div>
            <div style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#ffffff',
            }}>
              ${totalCost.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          {[
            { icon: Copy, label: 'Copy', onClick: handleCopyList },
            { icon: Printer, label: 'Print', onClick: handlePrint },
            { icon: Share2, label: 'Share', onClick: handleShare },
          ].map(({ icon: Icon, label, onClick }) => (
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

      {/* Category filters */}
      <div style={{ marginBottom: '20px' }}>
        <div
          className="shopping-category-pills"
          style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '8px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {categories.map(({ id, label, count }) => {
            const isActive = activeCategory === id;
            return (
              <button
                key={id}
                onClick={() => setActiveCategory(id)}
                className={`shopping-pill ${isActive ? 'active' : ''}`}
                style={{
                  flexShrink: 0,
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: isActive ? '1.5px solid #667eea' : '1.5px solid #e2e8f0',
                  background: isActive ? 'linear-gradient(135deg, #667eea, #764ba2)' : '#ffffff',
                  color: isActive ? '#ffffff' : '#4a5568',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isActive 
                    ? '0 4px 12px rgba(102, 126, 234, 0.3)'
                    : '0 1px 3px rgba(0, 0, 0, 0.05)',
                }}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Product list */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        {filteredProducts.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: '#ffffff',
            borderRadius: '16px',
            border: '2px dashed #e2e8f0',
          }}>
            <ShoppingBag 
              size={48} 
              style={{ 
                color: '#cbd5e0',
                margin: '0 auto 16px',
                display: 'block',
              }} 
            />
            <div style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#4a5568',
              marginBottom: '8px',
            }}>
              No {activeCategory !== 'all' ? activeCategory : ''} items yet
            </div>
            <div style={{
              fontSize: '14px',
              color: '#718096',
            }}>
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

        .shopping-category-pills::-webkit-scrollbar { display: none; }
        
        .shopping-action-button:hover {
          background: rgba(255, 255, 255, 0.3) !important;
          transform: translateY(-1px);
        }
        .shopping-action-button:active { transform: translateY(0); }
        
        .shopping-pill:not(.active):hover {
          background: #f7fafc !important;
          border-color: #cbd5e0 !important;
          transform: scale(1.02);
        }
        .shopping-pill:active { transform: scale(0.98); }

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
          .shopping-category-pills { display: none !important; }
          .ingredient-card-compact {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};

export default ShoppingListWithDetails;