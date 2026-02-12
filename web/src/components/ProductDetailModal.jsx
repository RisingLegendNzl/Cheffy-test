// web/src/components/ProductDetailModal.jsx
// FIXED: Modal now fully encapsulates the screen
//
// ROOT CAUSE: The bottom-sheet approach (position:fixed; bottom:0; maxHeight:90vh)
//   left the modal partially hidden behind the BottomNav bar and Header, and
//   content could overflow off-screen. z-index 1001 was also too low to sit above
//   BottomNav (Z_INDEX.fixed) and SettingsPanel (1050).
//
// SOLUTION (mirrors RecipeModal pattern):
// - Overlay wrapper uses position:fixed; inset:0 at z-index 9998 (below RecipeModal 9999)
// - Mobile: modal fills 100% of the overlay — no bottom-sheet, full screen
// - Desktop (>=768px): centered card with max-width 520px, max-height 85vh, border-radius
// - Scrollable content area uses flex:1 + minHeight:0 so overflow stays contained
// - Dynamic viewport height (dvh) with vh fallback via injected <style>
// - Body scroll lock uses iOS-safe position:fixed technique
// - All product information preserved: total needed, units to purchase, selected product,
//   price, size, unit price, cheapest badge, view-on-store link, alternatives

import React, { useEffect, useState } from 'react';
import { X, ShoppingBag, AlertTriangle, ExternalLink, ChevronDown, ChevronUp, Minus, Plus, Tag } from 'lucide-react';

