// web/src/components/ProductDetailModal.jsx
// =============================================================================
// ProductDetailModal — Full-screen product detail overlay
//
// FIX: Renders via ReactDOM.createPortal to document.body so the modal
// escapes any ancestor overflow:hidden / overflow:clip / transform
// containers that were clipping it to a partial viewport height.
//
// DARK MODE: All colors are now theme-aware via useTheme().
//
// FIXES APPLIED:
// 1. Portal rendering — modal is no longer trapped by parent layout
// 2. Full viewport coverage using 100dvh with vh fallback
// 3. Smooth alternatives expansion via CSS max-height transition
// 4. Independent scrolling with overscrollBehavior:contain
// 5. z-index 9998 for proper layering below RecipeModal (9999)
// 6. Total cost = quantity × unit price
// 7. 3.5px indigo top border matching RecipeModal
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ShoppingBag, AlertTriangle, ExternalLink,
  ChevronDown, ChevronUp, Minus, Plus, Tag,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

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
  const { isDark } = useTheme();
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
          max-height: min(90vh, 90dvh);
          border-radius: 20px;
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

  if (!isOpen) return null;

  // ── Theme tokens ──
  const t = {
    cardBg:         isDark ? '#1e2130' : '#ffffff',
    headerBg:       isDark ? '#1e2130' : '#ffffff',
    headerBorder:   isDark ? '#2d3148' : '#e5e7eb',
    titleColor:     isDark ? '#f0f1f5' : '#111827',
    subtitleColor:  isDark ? '#818cf8' : '#6366f1',
    bodyBg:         isDark ? '#181a24' : '#f8fafc',
    sectionBg:      isDark ? '#1e2130' : '#ffffff',
    sectionBorder:  isDark ? '#2d3148' : '#e5e7eb',
    labelColor:     isDark ? '#9ca3b0' : '#6b7280',
    valueColor:     isDark ? '#f0f1f5' : '#111827',
    mutedColor:     isDark ? '#6b7280' : '#9ca3af',
    priceBg:        isDark ? 'rgba(16,185,129,0.12)' : '#dcfce7',
    priceColor:     isDark ? '#34d399' : '#166534',
    sizeBg:         isDark ? 'rgba(99,102,241,0.12)' : '#eef2ff',
    sizeColor:      isDark ? '#a5b4fc' : '#4338ca',
    unitPriceBg:    isDark ? 'rgba(255,255,255,0.06)' : '#f9fafb',
    unitPriceColor: isDark ? '#9ca3b0' : '#6b7280',
    altToggleBg:    isDark ? '#252839' : '#ffffff',
    altToggleBorder:isDark ? '#3d4158' : '#e2e8f0',
    altToggleColor: isDark ? '#f0f1f5' : '#0f172a',
    subCardBg:      isDark ? '#252839' : '#fafafa',
    subCardBorder:  isDark ? '#3d4158' : '#e5e7eb',
    subNameColor:   isDark ? '#f0f1f5' : '#1f2937',
    viewLinkBg:     isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
    viewLinkColor:  isDark ? '#d1d5db' : '#374151',
    errorBg:        isDark ? 'rgba(239,68,68,0.1)' : '#fef2f2',
    errorBorder:    isDark ? 'rgba(239,68,68,0.2)' : '#fecaca',
    errorColor:     isDark ? '#fca5a5' : '#991b1b',
    qtyBtnBg:       isDark ? '#252839' : '#f3f4f6',
    qtyBtnColor:    isDark ? '#f0f1f5' : '#111827',
    qtyBtnBorder:   isDark ? '#3d4158' : '#e5e7eb',
    closeBtnBg:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    closeBtnColor:  isDark ? '#d1d5db' : '#6b7280',
    divider:        isDark ? '#2d3148' : '#f1f5f9',
  };

  const isFailed = result?.source === 'failed';

  // Helpers
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

  // ── Modal content (rendered via portal) ──
  const modalContent = (
    <>
      {/* Full-screen overlay */}
      <div
        className="pdm-overlay"
        onClick={handleBackdropClick}
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: MODAL_Z,
          background: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        {/* Modal card */}
        <div
          className="pdm-card"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: t.cardBg,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderTop: '3.5px solid #6366f1',
            boxShadow: isDark
              ? '0 0 0 1px rgba(99,102,241,0.15), 0 24px 48px -12px rgba(0,0,0,0.6)'
              : '0 0 0 1px rgba(99,102,241,0.12), 0 24px 48px -12px rgba(0,0,0,0.3)',
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
            borderBottom: `1px solid ${t.headerBorder}`,
            background: t.headerBg,
            flexShrink: 0,
            minHeight: '64px',
            zIndex: 2,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{
                fontSize: '1.2rem',
                fontWeight: 700,
                color: t.titleColor,
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
                  <ShoppingBag size={12} style={{ color: t.subtitleColor }} />
                  <span style={{
                    fontSize: '11px', fontWeight: 600, color: t.subtitleColor,
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    {result.source === 'api' ? 'DISCOVERY' : result.source.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                width: '36px', height: '36px', borderRadius: '10px',
                border: 'none', cursor: 'pointer',
                background: t.closeBtnBg, color: t.closeBtnColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable body */}
          <div
            ref={scrollRef}
            style={{
              flex: 1, minHeight: 0, overflowY: 'auto',
              padding: '1.25rem',
              background: t.bodyBg,
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {isFailed ? (
              /* FAILED STATE */
              <div style={{
                padding: '24px', textAlign: 'center',
                background: t.errorBg, borderRadius: '16px',
                border: `1px solid ${t.errorBorder}`,
              }}>
                <AlertTriangle size={32} style={{ color: isDark ? '#f87171' : '#dc2626', marginBottom: '12px' }} />
                <p style={{ fontWeight: 700, color: t.errorColor, marginBottom: '4px' }}>
                  Product not found
                </p>
                <p style={{ fontSize: '13px', color: t.mutedColor }}>
                  We couldn't find this item at the selected store.
                </p>
              </div>
            ) : (
              <>
                {/* Quantity & Total Row */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px', marginBottom: '16px',
                  background: t.sectionBg, borderRadius: '14px',
                  border: `1px solid ${t.sectionBorder}`,
                }}>
                  {/* Total Needed */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: t.labelColor, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                      Total Needed
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: t.valueColor }}>
                      {totalGrams > 0 ? `${Math.round(totalGrams)}${quantityUnits || 'g'}` : '—'}
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ width: '1px', height: '36px', background: t.divider }} />

                  {/* Quantity Stepper */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: t.labelColor, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', textAlign: 'center' }}>
                      Units to Purchase
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => onQuantityChange && onQuantityChange(normalizedKey, Math.max(1, currentQuantity - 1))}
                        style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          border: `1px solid ${t.qtyBtnBorder}`,
                          background: t.qtyBtnBg, color: t.qtyBtnColor,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Minus size={14} />
                      </button>
                      <span style={{ fontSize: '18px', fontWeight: 700, color: t.valueColor, minWidth: '24px', textAlign: 'center' }}>
                        {currentQuantity}
                      </span>
                      <button
                        onClick={() => onQuantityChange && onQuantityChange(normalizedKey, currentQuantity + 1)}
                        style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          border: `1px solid ${t.qtyBtnBorder}`,
                          background: t.qtyBtnBg, color: t.qtyBtnColor,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ width: '1px', height: '36px', background: t.divider }} />

                  {/* Total Cost */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: t.labelColor, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                      Total Cost
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: isDark ? '#34d399' : '#059669' }}>
                      {totalCost !== null ? `$${totalCost.toFixed(2)}` : '—'}
                    </div>
                  </div>
                </div>

                {/* Selected Product Card */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: t.labelColor, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Selected Product
                  </div>

                  {currentSelection ? (
                    <div style={{
                      padding: '16px', background: t.sectionBg,
                      borderRadius: '14px', border: `1px solid ${t.sectionBorder}`,
                    }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: t.valueColor, marginBottom: '10px' }}>
                        {currentSelection.name || currentSelection.product_name || 'Product'}
                      </div>

                      {/* Price / Size / Unit Price pills */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                        {unitPrice !== null && (
                          <span style={{
                            background: t.priceBg, color: t.priceColor,
                            padding: '4px 10px', borderRadius: '6px',
                            fontSize: '13px', fontWeight: 600,
                          }}>
                            ${unitPrice.toFixed(2)}
                          </span>
                        )}
                        {getSize(currentSelection) && (
                          <span style={{
                            background: t.sizeBg, color: t.sizeColor,
                            padding: '4px 10px', borderRadius: '6px',
                            fontSize: '13px', fontWeight: 600,
                          }}>
                            {getSize(currentSelection)}
                          </span>
                        )}
                        {unitPrice !== null && getSize(currentSelection) && (
                          <span style={{
                            background: t.unitPriceBg, color: t.unitPriceColor,
                            padding: '4px 10px', borderRadius: '6px',
                            fontSize: '12px', fontWeight: 500,
                          }}>
                            {(() => {
                              const sizeStr = getSize(currentSelection);
                              const sizeNum = parseFloat(sizeStr);
                              if (!isNaN(sizeNum) && sizeNum > 0) {
                                return `$${(unitPrice / sizeNum * 100).toFixed(2)}/100g`;
                              }
                              return '';
                            })()}
                          </span>
                        )}
                      </div>

                      {/* View in Store CTA */}
                      {currentSelection.url && (
                        <a
                          href={currentSelection.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pdm-store-link"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '10px 20px', background: '#6366f1', color: '#ffffff',
                            borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                            textDecoration: 'none', transition: 'all 0.2s',
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
                      background: t.errorBg, borderRadius: '12px',
                      border: `1px solid ${t.errorBorder}`, color: t.errorColor,
                    }}>
                      No product selected
                    </div>
                  )}
                </div>

                {/* Alternatives — smooth expand/collapse via CSS transition */}
                {substitutes && substitutes.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <button
                      onClick={() => setShowAlternatives(!showAlternatives)}
                      className="pdm-alt-toggle"
                      style={{
                        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '14px 18px', background: t.altToggleBg,
                        border: `2px solid ${t.altToggleBorder}`, borderRadius: '12px',
                        fontSize: '15px', fontWeight: 700, color: t.altToggleColor,
                        cursor: 'pointer', transition: 'all 0.2s ease',
                      }}
                    >
                      <span>Alternatives ({substitutes.length})</span>
                      <ChevronDown
                        size={20}
                        style={{
                          transition: 'transform 0.25s ease',
                          transform: showAlternatives ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                      />
                    </button>

                    {/* Wrapper with CSS max-height transition to prevent layout jumps */}
                    <div
                      className="pdm-alternatives-drawer"
                      style={{
                        overflow: 'hidden',
                        maxHeight: showAlternatives ? `${substitutes.length * 200}px` : '0px',
                        transition: 'max-height 0.3s ease-in-out',
                      }}
                    >
                      <div style={{ paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {substitutes.map((sub, idx) => {
                          const subPrice = getPrice(sub);
                          const subSize = getSize(sub);
                          const subIsCheapest = absoluteCheapestProduct && sub.url === absoluteCheapestProduct.url;
                          return (
                            <div
                              key={idx}
                              className="pdm-sub-card"
                              style={{
                                padding: '14px', background: t.subCardBg,
                                borderRadius: '10px', border: `1.5px solid ${t.subCardBorder}`,
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
                              <div style={{ fontSize: '14px', fontWeight: 600, color: t.subNameColor, marginBottom: '6px' }}>
                                {sub.name || sub.product_name || 'Product'}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                {subPrice !== null && (
                                  <span style={{
                                    background: t.priceBg, color: t.priceColor,
                                    padding: '3px 8px', borderRadius: '5px',
                                    fontSize: '12px', fontWeight: 600,
                                  }}>
                                    ${subPrice.toFixed(2)}
                                  </span>
                                )}
                                {subSize && (
                                  <span style={{
                                    background: t.sizeBg, color: t.sizeColor,
                                    padding: '3px 8px', borderRadius: '5px',
                                    fontSize: '12px', fontWeight: 600,
                                  }}>
                                    {subSize}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => onSelectSubstitute && onSelectSubstitute(normalizedKey, sub)}
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
                                      padding: '8px 14px', background: t.viewLinkBg, color: t.viewLinkColor,
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
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Hover styles — theme-aware */}
      <style>{`
        .pdm-store-link:hover {
          box-shadow: 0 4px 14px rgba(99,102,241,0.4) !important;
          transform: translateY(-1px);
        }
        .pdm-alt-toggle:hover {
          background: ${isDark ? '#2d3148' : '#f8fafc'} !important;
          border-color: ${isDark ? '#4d5170' : '#cbd5e0'} !important;
        }
        .pdm-sub-card:hover {
          border-color: ${isDark ? 'rgba(99,102,241,0.3)' : '#c7d2fe'} !important;
          box-shadow: 0 2px 8px ${isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)'};
        }
        .pdm-select-btn:hover { background: #4f46e5 !important; }
        .pdm-view-link:hover  { background: ${isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0'} !important; }
      `}</style>
    </>
  );

  // Portal to document.body — escapes all parent overflow/transform constraints
  return createPortal(modalContent, document.body);
};

export default ProductDetailModal;