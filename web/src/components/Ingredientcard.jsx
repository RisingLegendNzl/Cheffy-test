// web/src/components/IngredientCard.jsx
// Compact ingredient card with "View Product" button

import React from 'react';

/**
 * Compact ingredient card for shopping list
 * Shows essential info: name, price, size, cheapest badge
 * "View Product" button opens modal with full details
 */
const IngredientCard = ({ 
  ingredientName,
  price,
  size,
  isCheapest,
  onViewProduct,
  index = 0
}) => {
  return (
    <div
      className="ingredient-card-compact"
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        border: '1px solid #f0f0f0',
        transition: 'all 0.2s ease',
        opacity: 0,
        animation: `slideInIngredient 0.3s ease forwards ${index * 0.03}s`,
      }}
    >
      {/* Top Row: Product Name + Badge */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '4px',
        gap: '12px',
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#1a1a1a',
          lineHeight: '1.4',
          flex: 1,
        }}>
          {ingredientName}
        </div>
        
        {isCheapest && (
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

      {/* Second Row: Price + Size */}
      <div style={{
        fontSize: '14px',
        color: '#718096',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        marginBottom: '12px',
      }}>
        <span style={{ fontWeight: '600', color: '#2d3748' }}>
          ${typeof price === 'number' ? price.toFixed(2) : price}
        </span>
        {size && (
          <>
            <span style={{ color: '#cbd5e0' }}>•</span>
            <span>{size}</span>
          </>
        )}
      </div>

      {/* Divider */}
      <div style={{
        borderTop: '1px solid #f0f0f0',
        marginBottom: '12px',
      }} />

      {/* View Product Button */}
      <button
        onClick={onViewProduct}
        className="ingredient-view-button"
        style={{
          width: '100%',
          padding: '10px',
          background: '#f7fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#4a5568',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        View Product
      </button>

      <style>{`
        @keyframes slideInIngredient {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .ingredient-card-compact:hover {
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1) !important;
          transform: translateY(-2px);
        }

        .ingredient-view-button:hover {
          background: #edf2f7 !important;
          border-color: #cbd5e0 !important;
          color: #2d3748 !important;
        }

        .ingredient-view-button:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
};

export default IngredientCard;