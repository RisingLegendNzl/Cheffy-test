// web/src/components/ShoppingListWithDetails.jsx
// REDESIGNED - Clean Minimal Shopping Tab with Compact Ingredient Cards
// FIX v3: Corrected inverted isOpen prop on ProductDetailModal.
// - isOpen was `!selectedProductModal` (always false when a product is selected)
// - Changed to `!!selectedProductModal` so the modal actually opens.
// Prior fixes retained:
// - modalProductData uses currentSelectionURL (authoritative) instead of selectedIndex
// - Fallback to `results` prop when categorizedResults data is stale
// - Guard against empty allProducts preventing blank modal

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

  // ============================================================================
  // STORE NAME DETECTION
  // ============================================================================
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

  // ============================================================================
  // PRODUCT TRANSFORMATION
  // FIX: Also store currentSelectionURL for reliable modal lookup
  // ============================================================================
  const products = useMemo(() => {
    const productList = [];
    
    Object.entries(categorizedResults).forEach(([category, items]) => {
      items.forEach(({ normalizedKey, ingredient, ...result }) => {
        // FIX: Prefer freshest data from results prop over categorizedResults spread
        const freshResult = results[normalizedKey] || result;
        const allProducts = freshResult.allProducts || freshResult.products || [];
        const selectedIndex = freshResult.selectedIndex || 0;

        // FIX: Find selected product by URL first, fall back to index
        let selectedProduct = null;
        if (freshResult.currentSelectionURL) {
          selectedProduct = allProducts.find(p => p && p.url === freshResult.currentSelectionURL);
        }
        if (!selectedProduct && allProducts.length > 0) {
          selectedProduct = allProducts[selectedIndex] || allProducts[0];
        }
        
        if (!selectedProduct) return;
        
        const price = parseFloat(
          selectedProduct.product_price || 
          selectedProduct.price || 
          selectedProduct.current_price || 
          0
        );
        
        const size = selectedProduct.size || 
                    selectedProduct.product_size || 
                    selectedProduct.package_size || 
                    '';
        
        const cheapest = selectedProduct.cheapest || false;
        
        productList.push({
          id: normalizedKey,
          name: ingredient,
          category: category.toLowerCase(),
          price: price,
          size: size,
          cheapest: cheapest,
          normalizedKey: normalizedKey,
          ingredient: ingredient,
          // FIX: Store the full fresh result for modal use
          result: freshResult,
          selectedProduct: selectedProduct,
          allProducts: allProducts
        });
      });
    });
    
    return productList;
  }, [categorizedResults, results]);

  // ============================================================================
  // CATEGORY COUNTS
  // ============================================================================
  const categoryCounts = useMemo(() => {
    const counts = { all: products.length };
    products.forEach(product => {
      const cat = product.category;
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [products]);

  // ============================================================================
  // CATEGORY LIST FOR PILLS
  // ============================================================================
  const categories = useMemo(() => {
    const uniqueCategories = [...new Set(products.map(p => p.category))];
    const sortedCategories = uniqueCategories.sort((a, b) => a.localeCompare(b));
    return [
      { id: 'all', label: 'All Items', count: categoryCounts.all },
      ...sortedCategories.map(cat => ({
        id: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        count: categoryCounts[cat] || 0
      }))
    ];
  }, [products, categoryCounts]);

  // ============================================================================
  // FILTERED PRODUCTS
  // ============================================================================
  const filteredProducts = useMemo(() => {
    if (activeCategory === 'all') return products;
    return products.filter(p => p.category === activeCategory);
  }, [products, activeCategory]);

  // ============================================================================
  // ESTIMATED SAVINGS
  // ============================================================================
  const estimatedSavings = useMemo(() => {
    const cheapestCount = products.filter(p => p.cheapest).length;
    return cheapestCount * 0.50;
  }, [products]);

  // ============================================================================
  // MODAL DATA — FIX: Use currentSelectionURL for reliable product selection
  // ============================================================================
  const modalProductData = useMemo(() => {
    if (!selectedProductModal) return null;
    
    const product = products.find(p => p.normalizedKey === selectedProductModal);
    if (!product) {
      console.warn('[SHOPPING_LIST] Modal: product not found for key:', selectedProductModal);
      return null;
    }

    // FIX: Use freshest result from results prop
    const freshResult = results[product.normalizedKey] || product.result;
    const allProducts = freshResult.allProducts || freshResult.products || product.allProducts || [];
    
    if (allProducts.length === 0) {
      console.warn('[SHOPPING_LIST] Modal: no allProducts for:', product.normalizedKey);
      return null;
    }

    // FIX: Find current selection by URL (authoritative), then index, then first
    let currentSelection = null;
    if (freshResult.currentSelectionURL) {
      currentSelection = allProducts.find(p => p && p.url === freshResult.currentSelectionURL);
    }
    if (!currentSelection) {
      const idx = freshResult.selectedIndex || 0;
      currentSelection = allProducts[idx] || allProducts[0];
    }
    
    // Find cheapest by unit price
    const cheapest = allProducts.reduce((best, current) => {
      if (!current) return best;
      return (current.unit_price_per_100 ?? Infinity) < (best?.unit_price_per_100 ?? Infinity) 
        ? current : best;
    }, allProducts[0]);
    
    // Build substitutes list excluding current selection
    const substitutes = allProducts
      .filter(p => p && p.url !== currentSelection?.url)
      .sort((a, b) => (a.unit_price_per_100 ?? Infinity) - (b.unit_price_per_100 ?? Infinity))
      .slice(0, 5);

    return {
      ingredientKey: product.ingredient,
      normalizedKey: product.normalizedKey,
      result: freshResult,
      currentSelection,
      absoluteCheapestProduct: cheapest,
      substitutes,
      currentQuantity: freshResult.userQuantity || 1
    };
  }, [selectedProductModal, products, results]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
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
      if (onShowToast) onShowToast('Shopping list copied to clipboard!', 'success');
    } catch (err) {
      console.error('Failed to copy:', err);
      if (onShowToast) onShowToast('Failed to copy list', 'error');
    }
  };

  const handlePrint = () => { window.print(); };

  const handleShare = async () => {
    const text = `Shopping List - ${actualStoreName}\nTotal: $${totalCost.toFixed(2)}\n${products.length} items`;
    if (navigator.share) {
      try { await navigator.share({ title: 'My Shopping List', text }); }
      catch (err) { console.error('Share failed:', err); }
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

  const handleSelectSubstitute = (normalizedKey, product) => {
    console.log('[SHOPPING_LIST] Substitute selected:', { normalizedKey, product: product.name });
    if (onSelectSubstitute) {
      onSelectSubstitute(normalizedKey, product);
    }
    handleCloseModal();
    if (onShowToast) onShowToast(`Switched to ${product.name}`, 'success');
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div style={{
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #f8fafc, #ffffff)',
    }}>
      {/* HEADER SECTION */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '32px 24px',
        borderRadius: '0 0 24px 24px',
        boxShadow: '0 4px 20px rgba(102, 126, 234, 0.25)',
      }}>
        {/* Store Name */}
        <div style={{
          fontSize: '14px',
          fontWeight: '500',
          color: 'rgba(255, 255, 255, 0.8)',
          marginBottom: '8px',
          letterSpacing: '0.5px',
        }}>
          {actualStoreName}
        </div>

        {/* Title & Cost */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '20px',
        }}>
          <div>
            <h2 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#ffffff',
              margin: '0 0 4px 0',
            }}>
              Shopping List
            </h2>
            <div style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.9)',
              fontWeight: '500',
            }}>
              {products.length} {products.length === 1 ? 'item' : 'items'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: '32px',
              fontWeight: '800',
              color: '#ffffff',
              lineHeight: '1',
            }}>
              ${totalCost.toFixed(2)}
            </div>
            <div style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.7)',
              marginTop: '4px',
            }}>
              estimated total
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '8px',
        }}>
          {[
            { icon: Copy, label: 'Copy', action: handleCopyList },
            { icon: Printer, label: 'Print', action: handlePrint },
            { icon: Share2, label: 'Share', action: handleShare },
          ].map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="shopping-action-button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ padding: '20px 16px' }}>
        {/* Category Filter Pills */}
        <div style={{ marginBottom: '20px' }}>
          <div 
            className="shopping-category-pills"
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '4px',
              msOverflowStyle: 'none',
              scrollbarWidth: 'none',
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

        {/* INGREDIENT CARDS */}
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
      </div>

      {/* PRODUCT DETAIL MODAL */}
      {/* FIX v3: Changed isOpen from `!selectedProductModal` to `!!selectedProductModal`.
         The `!` inverted the boolean — the modal was told to CLOSE whenever a product
         was selected and OPEN when nothing was selected (but the outer guard prevented
         that path from rendering at all). */}
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

      {/* STYLES */}
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