const MODAL_Z = 9998; // Above Header (1020), BottomNav (1030), SettingsPanel (1050), below RecipeModal (9999)

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

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Body scroll lock (iOS-safe) + inject dvh helper CSS
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

    // Inject dynamic-viewport-height helper CSS
    const id = 'product-modal-dvh-styles';
    let styleEl = document.getElementById(id);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = id;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      /* Full-viewport overlay — dvh with vh fallback */
      .pdm-overlay {
        height: 100vh;
        height: 100dvh;
      }

      /* Mobile-first: modal fills the overlay entirely */
      .pdm-container {
        height: 100%;
        width: 100%;
        max-width: 100%;
        border-radius: 0;
      }

      /* Desktop: centered card with breathing room */
      @media (min-width: 768px) {
        .pdm-container {
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
    };
  }, [isOpen]);

  // Reset alternatives when product changes
  useEffect(() => {
    setShowAlternatives(false);
  }, [normalizedKey]);

  if (!isOpen) return null;

  const isFailed = result?.source === 'failed' || result?.source === 'error';
  const isAbsoluteCheapest = absoluteCheapestProduct && currentSelection &&
    currentSelection.url === absoluteCheapestProduct.url;

  const getPrice = (p) => {
    if (!p) return null;
    const raw = p.price ?? p.current_price ?? p.product_price;
    const num = parseFloat(raw);
    return isNaN(num) ? null : num;
  };

  const getSize = (p) => p?.size || p?.product_size || p?.package_size || null;

  const totalGrams = result?.totalGramsRequired || 0;
  const quantityUnits = result?.quantityUnits || '';

  return (
    <>
      {/* ── FULL-SCREEN OVERLAY (fixed inset:0) ── */}
      <div
        className="pdm-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: MODAL_Z,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          animation: 'pdm-fadeIn 0.2s ease',
        }}
        onClick={(e) => {
          // Close if clicking the backdrop (not the modal card itself)
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* ── MODAL CONTAINER ── */}
        <div
          className="pdm-container"
          style={{
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            animation: 'pdm-slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          {/* ── HEADER (pinned, never scrolls) ── */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid #f1f5f9',
            flexShrink: 0,
          }}>
            <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '700',
                color: '#0f172a',
                margin: 0,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {ingredientKey}
              </h2>
              {result?.source && !isFailed && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '4px',
                }}>
                  <ShoppingBag size={12} style={{ color: '#6366f1' }} />
                  <span style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6366f1',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    {result.source === 'api' ? 'Live Price' : result.source || ''}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close product detail"
              style={{
                width: '40px',
                height: '40px',
                minWidth: '40px',
                minHeight: '40px',
                borderRadius: '50%',
                border: '2px solid #e5e7eb',
                background: '#f3f4f6',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.15s, border-color 0.15s',
                flexShrink: 0,
                WebkitTapHighlightColor: 'transparent',
              }}
              className="pdm-close-button"
            >
              <X size={18} color="#64748b" />
            </button>
          </div>

          {/* ── SCROLLABLE CONTENT ── */}
          <div style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '20px',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}>
            {isFailed ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                background: '#fef2f2',
                borderRadius: '12px',
                border: '1px solid #fecaca',
              }}>
                <AlertTriangle size={32} style={{ color: '#dc2626', margin: '0 auto 12px' }} />
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#991b1b', marginBottom: '4px' }}>
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
                  borderRadius: '12px',
                  border: '1.5px solid #bfdbfe',
                  marginBottom: '20px',
                }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#1e40af',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: '6px',
                  }}>
                    Total Needed
                  </div>
                  <div style={{
                    fontSize: '28px',
                    fontWeight: '800',
                    color: '#1e3a8a',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {totalGrams > 0 ? `${totalGrams}g` : quantityUnits || 'N/A'}
                  </div>
                </div>

                {/* Units to Purchase */}
                <div style={{ marginBottom: '20px' }}>
                  <h5 style={{
                    fontSize: '15px',
                    fontWeight: '700',
                    marginBottom: '12px',
                    color: '#0f172a',
                    letterSpacing: '-0.01em',
                  }}>
                    Units to Purchase
                  </h5>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '16px',
                    background: '#f8fafc',
                    borderRadius: '14px',
                    border: '2px solid #e2e8f0',
                  }}>
                    <button
                      onClick={() => currentQuantity > 1 && onQuantityChange(normalizedKey, -1)}
                      disabled={currentQuantity <= 1}
                      className="pdm-quantity-button"
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        border: 'none',
                        background: currentQuantity <= 1 ? '#e2e8f0' : '#fecaca',
                        color: currentQuantity <= 1 ? '#94a3b8' : '#991b1b',
                        fontSize: '20px',
                        fontWeight: '700',
                        cursor: currentQuantity <= 1 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                        flexShrink: 0,
                      }}
                    >
                      <Minus size={16} />
                    </button>

                    <div style={{
                      flex: 1,
                      textAlign: 'center',
                      fontSize: '28px',
                      fontWeight: '800',
                      color: '#0f172a',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {currentQuantity}
                    </div>

                    <button
                      onClick={() => onQuantityChange(normalizedKey, 1)}
                      className="pdm-quantity-button"
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        border: 'none',
                        background: '#dcfce7',
                        color: '#166534',
                        fontSize: '20px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                        flexShrink: 0,
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {/* Selected Product Info */}
                <div style={{ marginBottom: '20px' }}>
                  <h5 style={{
                    fontSize: '15px',
                    fontWeight: '700',
                    marginBottom: '12px',
                    color: '#0f172a',
                    letterSpacing: '-0.01em',
                  }}>
                    Selected Product
                  </h5>

                  {currentSelection ? (
                    <div style={{
                      background: '#ffffff',
                      borderRadius: '14px',
                      border: isAbsoluteCheapest ? '2px solid #22c55e' : '2px solid #e2e8f0',
                      overflow: 'hidden',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                    }}>
                      <div style={{ padding: '16px 18px 12px' }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '4px',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: '17px',
                              fontWeight: '700',
                              color: '#0f172a',
                              lineHeight: 1.3,
                              marginBottom: '3px',
                            }}>
                              {currentSelection.name}
                            </div>
                            <div style={{
                              fontSize: '13px',
                              fontWeight: '600',
                              color: '#6366f1',
                            }}>
                              {currentSelection.brand || ''}
                            </div>
                          </div>

                          {isAbsoluteCheapest && (
                            <div style={{
                              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                              color: '#fff',
                              padding: '4px 10px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                              marginLeft: '10px',
                              boxShadow: '0 2px 6px rgba(34, 197, 94, 0.3)',
                            }}>
                              Cheapest
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{
                        padding: '0 18px 16px',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                      }}>
                        <div style={{
                          background: '#f8fafc',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: '1px solid #f1f5f9',
                        }}>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            Price
                          </div>
                          <div style={{ fontSize: '20px', fontWeight: '800', color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                            {getPrice(currentSelection) != null ? `$${getPrice(currentSelection).toFixed(2)}` : 'N/A'}
                          </div>
                        </div>

                        <div style={{
                          background: '#f8fafc',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: '1px solid #f1f5f9',
                        }}>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            Size
                          </div>
                          <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>
                            {getSize(currentSelection) || 'N/A'}
                          </div>
                        </div>

                        <div style={{
                          background: '#f0fdf4',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: '1px solid #bbf7d0',
                          gridColumn: '1 / -1',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                              Price/100g
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: '800', color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>
                              ${currentSelection.unit_price_per_100 ? currentSelection.unit_price_per_100.toFixed(2) : 'N/A'}
                            </div>
                          </div>
                          {isAbsoluteCheapest && (
                            <Tag size={20} color="#16a34a" style={{ opacity: 0.6 }} />
                          )}
                        </div>
                      </div>

                      {/* View on Store Website link */}
                      {currentSelection.url && currentSelection.url !== '#api_down_mock_product' && currentSelection.url !== '#' && (
                        <div style={{
                          borderTop: '1px solid #f1f5f9',
                          padding: '12px 18px',
                        }}>
                          <a
                            href={currentSelection.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              padding: '10px 16px',
                              background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                              color: '#ffffff',
                              borderRadius: '10px',
                              fontSize: '14px',
                              fontWeight: '600',
                              textDecoration: 'none',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                            }}
                            className="pdm-view-product-link"
                          >
                            <ExternalLink size={16} />
                            View on Store Website
                          </a>
                          <div style={{
                            marginTop: '6px',
                            fontSize: '11px',
                            color: '#94a3b8',
                            textAlign: 'center',
                            wordBreak: 'break-all',
                            lineHeight: 1.4,
                          }}>
                            {currentSelection.url}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      padding: '24px',
                      textAlign: 'center',
                      background: '#fef2f2',
                      borderRadius: '12px',
                      border: '1px solid #fecaca',
                    }}>
                      <AlertTriangle size={24} style={{ color: '#dc2626', marginBottom: '8px' }} />
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#991b1b' }}>
                        No product found.
                      </div>
                    </div>
                  )}
                </div>

                {/* Alternatives */}
                {substitutes && substitutes.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <button
                      onClick={() => setShowAlternatives(!showAlternatives)}
                      className="pdm-alternatives-toggle"
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 18px',
                        background: '#ffffff',
                        border: '2px solid #e2e8f0',
                        borderRadius: '12px',
                        fontSize: '15px',
                        fontWeight: '700',
                        color: '#0f172a',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <span>Alternatives ({substitutes.length})</span>
                      {showAlternatives ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>

                    {showAlternatives && (
                      <div style={{
                        marginTop: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        animation: 'pdm-fadeInDown 0.3s ease',
                      }}>
                        {substitutes.map((sub, idx) => {
                          const subPrice = getPrice(sub);
                          const subSize = getSize(sub);
                          return (
                            <div
                              key={idx}
                              className="pdm-substitute-card"
                              style={{
                                padding: '14px 16px',
                                background: '#ffffff',
                                border: '2px solid #e2e8f0',
                                borderRadius: '12px',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                marginBottom: '10px',
                              }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    fontSize: '15px',
                                    fontWeight: '600',
                                    color: '#0f172a',
                                    marginBottom: '2px',
                                  }}>
                                    {sub.name}
                                  </div>
                                  <div style={{
                                    fontSize: '12px',
                                    color: '#64748b',
                                  }}>
                                    {sub.brand || ''}
                                  </div>
                                </div>
                              </div>

                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '8px',
                                marginBottom: '10px',
                              }}>
                                <div>
                                  <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>Price</div>
                                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#dc2626' }}>
                                    {subPrice != null ? `$${subPrice.toFixed(2)}` : 'N/A'}
                                  </div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>Size</div>
                                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>
                                    {subSize || 'N/A'}
                                  </div>
                                </div>
                              </div>

                              <div style={{
                                display: 'flex',
                                gap: '8px',
                              }}>
                                <button
                                  onClick={() => onSelectSubstitute && onSelectSubstitute(normalizedKey, sub)}
                                  className="pdm-select-substitute-btn"
                                  style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    background: '#6366f1',
                                    color: '#fff',
                                    borderRadius: '8px',
                                    border: 'none',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  Select
                                </button>
                                {sub.url && sub.url !== '#' && (
                                  <a
                                    href={sub.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      padding: '8px 12px',
                                      background: '#f1f5f9',
                                      borderRadius: '8px',
                                      color: '#475569',
                                      fontSize: '13px',
                                      fontWeight: '600',
                                      textDecoration: 'none',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      transition: 'all 0.15s ease',
                                    }}
                                    className="pdm-view-sub-link"
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

      {/* Styles */}
      <style>{`
        @keyframes pdm-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes pdm-slideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes pdm-fadeInDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .pdm-close-button:hover {
          background: #e5e7eb !important;
          border-color: #d1d5db !important;
        }

        .pdm-quantity-button:not(:disabled):hover {
          transform: scale(1.1);
        }

        .pdm-quantity-button:active {
          transform: scale(0.95);
        }

        .pdm-view-product-link:hover {
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4) !important;
          transform: translateY(-1px);
        }

        .pdm-alternatives-toggle:hover {
          background: #f8fafc !important;
          border-color: #cbd5e0 !important;
        }

        .pdm-substitute-card:hover {
          border-color: #c7d2fe !important;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1);
        }

        .pdm-select-substitute-btn:hover {
          background: #4f46e5 !important;
        }

        .pdm-view-sub-link:hover {
          background: #e2e8f0 !important;
        }
      `}</style>
    </>
  );
};

export default ProductDetailModal;