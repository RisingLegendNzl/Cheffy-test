// web/src/components/ShoppingListWithDetails.jsx
// REDESIGNED - Clean Minimal Shopping Tab
// Production-ready implementation with full Cheffy integration

import React, { useState, useMemo, useEffect } from 'react';
import { 
  ShoppingBag, 
  Copy,
  Printer,
  Share2
} from 'lucide-react';
import IngredientResultBlock from './IngredientResultBlock';

/**
 * Clean, modern shopping list with category filter pills
 * Matches the minimal design specification from uploaded example
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.ingredients - Array of ingredients (legacy support)
 * @param {Object} props.results - Results object with product data
 * @param {number} props.totalCost - Total cost of all items
 * @param {string} props.storeName - Store name (auto-detected if not provided)
 * @param {Function} props.onShowToast - Toast notification handler
 * @param {Function} props.onSelectSubstitute - Substitute selection handler
 * @param {Function} props.onQuantityChange - Quantity change handler
 * @param {Function} props.onFetchNutrition - Nutrition fetch handler
 * @param {Object} props.nutritionCache - Cached nutrition data
 * @param {string} props.loadingNutritionFor - Currently loading nutrition URL
 * @param {Object} props.categorizedResults - Pre-categorized results by category
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

  // ============================================================================
  // STORE NAME DETECTION
  // ============================================================================
  const actualStoreName = useMemo(() => {
    // Try to detect store from product URLs
    for (const [key, result] of Object.entries(results)) {
      const products = result.allProducts || result.products || [];
      
      for (const product of products) {
        if (!product) continue;
        
        // Check explicit store field
        if (product.store) {
          return product.store;
        }
        
        // Detect from URL
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
        
        // Extract price with fallbacks
        const price = parseFloat(
          selectedProduct.product_price || 
          selectedProduct.price || 
          selectedProduct.current_price || 
          0
        );
        
        // Extract size with fallbacks
        const size = selectedProduct.size || 
                    selectedProduct.product_size || 
                    selectedProduct.package_size || 
                    '';
        
        // Check if this is the cheapest option
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
          selectedProduct: selectedProduct
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
    
    // Sort categories alphabetically
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
    // Conservative estimate: $0.50 per cheapest item
    const cheapestCount = products.filter(p => p.cheapest).length;
    return cheapestCount * 0.50;
  }, [products]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
  /**
   * Copy shopping list to clipboard
   */
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

  /**
   * Print shopping list
   */
  const handlePrint = () => {
    window.print();
  };

  /**
   * Share shopping list (native share or fallback to copy)
   */
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Cheffy Shopping List',
          text: `My shopping list from Cheffy - ${products.length} items from ${actualStoreName}`,
        });
      } catch (err) {
        // User cancelled or share failed - silently ignore
        console.log('Share cancelled or failed:', err);
      }
    } else {
      // Fallback to copy
      handleCopyList();
    }
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
        {/* ================================================================== */}
        {/* HEADER */}
        {/* ================================================================== */}
        <div style={{
          marginBottom: '24px',
        }}>
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

        {/* ================================================================== */}
        {/* TOTAL COST CARD */}
        {/* ================================================================== */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '20px',
          boxShadow: '0 8px 24px rgba(102, 126, 234, 0.25)',
        }}>
          {/* Top Section: Total Cost & Stats */}
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
            <div style={{
              textAlign: 'right',
            }}>
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

        {/* ================================================================== */}
        {/* CATEGORY FILTER PILLS */}
        {/* ================================================================== */}
        <div style={{
          marginBottom: '20px',
          overflow: 'hidden',
        }}>
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

        {/* ================================================================== */}
        {/* PRODUCT LIST */}
        {/* ================================================================== */}
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
            /* Product Cards */
            filteredProducts.map((product, index) => (
              <div
                key={product.id}
                className="shopping-product-card"
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                  border: '1px solid #f0f0f0',
                  transition: 'all 0.2s ease',
                  opacity: 0,
                  animation: `slideInProduct 0.3s ease forwards ${index * 0.03}s`,
                }}
              >
                {/* Product Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '12px',
                  gap: '12px',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#1a1a1a',
                      marginBottom: '4px',
                      lineHeight: '1.4',
                    }}>
                      {product.name}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#718096',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}>
                      <span style={{ fontWeight: '600', color: '#2d3748' }}>
                        ${product.price.toFixed(2)}
                      </span>
                      {product.size && (
                        <>
                          <span style={{ color: '#cbd5e0' }}>•</span>
                          <span>{product.size}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {product.cheapest && (
                    <div style={{
                      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
                      color: '#ffffff',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      boxShadow: '0 2px 8px rgba(72, 187, 120, 0.3)',
                      whiteSpace: 'nowrap',
                    }}>
                      Cheapest
                    </div>
                  )}
                </div>
                
                {/* Product Details - IngredientResultBlock Integration */}
                <div style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid #f0f0f0',
                }}>
                  <IngredientResultBlock
                    ingredientKey={product.ingredient}
                    normalizedKey={product.normalizedKey}
                    result={product.result}
                    onSelectSubstitute={onSelectSubstitute}
                    onQuantityChange={onQuantityChange}
                    onFetchNutrition={onFetchNutrition}
                    nutritionData={nutritionCache[product.selectedProduct?.url]}
                    isLoadingNutrition={loadingNutritionFor === product.selectedProduct?.url}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* STYLES */}
      {/* ================================================================== */}
      <style>{`
        /* Font Import */
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        
        /* Global Box Sizing */
        * {
          box-sizing: border-box;
        }
        
        /* Slide In Animation */
        @keyframes slideInProduct {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        /* Hide Scrollbar for Category Pills */
        .shopping-category-pills::-webkit-scrollbar {
          display: none;
        }
        
        /* Action Button Hover */
        .shopping-action-button:hover {
          background: rgba(255, 255, 255, 0.3) !important;
          transform: translateY(-1px);
        }
        
        .shopping-action-button:active {
          transform: translateY(0);
        }
        
        /* Category Pill Hover (Inactive) */
        .shopping-pill:not(.active):hover {
          background: #f7fafc !important;
          border-color: #cbd5e0 !important;
          transform: scale(1.02);
        }
        
        .shopping-pill:active {
          transform: scale(0.98);
        }
        
        /* Product Card Hover */
        .shopping-product-card:hover {
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1) !important;
          transform: translateY(-2px);
        }
        
        /* Mobile Responsive Adjustments */
        @media (max-width: 768px) {
          .shopping-product-card h1 {
            font-size: 28px !important;
          }
          
          .shopping-action-button span {
            display: none;
          }
          
          .shopping-action-button {
            min-width: 44px !important;
            padding: 12px !important;
          }
        }
        
        /* Print Styles */
        @media print {
          body {
            background: white !important;
          }
          
          .shopping-action-button,
          .shopping-category-pills {
            display: none !important;
          }
          
          .shopping-product-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};

export default ShoppingListWithDetails;