// web/src/components/ShoppingListWithDetails.jsx
// REDESIGNED - Clean Minimal Shopping Tab with Compact Ingredient Cards

import React, { useState, useMemo, useEffect } from 'react';
import { 
  ShoppingBag, 
  Copy,
  Printer,
  Share2
} from 'lucide-react';
import IngredientCard from './IngredientCard';
import ProductDetailModal from './ProductDetailModal';

/**
 * Clean, modern shopping list with category filter pills and compact ingredient cards
 * Each ingredient is a simple card with "View Product" button that opens a modal
 */
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
  // ============================================================================
  // STATE
  // ============================================================================
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
        
        if (product.store) {
          return product.store;
        }
        
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
  // ============================================================================
  const products = useMemo(() => {
    const productList = [];
    
    Object.entries(categorizedResults).forEach(([category, items]) => {
      items.forEach(({ normalizedKey, ingredient, ...result }) => {
        const allProducts = result.allProducts || result.products || [];
        const selectedIndex = result.selectedIndex || 0;
        const selectedProduct = allProducts[selectedIndex];
        
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
          result: result,
          selectedProduct: selectedProduct,
          allProducts: allProducts
        });
      });
    });
    
    return productList;
  }, [categorizedResults]);

  // ============================================================================
  // CATEGORY COUNTS
  // ============================================================================
  const categoryCounts = useMemo(() => {
    const counts = {
      all: products.length
    };
    
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
    if (activeCategory === 'all') {
      return products;
    }
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
  // MODAL DATA
  // ============================================================================
  const modalProductData = useMemo(() => {
    if (!selectedProductModal) return null;
    
    const product = products.find(p => p.normalizedKey === selectedProductModal);
    if (!product) return null;

    const allProducts = product.allProducts || [];
    const selectedIndex = product.result.selectedIndex || 0;
    const currentSelection = allProducts[selectedIndex];
    
    const cheapest = allProducts.reduce((best, current) => 
      (current.unit_price_per_100 ?? Infinity) < (best.unit_price_per_100 ?? Infinity) ? current : best, 
      allProducts[0]
    );
    
    const substitutes = allProducts
      .filter(p => p.url !== currentSelection?.url)
      .sort((a, b) => (a.unit_price_per_100 ?? Infinity) - (b.unit_price_per_100 ?? Infinity))
      .slice(0, 5);

    return {
      ingredientKey: product.ingredient,
      normalizedKey: product.normalizedKey,
      result: product.result,
      currentSelection,
      absoluteCheapestProduct: cheapest,
      substitutes,
      currentQuantity: product.result.userQuantity || 1
    };
  }, [selectedProductModal, products]);

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
      if (onShowToast) {
        onShowToast('Shopping list copied to clipboard!', 'success');
      }
    } catch (err) {
      console.error('Copy failed:', err);
      if (onShowToast) {
        onShowToast('Failed to copy list', 'error');
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Cheffy Shopping List',
          text: `My shopping list from Cheffy - ${products.length} items from ${actualStoreName}`,
        });
      } catch (err) {
        console.log('Share cancelled or failed:', err);
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

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '24px 16px',
      }}>
        {/* HEADER */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#1a1a1a',
            margin: '0 0 8px 0',
            letterSpacing: '-0.5px',
          }}>
            Shopping List
          </h1>
        </div>

        {/* TOTAL COST CARD */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '20px',
          boxShadow: '0 8px 24px rgba(102, 126, 234, 0.25)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '16px',
          }}>
            <div>
              <div style={{
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.9)',
                fontWeight: '500',
                marginBottom: '4px',
              }}>
                Total Cost
              </div>
              <div style={{
                fontSize: '36px',
                fontWeight: '700',
                color: '#ffffff',
                letterSpacing: '-1px',
              }}>
                ${totalCost.toFixed(2)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.85)',
                marginBottom: '4px',
              }}>
                {products.length} items • {categories.length - 1} categories
              </div>
              <div style={{
                fontSize: '13px',
                color: '#a8e6cf',
                fontWeight: '600',
              }}>
                Est. savings: ${estimatedSavings.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            flexWrap: 'wrap',
          }}>
            {[
              { icon: Copy, label: 'Copy List', onClick: handleCopyList },
              { icon: Share2, label: 'Share', onClick: handleShare },
              { icon: Printer, label: 'Print', onClick: handlePrint },
            ].map(({ icon: Icon, label, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="shopping-action-button"
                style={{
                  flex: 1,
                  minWidth: '100px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '10px 16px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <Icon size={16} />
                <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* CATEGORY FILTER PILLS */}
        <div style={{ marginBottom: '20px', overflow: 'hidden' }}>
          <div 
            className="shopping-category-pills"
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              padding: '4px 2px',
              WebkitOverflowScrolling: 'touch',
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
                    flex: '0 0 auto',
                    padding: '8px 16px',
                    background: isActive 
                      ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                      : '#ffffff',
                    color: isActive ? '#ffffff' : '#4a5568',
                    border: isActive ? 'none' : '1px solid #e2e8f0',
                    borderRadius: '20px',
                    fontSize: '14px',
                    fontWeight: isActive ? '600' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
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
            /* Empty State */
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
            /* Compact Ingredient Cards */
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
          onSelectSubstitute={onSelectSubstitute}
          onQuantityChange={onQuantityChange}
        />
      )}

      {/* STYLES */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        
        * {
          box-sizing: border-box;
        }

        .shopping-category-pills::-webkit-scrollbar {
          display: none;
        }
        
        .shopping-action-button:hover {
          background: rgba(255, 255, 255, 0.3) !important;
          transform: translateY(-1px);
        }
        
        .shopping-action-button:active {
          transform: translateY(0);
        }
        
        .shopping-pill:not(.active):hover {
          background: #f7fafc !important;
          border-color: #cbd5e0 !important;
          transform: scale(1.02);
        }
        
        .shopping-pill:active {
          transform: scale(0.98);
        }

        @media (max-width: 768px) {
          .shopping-action-button span {
            display: none;
          }
          
          .shopping-action-button {
            min-width: 44px !important;
            padding: 12px !important;
          }
        }
        
        @media print {
          body {
            background: white !important;
          }
          
          .shopping-action-button,
          .shopping-category-pills {
            display: none !important;
          }
          
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