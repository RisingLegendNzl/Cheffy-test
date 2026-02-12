// web/src/components/ProductDetailModal.jsx
// =============================================================================
// ProductDetailModal — Full-screen product detail overlay
//
// FIXES APPLIED:
// 1. Added visible 3.5px colored top border matching RecipeModal
// 2. Fixed total cost calculation to properly multiply quantity × unit price
// 3. Proper viewport encapsulation using RecipeModal scroll pattern
// 4. Independent scrolling with touch-action:pan-y
// 5. z-index 9998 for proper layering
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  X, ShoppingBag, AlertTriangle, ExternalLink,
  ChevronDown, ChevronUp, Minus, Plus, Tag,
} from 'lucide-react';

const MODAL_Z = 9998;

const ProductDetailModal = ({
  isOpen,
  onClose,
  ingredientKey,
  normalizedKey,
  result,
  currentSelection,
  absoluteCheapestProduct,
  substitutes,
  currentQuantity,
  onSelectSubstitute,
  onQuantityChange,
}) => {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const scrollRef = useRef(null);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Body scroll lock + responsive styling (matches RecipeModal pattern)
  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    const orig = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      width: document.body.style.width,
      top: document.body.style.top,
      height: document.body.style.height,
    };

    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100%';

    // Inject responsive sizing
    const id = 'pdm-dvh-styles';
    let styleEl = document.getElementById(id);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = id;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      .pdm-overlay { height: 100vh; height: 100dvh; }
      .pdm-card { height: 100%; width: 100%; max-width: 100%; border-radius: 0; }
      @media (min-width: 768px) {
        .pdm-card {
          max-width: 520px;
          height: auto;
          max-height: min(85vh, 85dvh);
          border-radius: 16px;
        }
      }
    `;

    return () => {
      document.body.style.overflow = orig.overflow;
      document.body.style.position = orig.position;
      document.body.style.width = orig.width;
      document.body.style.top = orig.top;
      document.body.style.height = orig.height;
      window.scrollTo(0, scrollY);
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, [isOpen]);

  // Reset alternatives when product changes
  useEffect(() => { setShowAlternatives(false); }, [normalizedKey]);

  if (!isOpen) return null;

  const isFailed = result?.source === 'failed' || result?.source === 'error';
  const isAbsoluteCheapest =
    absoluteCheapestProduct && currentSelection &&
    currentSelection.url === absoluteCheapestProduct.url;

  const getPrice = (p) => {
    if (!p) return null;
    const num = parseFloat(p.price ?? p.current_price ?? p.product_price);
    return isNaN(num) ? null : num;
  };
  const getSize = (p) => p?.size || p?.product_size || p?.package_size || null;

  const totalGrams = result?.totalGramsRequired || 0;
  const quantityUnits = result?.quantityUnits || '';
  
  // Calculate total cost: unit price × quantity
  const unitPrice = getPrice(currentSelection);
  const totalCost = unitPrice !== null ? unitPrice * currentQuantity : null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <>
      {/* Full-screen overlay */}
      <div
        className="pdm-overlay"
        onClick={handleBackdropClick}
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: MODAL_Z,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        {/* Modal card with visible border */}
        <div
          className="pdm-card"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderTop: '3.5px solid #6366f1',
            boxShadow: '0 0 0 1px rgba(99,102,241,0.12), 0 24px 48px -12px rgba(0,0,0,0.3)',
            fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          {/* Header - pinned, never scrolls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '1rem 1.25rem',
            paddingTop: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))',
            borderBottom: '1px solid #e5e7eb',
            background: '#ffffff',
            flexShrink: 0,
            minHeight: '64px',
            zIndex: 2,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{
                fontSize: '1.2rem',
                fontWeight: 700,
                color: '#111827',
                margin: 0,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {ingredientKey}
              </h2>
              {result?.source && !isFailed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                  <ShoppingBag size={12} style={{ color: '#6366f1' }} />
                  <span style={{
                    fontSize: '11px', fontWeight: 600, color: '#6366f1',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    {result.source === 'api' ? 'Live Price' : result.source || ''}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 40, height: 40, minWidth: 40, minHeight: 40,
                borderRadius: '50%',
                border: '2px solid #e5e7eb',
                background: '#f3f4f6',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.15s, border-color 0.15s',
                WebkitTapHighlightColor: 'transparent',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#e5e7eb'; e.currentTarget.style.borderColor = '#d1d5db'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
            >
              <X size={20} color="#374151" strokeWidth={2.5} />
            </button>
          </div>

          {/* Scrollable body */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              touchAction: 'pan-y',
              padding: '1.5rem',
              paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom, 0px)))',
            }}
          >
            {isFailed ? (
              <div style={{
                padding: '40px 20px', textAlign: 'center',
                background: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca',
              }}>
                <AlertTriangle size={32} style={{ color: '#dc2626', margin: '0 auto 12px' }} />
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#991b1b', marginBottom: '4px' }}>
                  Product Not Found
                </div>
                <div style={{ fontSize: '14px', color: '#991b1b', opacity: 0.8 }}>
                  Unable to load product details
                </div>
              </div>
            ) : (
              <>
                {/* Total Needed */}
                <div style={{
                  padding: '16px',
                  background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
                  borderRadius: '12px', border: '1.5px solid #bfdbfe',
                  marginBottom: '20px',
                }}>
                  <div style={{
                    fontSize: '12px', fontWeight: 600, color: '#1e40af',
                    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px',
                  }}>
                    Total Needed
                  </div>
                  <div style={{
                    fontSize: '28px', fontWeight: 800, color: '#1e3a8a',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {totalGrams > 0 ? `${totalGrams.toFixed(0)}g` : quantityUnits || 'N/A'}
                  </div>
                </div>

                {/* Units to Purchase */}
                <div style={{
                  padding: '16px',
                  background: 'linear-gradient(135deg, #fef3c7, #fef9c3)',
                  borderRadius: '12px', border: '1.5px solid #fde68a',
                  marginBottom: '20px',
                }}>
                  <div style={{
                    fontSize: '12px', fontWeight: 600, color: '#92400e',
                    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px',
                  }}>
                    Units to Purchase
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      onClick={() => onQuantityChange?.(normalizedKey, Math.max(1, currentQuantity - 1))}
                      disabled={currentQuantity <= 1}
                      style={{
                        width: 36, height: 36, borderRadius: '8px',
                        border: '2px solid #f59e0b', 
                        background: currentQuantity <= 1 ? '#f3f4f6' : '#ffffff',
                        color: currentQuantity <= 1 ? '#9ca3af' : '#92400e',
                        cursor: currentQuantity <= 1 ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { if (currentQuantity > 1) e.currentTarget.style.background = '#fef3c7'; }}
                      onMouseLeave={(e) => { if (currentQuantity > 1) e.currentTarget.style.background = '#ffffff'; }}
                    >
                      <Minus size={16} />
                    </button>
                    <div style={{
                      fontSize: '32px', fontWeight: 800, color: '#78350f',
                      fontVariantNumeric: 'tabular-nums', minWidth: '60px', textAlign: 'center',
                    }}>
                      {currentQuantity || 1}
                    </div>
                    <button
                      onClick={() => onQuantityChange?.(normalizedKey, currentQuantity + 1)}
                      style={{
                        width: 36, height: 36, borderRadius: '8px',
                        border: '2px solid #f59e0b', background: '#ffffff',
                        color: '#92400e', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#fef3c7'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  
                  {/* Total Cost Display */}
                  {totalCost !== null && (
                    <div style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid #fde68a',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#92400e',
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                      }}>
                        Total Cost
                      </span>
                      <span style={{
                        fontSize: '24px',
                        fontWeight: 800,
                        color: '#78350f',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        ${totalCost.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Selected Product */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    fontSize: '12px', fontWeight: 600, color: '#6366f1',
                    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
                  }}>
                    Selected Product
                  </div>
                  {currentSelection ? (
                    <div style={{
                      padding: '16px', background: '#f8fafc',
                      borderRadius: '12px', border: '2px solid #e0e7ff',
                      position: 'relative',
                    }}>
                      {isAbsoluteCheapest && (
                        <div style={{
                          position: 'absolute', top: '-10px', right: '16px',
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          color: '#ffffff', fontSize: '11px', fontWeight: 700,
                          padding: '4px 12px', borderRadius: '12px',
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                          boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
                        }}>
                          Best Value
                        </div>
                      )}
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                        {currentSelection.name || currentSelection.product_name || 'Product'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                        {unitPrice !== null && (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            background: '#dcfce7', color: '#166534',
                            padding: '4px 10px', borderRadius: '6px',
                            fontSize: '13px', fontWeight: 600,
                          }}>
                            <Tag size={12} />
                            ${unitPrice.toFixed(2)}
                          </div>
                        )}
                        {getSize(currentSelection) && (
                          <div style={{
                            background: '#e0e7ff', color: '#3730a3',
                            padding: '4px 10px', borderRadius: '6px',
                            fontSize: '13px', fontWeight: 600,
                          }}>
                            {getSize(currentSelection)}
                          </div>
                        )}
                        {currentSelection.unit_price_per_100 && (
                          <div style={{
                            background: '#f3f4f6', color: '#4b5563',
                            padding: '4px 10px', borderRadius: '6px',
                            fontSize: '12px', fontWeight: 500,
                          }}>
                            ${currentSelection.unit_price_per_100}/100g
                          </div>
                        )}
                      </div>
                      {currentSelection.url && (
                        <a
                          href={currentSelection.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pdm-store-link"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '10px 16px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                            color: '#ffffff', borderRadius: '8px',
                            fontSize: '13px', fontWeight: 600,
                            textDecoration: 'none', transition: 'all 0.2s ease',
                            boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
                          }}
                        >
                          <ShoppingBag size={14} />
                          View in Store
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      padding: '20px', textAlign: 'center',
                      background: '#fef2f2', borderRadius: '12px',
                      border: '1px solid #fecaca', color: '#991b1b',
                    }}>
                      No product selected
                    </div>
                  )}
                </div>

                {/* Alternatives */}
                {substitutes && substitutes.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <button
                      onClick={() => setShowAlternatives(!showAlternatives)}
                      className="pdm-alt-toggle"
                      style={{
                        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '14px 18px', background: '#ffffff',
                        border: '2px solid #e2e8f0', borderRadius: '12px',
                        fontSize: '15px', fontWeight: 700, color: '#0f172a',
                        cursor: 'pointer', transition: 'all 0.2s ease',
                      }}
                    >
                      <span>Alternatives ({substitutes.length})</span>
                      {showAlternatives ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>

                    {showAlternatives && (
                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {substitutes.map((sub, idx) => {
                          const subPrice = getPrice(sub);
                          const subSize = getSize(sub);
                          const subIsCheapest = absoluteCheapestProduct && sub.url === absoluteCheapestProduct.url;
                          return (
                            <div
                              key={idx}
                              className="pdm-sub-card"
                              style={{
                                padding: '14px', background: '#fafafa',
                                borderRadius: '10px', border: '1.5px solid #e5e7eb',
                                position: 'relative', transition: 'all 0.2s ease',
                              }}
                            >
                              {subIsCheapest && (
                                <div style={{
                                  position: 'absolute', top: '-8px', right: '12px',
                                  background: 'linear-gradient(135deg, #10b981, #059669)',
                                  color: '#ffffff', fontSize: '10px', fontWeight: 700,
                                  padding: '3px 10px', borderRadius: '10px',
                                  textTransform: 'uppercase', letterSpacing: '0.5px',
                                }}>
                                  Best
                                </div>
                              )}
                              <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', marginBottom: '6px' }}>
                                {sub.name || sub.product_name || 'Product'}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                {subPrice !== null && (
                                  <span style={{
                                    background: '#dcfce7', color: '#166534',
                                    padding: '3px 8px', borderRadius: '5px',
                                    fontSize: '12px', fontWeight: 600,
                                  }}>
                                    ${subPrice.toFixed(2)}
                                  </span>
                                )}
                                {subSize && (
                                  <span style={{
                                    background: '#e0e7ff', color: '#3730a3',
                                    padding: '3px 8px', borderRadius: '5px',
                                    fontSize: '12px', fontWeight: 600,
                                  }}>
                                    {subSize}
                                  </span>
                                )}
                                {sub.unit_price_per_100 && (
                                  <span style={{
                                    background: '#f3f4f6', color: '#6b7280',
                                    padding: '3px 8px', borderRadius: '5px',
                                    fontSize: '11px', fontWeight: 500,
                                  }}>
                                    ${sub.unit_price_per_100}/100g
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => onSelectSubstitute?.(normalizedKey, sub)}
                                  className="pdm-select-btn"
                                  style={{
                                    flex: 1, padding: '8px 14px',
                                    background: '#6366f1', color: '#ffffff',
                                    border: 'none', borderRadius: '8px',
                                    fontSize: '13px', fontWeight: 600,
                                    cursor: 'pointer', transition: 'background 0.2s',
                                  }}
                                >
                                  Select
                                </button>
                                {sub.url && (
                                  <a
                                    href={sub.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="pdm-view-link"
                                    style={{
                                      padding: '8px 14px', background: '#f3f4f6', color: '#374151',
                                      borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                                      textDecoration: 'none', display: 'inline-flex',
                                      alignItems: 'center', gap: '4px',
                                      transition: 'background 0.2s',
                                    }}
                                  >
                                    <ExternalLink size={13} />
                                    View
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Hover styles */}
      <style>{`
        .pdm-store-link:hover {
          box-shadow: 0 4px 14px rgba(99,102,241,0.4) !important;
          transform: translateY(-1px);
        }
        .pdm-alt-toggle:hover {
          background: #f8fafc !important;
          border-color: #cbd5e0 !important;
        }
        .pdm-sub-card:hover {
          border-color: #c7d2fe !important;
          box-shadow: 0 2px 8px rgba(99,102,241,0.1);
        }
        .pdm-select-btn:hover { background: #4f46e5 !important; }
        .pdm-view-link:hover  { background: #e2e8f0 !important; }
      `}</style>
    </>
  );
};

export default ProductDetailModal;