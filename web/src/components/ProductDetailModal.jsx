// web/src/components/ProductDetailModal.jsx
//
// Full-screen product detail overlay — mirrors the RecipeModal pattern.
//
// Previous bugs:
//   1. bottom-sheet positioning (bottom:0 + maxHeight:90vh) left the modal
//      partially behind BottomNav (z-index 1030) or Header (1020).
//   2. CSS had `touch-action:none` on .product-modal which killed touch
//      scrolling; only the last child got pan-y, which wasn't the scroll
//      container in all code paths.
//   3. Desktop media-query used translate(-50%,-50%) that fought with
//      mobile bottom:0, causing the modal to render at the top of the
//      viewport with only its bottom edge visible.
//
// Fix (identical to RecipeModal approach):
//   - Single fixed overlay (inset:0, z-index 9998) with flex centering.
//   - Modal card is a flex-column child; mobile fills 100%, desktop is
//     a centered 520px card at max-height 85vh.
//   - Scroll container uses flex:1 + minHeight:0 + overflowY:auto with
//     explicit touch-action:pan-y so iOS/Android can scroll freely.
//   - Body scroll lock uses the iOS-safe position:fixed technique.
//   - Responsive sizing via injected <style> with 100dvh / 100vh fallback.

import React, { useEffect, useRef, useState } from 'react';
import {
  X, ShoppingBag, AlertTriangle, ExternalLink,
  ChevronDown, ChevronUp, Minus, Plus, Tag,
} from 'lucide-react';

