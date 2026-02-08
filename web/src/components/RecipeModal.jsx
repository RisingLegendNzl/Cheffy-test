// web/src/components/RecipeModal.jsx
import React from 'react';
import { X, ListChecks, ListOrdered } from 'lucide-react';

/**
 * RecipeModal - Meal detail overlay with guaranteed header visibility
 *
 * FIX SUMMARY:
 * - Changed from bottom-sheet (alignItems: flex-end + maxHeight: 90vh) to a
 *   full-screen overlay that uses height: 100% within a position:fixed container.
 * - On desktop (>672px), the modal is centered with rounded corners and capped width.
 * - On mobile, the modal fills the entire viewport using inset:0 + dvh fallback,
 *   guaranteeing the close button is always reachable.
 * - Scrollable body is contained; page scroll is locked via useEffect.
 */
const RecipeModal = ({ meal, onClose }) => {
    if (!meal) return null;

    // Handle backdrop click
    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    // Prevent body scroll when modal is open & inject dvh helper style
    React.useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        const originalPosition = document.body.style.position;
        const originalWidth = document.body.style.width;
        const originalTop = document.body.style.top;
        const scrollY = window.scrollY;

        // Lock body scroll — works on iOS Safari too
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';

        // Inject a <style> tag with a CSS custom property for dynamic viewport height.
        // This lets us use --dvh as a fallback for browsers that don't support 100dvh.
        const styleEl = document.createElement('style');
        styleEl.setAttribute('data-recipe-modal', '');
        styleEl.textContent = `
            .recipe-modal-overlay {
                /* dvh with vh fallback */
                height: 100vh;
                height: 100dvh;
            }
            .recipe-modal-container {
                max-height: 100vh;
                max-height: 100dvh;
            }
            @media (min-width: 672px) {
                .recipe-modal-container {
                    max-height: min(92vh, 92dvh);
                    border-radius: 24px !important;
                    margin: auto;
                }
            }
        `;
        document.head.appendChild(styleEl);

        return () => {
            document.body.style.overflow = originalOverflow;
            document.body.style.position = originalPosition;
            document.body.style.width = originalWidth;
            document.body.style.top = originalTop;
            window.scrollTo(0, scrollY);
            styleEl.remove();
        };
    }, []);

    return (
        <div
            className="recipe-modal-overlay"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                zIndex: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                /* Pad the overlay so the centered card never touches screen edges on desktop */
                padding: '0',
            }}
            onClick={handleBackdropClick}
        >
            {/* Modal Container */}
            <div
                className="recipe-modal-container"
                style={{
                    backgroundColor: 'white',
                    width: '100%',
                    maxWidth: '672px',
                    /* On mobile this stretches to full screen via the class rule;
                       on desktop the class caps it at 92dvh with rounded corners */
                    height: '100%',
                    borderRadius: '0',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    /* Ensure the container itself never exceeds the viewport */
                    boxSizing: 'border-box',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* HEADER - Always visible, never scrolls */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '1.25rem',
                        paddingTop:
                            'max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))',
                        borderBottom: '1px solid #e5e7eb',
                        backgroundColor: 'white',
                        flexShrink: 0,
                        minHeight: '70px',
                        /* Pin header to top of flex column so it's never scrolled away */
                        zIndex: 1,
                    }}
                >
                    {/* Title */}
                    <h3
                        style={{
                            fontSize: '1.25rem',
                            fontWeight: 700,
                            color: '#111827',
                            margin: 0,
                            paddingRight: '0.75rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            minWidth: 0,
                        }}
                    >
                        {meal.name}
                    </h3>

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: '#f3f4f6',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            flexShrink: 0,
                            transition: 'background-color 0.2s',
                        }}
                        onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor = '#e5e7eb')
                        }
                        onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor = '#f3f4f6')
                        }
                        aria-label="Close"
                    >
                        <X size={20} color="#4b5563" />
                    </button>
                </div>

                {/* SCROLLABLE BODY */}
                <div
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        padding: '1.5rem 1.25rem',
                        WebkitOverflowScrolling: 'touch',
                        /* Prevent content from pushing the header off-screen */
                        minHeight: 0,
                    }}
                >
                    {/* Description */}
                    {meal.description && (
                        <div style={{ marginBottom: '2rem' }}>
                            <p
                                style={{
                                    color: '#374151',
                                    fontSize: '1rem',
                                    lineHeight: '1.625',
                                    margin: 0,
                                }}
                            >
                                {meal.description}
                            </p>
                        </div>
                    )}

                    {/* Ingredients */}
                    {meal.items && meal.items.length > 0 && (
                        <div style={{ marginBottom: '2rem' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    marginBottom: '1rem',
                                }}
                            >
                                <div
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        backgroundColor: '#e0e7ff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <ListChecks size={20} color="#4f46e5" />
                                </div>
                                <h4
                                    style={{
                                        fontSize: '1.25rem',
                                        fontWeight: 700,
                                        color: '#111827',
                                        margin: 0,
                                    }}
                                >
                                    Ingredients
                                </h4>
                            </div>
                            <ul
                                style={{
                                    listStyle: 'none',
                                    padding: 0,
                                    margin: 0,
                                }}
                            >
                                {meal.items.map((item, index) => (
                                    <li
                                        key={index}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '0.75rem',
                                            marginBottom: '0.75rem',
                                            color: '#374151',
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: '8px',
                                                height: '8px',
                                                borderRadius: '50%',
                                                backgroundColor: '#818cf8',
                                                marginTop: '0.5rem',
                                                flexShrink: 0,
                                            }}
                                        ></span>
                                        <span
                                            style={{
                                                flex: 1,
                                                fontSize: '1rem',
                                                lineHeight: '1.625',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    fontWeight: 600,
                                                    color: '#111827',
                                                }}
                                            >
                                                {item.qty}
                                                {item.unit}
                                            </span>{' '}
                                            {item.key}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Instructions */}
                    {meal.instructions && meal.instructions.length > 0 && (
                        <div style={{ marginBottom: '2rem' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    marginBottom: '1rem',
                                }}
                            >
                                <div
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        backgroundColor: '#d1fae5',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <ListOrdered size={20} color="#059669" />
                                </div>
                                <h4
                                    style={{
                                        fontSize: '1.25rem',
                                        fontWeight: 700,
                                        color: '#111827',
                                        margin: 0,
                                    }}
                                >
                                    Instructions
                                </h4>
                            </div>
                            <ol
                                style={{
                                    listStyle: 'none',
                                    padding: 0,
                                    margin: 0,
                                }}
                            >
                                {meal.instructions.map((step, index) => (
                                    <li
                                        key={index}
                                        style={{
                                            display: 'flex',
                                            gap: '1rem',
                                            marginBottom: '1rem',
                                            color: '#374151',
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                backgroundColor: '#d1fae5',
                                                color: '#047857',
                                                fontWeight: 700,
                                                fontSize: '0.875rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                            }}
                                        >
                                            {index + 1}
                                        </span>
                                        <span
                                            style={{
                                                flex: 1,
                                                fontSize: '1rem',
                                                lineHeight: '1.625',
                                                paddingTop: '0.125rem',
                                            }}
                                        >
                                            {step}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {/* Bottom safe area padding */}
                    <div
                        style={{
                            height: '2rem',
                            paddingBottom: 'env(safe-area-inset-bottom)',
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default RecipeModal;