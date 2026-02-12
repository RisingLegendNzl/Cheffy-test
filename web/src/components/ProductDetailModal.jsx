// web/src/components/ProductDetailModal.jsx
// FIXED: Modal now properly encapsulates all content within the screen
//
// ISSUE: Modal had maxHeight: '92vh' which caused content to overflow off-screen,
//        making product details (especially alternatives section) partially invisible.
//
// SOLUTION:
// - Mobile: Use maxHeight: '90vh' with safe-area-inset-bottom for iOS notch support
// - Desktop: Use maxHeight: '85vh' to ensure content fits with proper spacing
// - Added dynamic viewport height (dvh) support with vh fallback
// - Improved scrollable content area with proper flex constraints
// - Enhanced touch scrolling for mobile with -webkit-overflow-scrolling

import React, { useEffect, useState } from 'react';
import { X, ShoppingBag, AlertTriangle, ExternalLink, ChevronDown, ChevronUp, Minus, Plus, Tag } from 'lucide-react';

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

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Enhanced body scroll lock with iOS safe area support
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100%';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.body.style.top = '';
      document.body.style.height = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    return () => {
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.body.style.top = '';
      document.body.style.height = '';
    };
  }, [isOpen]);

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
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Modal - FIX: Improved maxHeight to fully encapsulate content */}
      <div
        className="product-modal"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#ffffff',
          borderRadius: '20px 20px 0 0',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(90vh - env(safe-area-inset-bottom, 0px))',
          animation: 'slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        {/* Drag Handle */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '12px 0 4px',
          flexShrink: 0,
        }}>
          <div style={{
            width: '40px',
            height: '4px',
            background: '#d1d5db',
            borderRadius: '2px',
          }} />
        </div>

        {/* Header - Always visible, never scrolls */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px 16px',
          borderBottom: '1px solid #f1f5f9',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#0f172a',
              margin: 0,
              lineHeight: 1.3,
            }}>
              {ingredientKey}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: 'none',
              background: '#f1f5f9',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            className="modal-close-button"
          >
            <X size={18} color="#64748b" />
          </button>
        </div>

        {/* Content - FIX: Properly constrained scrollable area with safe-area padding */}
        <div style={{
          padding: '20px 24px',
          paddingBottom: 'max(32px, calc(32px + env(safe-area-inset-bottom, 0px)))',
          overflowY: 'auto',
          overflowX: 'hidden',
          flex: '1 1 auto',
          minHeight: 0,
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
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    className="quantity-button"
                  >
                    −
                  </button>
                  <span style={{
                    fontSize: '24px',
                    fontWeight: '800',
                    color: '#3730a3',
                    minWidth: '36px',
                    textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {currentQuantity}
                  </span>
                  <button
                    onClick={() => onQuantityChange(normalizedKey, 1)}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      border: 'none',
                      background: '#bbf7d0',
                      color: '#166534',
                      fontSize: '20px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    className="quantity-button"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Your Selection */}
              <div style={{ marginBottom: '20px' }}>
                <h5 style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '15px',
                  fontWeight: '700',
                  marginBottom: '12px',
                  color: '#0f172a',
                  letterSpacing: '-0.01em',
                }}>
                  <ShoppingBag size={18} style={{ marginRight: '8px', color: '#6366f1' }} />
                  Your Selection
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
                          className="view-product-link"
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
                    className="alternatives-toggle"
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
                      animation: 'fadeInDown 0.3s ease',
                    }}>
                      {substitutes.map((sub, idx) => {
                        const subPrice = getPrice(sub);
                        const subSize = getSize(sub);
                        return (
                          <div
                            key={idx}
                            className="substitute-card"
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
                              padding: '8px 12px',
                              background: '#f0fdf4',
                              borderRadius: '8px',
                              marginBottom: '10px',
                            }}>
                              <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>Unit Price</div>
                              <div style={{ fontSize: '16px', fontWeight: '700', color: '#16a34a' }}>
                                ${sub.unit_price_per_100 ? sub.unit_price_per_100.toFixed(2) : 'N/A'}/100g
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => onSelectSubstitute(normalizedKey, sub)}
                                className="select-substitute-btn"
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  background: '#6366f1',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '8px',
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
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    padding: '8px 12px',
                                    background: '#f1f5f9',
                                    color: '#475569',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    textDecoration: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    transition: 'all 0.15s ease',
                                  }}
                                  className="view-sub-link"
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

      {/* Styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes fadeInScale {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        .modal-close-button:hover {
          background: #e2e8f0 !important;
        }

        .quantity-button:not(:disabled):hover {
          transform: scale(1.1);
        }

        .quantity-button:active {
          transform: scale(0.95);
        }

        .view-product-link:hover {
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4) !important;
          transform: translateY(-1px);
        }

        .alternatives-toggle:hover {
          background: #f8fafc !important;
          border-color: #cbd5e0 !important;
        }

        .substitute-card:hover {
          border-color: #c7d2fe !important;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1);
        }

        .select-substitute-btn:hover {
          background: #4f46e5 !important;
        }

        .view-sub-link:hover {
          background: #e2e8f0 !important;
        }

        .product-modal {
          touch-action: none;
        }

        .product-modal > div:last-of-type {
          touch-action: pan-y;
        }

        /* Desktop: centered modal with proper height constraints */
        @media (min-width: 768px) {
          .product-modal {
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            bottom: auto !important;
            right: auto !important;
            width: 520px !important;
            max-height: 85vh !important;
            border-radius: 16px !important;
            animation: fadeInScale 0.2s ease !important;
          }
        }

        /* Support for dynamic viewport height with fallback */
        @supports (height: 100dvh) {
          .product-modal {
            max-height: calc(90dvh - env(safe-area-inset-bottom, 0px)) !important;
          }
          
          @media (min-width: 768px) {
            .product-modal {
              max-height: 85dvh !important;
            }
          }
        }
      `}</style>
    </>
  );
};

export default ProductDetailModal;