const MODAL_Z = 9998; // Below RecipeModal (9999), above everything else

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

  // ── Escape key ──
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // ── Body scroll lock (iOS-safe) + inject dvh helper CSS ──
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

    // Inject responsive sizing classes
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

  // ── Helpers ──
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

  // Close when clicking the backdrop, not the card
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <>
      {/* ── FULL-SCREEN OVERLAY ── */}
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
        {/* ── MODAL CARD ── */}
        <div
          className="pdm-card"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderTop: '3px solid #6366f1',
            boxShadow:
              '0 0 0 1px rgba(99,102,241,0.12), 0 24px 48px -12px rgba(0,0,0,0.3)',
            fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          {/* ── HEADER (pinned, never scrolls) ── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '1rem 1.25rem',
            paddingTop: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))',
            borderBottom: '1px solid #e5e7eb',
            flexShrink: 0,
            minHeight: '60px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{
                fontSize: '1.15rem',
                fontWeight: 700,
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
                width: 40, height: 40, minWidth: 40,
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
              <X size={18} color="#64748b" />
            </button>
          </div>

          {/* ── SCROLLABLE BODY ──
              flex:1 + minHeight:0 confines overflow to this div.
              touch-action:pan-y enables native touch scrolling on mobile. */}
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
              padding: '1.25rem',
              paddingBottom: 'max(1.25rem, calc(1.25rem + env(safe-area-inset-bottom, 0px)))',
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
                {/* ── Total Needed ── */}
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
                    {totalGrams > 0 ? `${totalGrams}g` : quantityUnits || 'N/A'}
                  </div>
                </div>

                {/* ── Units to Purchase ── */}
                <div style={{ marginBottom: '20px' }}>
                  <h5 style={{
                    fontSize: '15px', fontWeight: 700, marginBottom: '12px',
                    color: '#0f172a', letterSpacing: '-0.01em',
                  }}>
                    Units to Purchase
                  </h5>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    padding: '16px', background: '#f8fafc',
                    borderRadius: '14px', border: '2px solid #e2e8f0',
                  }}>
                    <button
                      onClick={() => currentQuantity > 1 && onQuantityChange(normalizedKey, -1)}
                      disabled={currentQuantity <= 1}
                      style={{
                        width: 36, height: 36, borderRadius: '50%', border: 'none',
                        background: currentQuantity <= 1 ? '#e2e8f0' : '#fecaca',
                        color: currentQuantity <= 1 ? '#94a3b8' : '#991b1b',
                        fontSize: '20px', fontWeight: 700,
                        cursor: currentQuantity <= 1 ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease', flexShrink: 0,
                      }}
                    >
                      <Minus size={16} />
                    </button>
                    <div style={{
                      flex: 1, textAlign: 'center',
                      fontSize: '28px', fontWeight: 800, color: '#0f172a',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {currentQuantity}
                    </div>
                    <button
                      onClick={() => onQuantityChange(normalizedKey, 1)}
                      style={{
                        width: 36, height: 36, borderRadius: '50%', border: 'none',
                        background: '#dcfce7', color: '#166534',
                        fontSize: '20px', fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease', flexShrink: 0,
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {/* ── Selected Product ── */}
                <div style={{ marginBottom: '20px' }}>
                  <h5 style={{
                    fontSize: '15px', fontWeight: 700, marginBottom: '12px',
                    color: '#0f172a', letterSpacing: '-0.01em',
                  }}>
                    Selected Product
                  </h5>

                  {currentSelection ? (
                    <div style={{
                      background: '#ffffff', borderRadius: '14px',
                      border: isAbsoluteCheapest ? '2px solid #22c55e' : '2px solid #e2e8f0',
                      overflow: 'hidden',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                    }}>
                      {/* Product name + brand + cheapest badge */}
                      <div style={{ padding: '16px 18px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', lineHeight: 1.3, marginBottom: '3px' }}>
                              {currentSelection.name}
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#6366f1' }}>
                              {currentSelection.brand || ''}
                            </div>
                          </div>
                          {isAbsoluteCheapest && (
                            <div style={{
                              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                              color: '#fff', padding: '4px 10px', borderRadius: '10px',
                              fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                              letterSpacing: '0.5px', whiteSpace: 'nowrap', flexShrink: 0,
                              marginLeft: '10px', boxShadow: '0 2px 6px rgba(34,197,94,0.3)',
                            }}>
                              Cheapest
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Price / Size / Unit price grid */}
                      <div style={{ padding: '0 18px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            Price
                          </div>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                            {getPrice(currentSelection) != null ? `$${getPrice(currentSelection).toFixed(2)}` : 'N/A'}
                          </div>
                        </div>
                        <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            Size
                          </div>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                            {getSize(currentSelection) || 'N/A'}
                          </div>
                        </div>
                        <div style={{
                          background: '#f0fdf4', padding: '10px 12px', borderRadius: '10px',
                          border: '1px solid #bbf7d0', gridColumn: '1 / -1',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                              Price/100g
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>
                              ${currentSelection.unit_price_per_100 ? currentSelection.unit_price_per_100.toFixed(2) : 'N/A'}
                            </div>
                          </div>
                          {isAbsoluteCheapest && <Tag size={20} color="#16a34a" style={{ opacity: 0.6 }} />}
                        </div>
                      </div>

                      {/* View on Store Website */}
                      {currentSelection.url && currentSelection.url !== '#api_down_mock_product' && currentSelection.url !== '#' && (
                        <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 18px' }}>
                          <a
                            href={currentSelection.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pdm-store-link"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                              padding: '10px 16px',
                              background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                              color: '#ffffff', borderRadius: '10px',
                              fontSize: '14px', fontWeight: 600, textDecoration: 'none',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
                            }}
                          >
                            <ExternalLink size={16} />
                            View on Store Website
                          </a>
                          <div style={{
                            marginTop: '6px', fontSize: '11px', color: '#94a3b8',
                            textAlign: 'center', wordBreak: 'break-all', lineHeight: 1.4,
                          }}>
                            {currentSelection.url}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      padding: '24px', textAlign: 'center',
                      background: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca',
                    }}>
                      <AlertTriangle size={24} style={{ color: '#dc2626', marginBottom: '8px' }} />
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#991b1b' }}>
                        No product found.
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Alternatives ── */}
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
                      {showAlternatives ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>

                    {showAlternatives && (
                      <div style={{
                        marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px',
                      }}>
                        {substitutes.map((sub, idx) => {
                          const subPrice = getPrice(sub);
                          const subSize = getSize(sub);
                          return (
                            <div
                              key={idx}
                              className="pdm-sub-card"
                              style={{
                                padding: '14px 16px', background: '#ffffff',
                                border: '2px solid #e2e8f0', borderRadius: '12px',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '2px' }}>
                                    {sub.name}
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                                    {sub.brand || ''}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                                <div>
                                  <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>Price</div>
                                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#dc2626' }}>
                                    {subPrice != null ? `$${subPrice.toFixed(2)}` : 'N/A'}
                                  </div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>Size</div>
                                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                                    {subSize || 'N/A'}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => onSelectSubstitute && onSelectSubstitute(normalizedKey, sub)}
                                  className="pdm-select-btn"
                                  style={{
                                    flex: 1, padding: '8px 12px',
                                    background: '#6366f1', color: '#fff',
                                    borderRadius: '8px', border: 'none',
                                    fontSize: '13px', fontWeight: 600,
                                    cursor: 'pointer', transition: 'all 0.15s ease',
                                  }}
                                >
                                  Select
                                </button>
                                {sub.url && sub.url !== '#' && (
                                  <a
                                    href={sub.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="pdm-view-link"
                                    style={{
                                      padding: '8px 12px', background: '#f1f5f9',
                                      borderRadius: '8px', color: '#475569',
                                      fontSize: '13px', fontWeight: 600,
                                      textDecoration: 'none',
                                      display: 'flex', alignItems: 'center', gap: '4px',
                                      transition: 'all 0.15s ease',
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

      {/* Scoped hover styles — prefixed to avoid collisions */}
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