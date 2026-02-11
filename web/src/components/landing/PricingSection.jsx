// web/src/components/landing/PricingSection.jsx
import React, { useRef } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { useInView } from '../../hooks/useResponsive';

/**
 * Pricing Section Component
 * Clean editorial pricing cards — warm organic palette
 */
const PricingSection = ({ onGetStarted }) => {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { threshold: 0.1, triggerOnce: true });

  const features = [
    'AI Meal Generation',
    'Personalized Macro Tracking',
    'Weekly Meal Planning Calendar',
    'Automatic Grocery Lists',
    'Unlimited Recipe Substitutes',
    'Health Goal & Progress Monitoring',
  ];

  const plans = [
    {
      name: 'Monthly',
      price: '$5',
      pricePer: '/ month',
      originalPrice: null,
      badge: null,
      isPrimary: false,
    },
    {
      name: 'Yearly',
      price: '$55',
      pricePer: '/ year',
      originalPrice: '$60',
      badge: 'Best Value',
      isPrimary: true,
    },
  ];

  return (
    <section
      id="pricing"
      ref={sectionRef}
      className="py-20 md:py-28"
      style={{ backgroundColor: '#FAFAF7' }}
    >
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        {/* Section Header */}
        <div
          className="text-center mb-14 transition-all duration-700 ease-out"
          style={{
            opacity: isInView ? 1 : 0,
            transform: isInView ? 'translateY(0)' : 'translateY(20px)',
          }}
        >
          <span
            className="text-xs font-semibold tracking-widest uppercase block mb-4"
            style={{
              color: '#2D6A4F',
              fontFamily: "'Georgia', serif",
              letterSpacing: '0.12em',
            }}
          >
            Pricing
          </span>
          <h2
            className="text-3xl md:text-4xl lg:text-5xl mb-5"
            style={{
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontWeight: 700,
              color: '#1B1B18',
              lineHeight: 1.12,
              letterSpacing: '-0.02em',
            }}
          >
            Simple, transparent
            <br />
            <span style={{ color: '#2D6A4F' }}>pricing for everyone</span>
          </h2>
          <p
            className="text-base md:text-lg max-w-xl mx-auto"
            style={{
              color: '#6B6B63',
              fontFamily: "'Georgia', serif",
              lineHeight: 1.7,
            }}
          >
            Start with a 7-day free trial. Cancel anytime.
            One plan, all features included.
          </p>
        </div>

        {/* Pricing Cards */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto transition-all duration-700 ease-out"
          style={{
            opacity: isInView ? 1 : 0,
            transform: isInView ? 'translateY(0)' : 'translateY(20px)',
            transitionDelay: '150ms',
          }}
        >
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="relative rounded-2xl p-7 md:p-8 transition-all duration-300"
              style={{
                backgroundColor: plan.isPrimary ? '#2D6A4F' : '#FFFFFF',
                border: plan.isPrimary
                  ? '1px solid #2D6A4F'
                  : '1px solid rgba(0,0,0,0.08)',
                boxShadow: plan.isPrimary
                  ? '0 16px 48px -8px rgba(45, 106, 79, 0.25)'
                  : 'none',
              }}
              onMouseEnter={(e) => {
                if (!plan.isPrimary) {
                  e.currentTarget.style.boxShadow =
                    '0 10px 30px -6px rgba(0,0,0,0.07)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!plan.isPrimary) {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              {/* Badge */}
              {plan.badge && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: '#D4A373',
                    color: '#FFFFFF',
                    fontFamily: "'Georgia', serif",
                    letterSpacing: '0.03em',
                  }}
                >
                  {plan.badge}
                </div>
              )}

              {/* Plan Name */}
              <h3
                className="text-lg mb-2"
                style={{
                  fontFamily: "'Georgia', serif",
                  fontWeight: 600,
                  color: plan.isPrimary ? 'rgba(255,255,255,0.8)' : '#6B6B63',
                }}
              >
                {plan.name} Plan
              </h3>

              {/* Price */}
              <div className="flex items-end mb-6">
                <span
                  className="text-4xl md:text-5xl"
                  style={{
                    fontFamily: "'Georgia', serif",
                    fontWeight: 700,
                    color: plan.isPrimary ? '#FFFFFF' : '#1B1B18',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {plan.price}
                </span>
                <span
                  className="text-base ml-1.5 mb-1"
                  style={{
                    fontFamily: "'Georgia', serif",
                    fontWeight: 500,
                    color: plan.isPrimary
                      ? 'rgba(255,255,255,0.6)'
                      : '#9C9C94',
                  }}
                >
                  {plan.pricePer}
                </span>
                {plan.originalPrice && (
                  <span
                    className="text-base ml-2 mb-1 line-through"
                    style={{
                      color: plan.isPrimary
                        ? 'rgba(255,255,255,0.4)'
                        : '#C4C4BE',
                    }}
                  >
                    {plan.originalPrice}
                  </span>
                )}
              </div>

              {/* CTA Button */}
              <button
                onClick={onGetStarted}
                className="group w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center space-x-2 mb-7"
                style={{
                  backgroundColor: plan.isPrimary
                    ? '#FFFFFF'
                    : '#2D6A4F',
                  color: plan.isPrimary ? '#2D6A4F' : '#FFFFFF',
                  fontFamily: "'Georgia', serif",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow =
                    '0 4px 14px rgba(0,0,0,0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span>Start 7-Day Trial</span>
                <ArrowRight
                  size={16}
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                />
              </button>

              {/* Divider */}
              <div
                className="w-full h-px mb-6"
                style={{
                  backgroundColor: plan.isPrimary
                    ? 'rgba(255,255,255,0.15)'
                    : 'rgba(0,0,0,0.06)',
                }}
              />

              {/* Features */}
              <p
                className="text-[11px] font-semibold tracking-wide uppercase mb-4"
                style={{
                  color: plan.isPrimary
                    ? 'rgba(255,255,255,0.55)'
                    : '#9C9C94',
                  fontFamily: "'Georgia', serif",
                  letterSpacing: '0.08em',
                }}
              >
                All features included
              </p>
              <ul className="space-y-2.5">
                {features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center space-x-2.5"
                  >
                    <Check
                      size={16}
                      className="flex-shrink-0"
                      style={{
                        color: plan.isPrimary ? '#A3D9B1' : '#2D6A4F',
                      }}
                    />
                    <span
                      className="text-sm"
                      style={{
                        color: plan.isPrimary
                          ? 'rgba(255,255,255,0.8)'
                          : '#6B6B63',
                        fontFamily: "'Georgia', serif",
                      }}
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;