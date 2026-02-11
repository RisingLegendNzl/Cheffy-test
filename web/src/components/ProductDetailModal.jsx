// web/src/components/ProductDetailModal.jsx
// Modal for displaying full product details with:
// - Total Needed section
// - Units to Purchase with +/- controls
// - Your Selection product card with price, size, price/100g, cheapest badge
// - View Product link
// - Show Alternatives collapsible
// NO "Nutritional Value" section

import React, { useEffect, useState } from 'react';
import { X, ShoppingBag, AlertTriangle, ExternalLink, ChevronDown, ChevronUp, Minus, Plus, Tag } from 'lucide-react';

/**
 * Modal/Drawer for displaying complete product details
 * Mobile: Full-height bottom sheet with smooth independent scroll
 * Desktop: Center modal
 */
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

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${window.scrollY}px`;
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
    };
  }, [isOpen]);

  // Reset alternatives when modal opens/changes
  useEffect(() => {
    setShowAlternatives(false);
  }, [normalizedKey]);

  if (!isOpen) return null;

  const isFailed = result?.source === 'failed' || result?.source === 'error';
  const isAbsoluteCheapest = absoluteCheapestProduct && currentSelection && currentSelection.url === absoluteCheapestProduct.url;

  // Compute total needed display
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

      {/* Modal */}
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
          maxHeight: '92vh',
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

        {/* Header */}
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

        {/* Content — scrollable area */}
        <div style={{
          padding: '20px 24px 32px',
          overflowY: 'auto',
          flex: '1 1 auto',
          minHeight: 0,
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}>
          {isFailed ? (
            /* Failed ingredient state */
            <div style={{
              padding: '20px',
              background: '#fef2f2',
              borderRadius: '12px',
              border: '1px solid #fecaca',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <AlertTriangle size={20} color="#dc2626" />
                <span style={{ fontSize: '16px', fontWeight: '600', color: '#991b1b' }}>
                  Product Not Found
                </span>
              </div>
              <p style={{ fontSize: '14px', color: '#7f1d1d', margin: 0 }}>
                Please check the "Failed Ingredient History" for details on the search attempts.
              </p>
            </div>
          ) : (
            <>
              {/* ── Total Needed ── */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                background: '#f8fafc',
                borderRadius: '12px',
                marginBottom: '12px',
                border: '1px solid #e2e8f0',
              }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#475569',
                }}>
                  Total Needed:
                </span>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '700',
                  color: '#0f172a',
                  background: '#e2e8f0',
                  padding: '4px 12px',
                  borderRadius: '20px',
                }}>
                  {totalGrams > 0 ? `${totalGrams}g` : 'N/A'}
                  {quantityUnits ? ` (${quantityUnits})` : ''}
                </span>
              </div>

              {/* ── Units to Purchase ── */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                background: '#eef2ff',
                borderRadius: '12px',
                marginBottom: '20px',
                border: '1px solid #c7d2fe',
              }}>
                <div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#3730a3',
                  }}>
                    Units to Purchase:
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#6366f1',
                    marginTop: '2px',
                  }}>
                    (Purchase {currentQuantity} × One Unit)
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                }}>
                  <button
                    onClick={() => onQuantityChange(normalizedKey, -1)}
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

              {/* ── Your Selection — Detailed Product Card ── */}
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
                    {/* Product Header */}
                    <div style={{
                      padding: '16px 18px 12px',
                    }}>
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

                    {/* Product Details Grid */}
                    <div style={{
                      padding: '0 18px 16px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '10px',
                    }}>
                      {/* Price */}
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
                          ${currentSelection.price ? currentSelection.price.toFixed(2) : 'N/A'}
                        </div>
                      </div>

                      {/* Size */}
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
                          {currentSelection.size || currentSelection.package_size || 'N/A'}
                        </div>
                      </div>

                      {/* Price per 100g/ml */}
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

                    {/* View Product Link */}
                    {currentSelection.url && currentSelection.url !== '#api_down_mock_product' && (
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
                          View Product
                        </a>
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

              {/* ── Alternatives Section ── */}
              {substitutes && substitutes.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <button
                    onClick={() => setShowAlternatives(!showAlternatives)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '12px 16px',
                      background: showAlternatives ? '#f1f5f9' : '#ffffff',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    className="alternatives-toggle"
                  >
                    {showAlternatives ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                    {showAlternatives ? 'Hide' : 'Show'} {substitutes.length} Alternative{substitutes.length !== 1 ? 's' : ''}
                  </button>

                  {showAlternatives && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      marginTop: '12px',
                      animation: 'fadeInDown 0.2s ease',
                    }}>
                      {substitutes.map((sub, index) => {
                        const isSubCheapest = absoluteCheapestProduct && sub.url === absoluteCheapestProduct.url;
                        return (
                          <div
                            key={sub.url + index}
                            style={{
                              background: '#ffffff',
                              borderRadius: '12px',
                              border: isSubCheapest ? '2px solid #22c55e' : '1.5px solid #e2e8f0',
                              padding: '14px 16px',
                              transition: 'all 0.2s ease',
                              cursor: 'pointer',
                            }}
                            className="substitute-card"
                            onClick={() => onSelectSubstitute && onSelectSubstitute(normalizedKey, sub)}
                          >
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              marginBottom: '6px',
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: '15px',
                                  fontWeight: '600',
                                  color: '#0f172a',
                                  lineHeight: 1.3,
                                  marginBottom: '2px',
                                }}>
                                  {sub.name}
                                </div>
                                <div style={{
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  color: '#6366f1',
                                }}>
                                  {sub.brand || ''}
                                </div>
                              </div>
                              {isSubCheapest && (
                                <div style={{
                                  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                  color: '#fff',
                                  padding: '3px 8px',
                                  borderRadius: '8px',
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.4px',
                                  flexShrink: 0,
                                  marginLeft: '8px',
                                }}>
                                  Cheapest
                                </div>
                              )}
                            </div>

                            <div style={{
                              display: 'flex',
                              gap: '16px',
                              fontSize: '13px',
                              color: '#64748b',
                            }}>
                              <span>
                                <strong style={{ color: '#dc2626' }}>${sub.price ? sub.price.toFixed(2) : 'N/A'}</strong>
                              </span>
                              <span>{sub.size || sub.package_size || 'N/A'}</span>
                              <span>
                                /100g: <strong style={{ color: '#16a34a' }}>${sub.unit_price_per_100 ? sub.unit_price_per_100.toFixed(2) : 'N/A'}</strong>
                              </span>
                            </div>

                            <div style={{
                              marginTop: '10px',
                              display: 'flex',
                              gap: '8px',
                            }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectSubstitute && onSelectSubstitute(normalizedKey, sub);
                                }}
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
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                }}
                                className="select-substitute-btn"
                              >
                                <ShoppingBag size={14} />
                                Select
                              </button>
                              {sub.url && sub.url !== '#api_down_mock_product' && (
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

        /* Mobile: full-screen bottom sheet */
        .product-modal {
          touch-action: none;
        }

        .product-modal > div:last-of-type {
          touch-action: pan-y;
        }

        /* Desktop modal styles */
        @media (min-width: 768px) {
          .product-modal {
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            bottom: auto !important;
            right: auto !important;
            width: 520px !important;
            max-height: 88vh !important;
            border-radius: 16px !important;
            animation: fadeInScale 0.2s ease !important;
          }
        }
      `}</style>
    </>
  );
};

export default ProductDetailModal;