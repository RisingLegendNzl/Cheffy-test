// web/src/components/ProductDetailModal.jsx
// Modal for displaying full product details

import React, { useEffect } from 'react';
import { X, ShoppingBag, AlertTriangle } from 'lucide-react';
import ProductCard from './ProductCard';
import SubstituteMenu from './SubstituteMenu';

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
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY) * -1);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isFailed = result?.source === 'failed' || result?.source === 'error';

  return (
    <>
      {/* Backdrop */}
      <div
        className="product-modal-overlay"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
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
          top: 0,
          background: 'white',
          borderRadius: '0',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1001,
          animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          maxHeight: '100dvh',
        }}
      >
        {/* Swipe Handle (Mobile) */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '12px 0 8px 0',
          flexShrink: 0,
        }}>
          <div style={{
            width: '40px',
            height: '4px',
            background: '#cbd5e0',
            borderRadius: '2px',
          }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          flexShrink: 0,
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '700',
            color: '#1a1a1a',
            margin: 0,
          }}>
            Product Details
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: '#f7fafc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            className="modal-close-button"
          >
            <X size={18} color="#4a5568" />
          </button>
        </div>

        {/* Content — scrollable area */}
        <div style={{ 
          padding: '24px',
          overflowY: 'auto',
          flex: '1 1 auto',
          minHeight: 0,
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}>
          {/* Product Name & Badge */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '16px',
            gap: '12px',
          }}>
            <h3 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#1a1a1a',
              margin: 0,
              flex: 1,
            }}>
              {ingredientKey}
            </h3>
            
            {!isFailed && currentSelection && absoluteCheapestProduct && 
             currentSelection.url === absoluteCheapestProduct.url && (
              <div style={{
                background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
                color: '#ffffff',
                padding: '6px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                boxShadow: '0 2px 8px rgba(72, 187, 120, 0.3)',
                whiteSpace: 'nowrap',
              }}>
                Cheapest
              </div>
            )}

            {isFailed && (
              <span style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: '700',
                background: '#fee',
                color: '#c00',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <AlertTriangle size={14} /> Failed
              </span>
            )}
          </div>

          {/* Failed State */}
          {isFailed ? (
            <div style={{
              padding: '20px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              marginBottom: '16px',
            }}>
              <p style={{
                color: '#991b1b',
                fontWeight: '600',
                marginBottom: '8px',
              }}>
                Could not find a suitable product automatically.
              </p>
              <p style={{
                fontSize: '14px',
                color: '#7f1d1d',
                margin: 0,
              }}>
                Please check the "Failed Ingredient History" for details on the search attempts.
              </p>
            </div>
          ) : (
            <>
              {/* Quantity Selector */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                background: '#f0f4ff',
                borderRadius: '12px',
                marginBottom: '20px',
              }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1e40af',
                }}>
                  Quantity
                </span>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                  }}>
                    <button
                      onClick={() => onQuantityChange(normalizedKey, -1)}
                      disabled={currentQuantity <= 1}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        border: 'none',
                        background: currentQuantity <= 1 ? '#d1d5db' : '#fecaca',
                        color: '#1f2937',
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
                      color: '#1e40af',
                      minWidth: '40px',
                      textAlign: 'center',
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
                        color: '#1f2937',
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
              </div>

              {/* Current Selection */}
              <div style={{ marginBottom: '20px' }}>
                <h5 style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '16px',
                  fontWeight: '600',
                  marginBottom: '12px',
                  color: '#1a1a1a',
                }}>
                  <ShoppingBag size={18} style={{ marginRight: '8px' }} />
                  Your Selection
                </h5>
                {currentSelection ? (
                  <ProductCard 
                    product={currentSelection} 
                    isCurrentSelection={true} 
                    isAbsoluteCheapest={absoluteCheapestProduct && currentSelection.url === absoluteCheapestProduct.url}
                  />
                ) : (
                  <div style={{
                    padding: '16px',
                    textAlign: 'center',
                    background: '#fef2f2',
                    color: '#991b1b',
                    borderRadius: '8px',
                  }}>
                    <AlertTriangle size={24} style={{ margin: '0 auto 8px' }} />
                    No product found.
                  </div>
                )}
              </div>

              {/* Alternatives */}
              {substitutes && substitutes.length > 0 && (
                <SubstituteMenu substituteCount={substitutes.length}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '16px',
                  }}>
                    {substitutes.map((sub, index) => (
                      <ProductCard 
                        key={sub.url + index} 
                        product={sub}
                        isAbsoluteCheapest={absoluteCheapestProduct && sub.url === absoluteCheapestProduct.url}
                        onSelect={(p) => onSelectSubstitute(normalizedKey, p)}
                      />
                    ))}
                  </div>
                </SubstituteMenu>
              )}
            </>
          )}

          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '14px',
              marginTop: '24px',
              background: '#f7fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#4a5568',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            className="modal-close-full-button"
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }

        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }

        .modal-close-button:hover {
          background: #e2e8f0 !important;
        }

        .modal-close-full-button:hover {
          background: #e2e8f0 !important;
          border-color: #cbd5e0 !important;
          color: #2d3748 !important;
        }

        .quantity-button:not(:disabled):hover {
          transform: scale(1.1);
        }

        .quantity-button:active {
          transform: scale(0.95);
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
            width: 600px !important;
            height: 90vh !important;
            max-height: 90vh !important;
            border-radius: 16px !important;
            animation: fadeInScale 0.2s ease !important;
          }
        }
      `}</style>
    </>
  );
};

export default ProductDetailModal;