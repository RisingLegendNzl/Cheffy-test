// web/src/components/landing/CTASection.jsx
import React, { useRef } from 'react';
import { ArrowRight, CheckCircle } from 'lucide-react';
import { useInView } from '../../hooks/useResponsive';

/**
 * Final CTA Section Component
 * Full-bleed CTA — theme aligned to Cheffy app indigo/purple palette
 */
const CTASection = ({ onGetStarted }) => {
  const benefits = [
    '7-day free trial, no credit card required',
    'Cancel anytime, no commitments',
    'Personalized meal plans from day one',
  ];

  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { threshold: 0.1, triggerOnce: true });

  return (
    <section
      ref={sectionRef}
      className="py-20 md:py-28 relative overflow-hidden"
      style={{ backgroundColor: '#1e1b4b' }}
    >
      {/* Subtle decorative elements */}
      <div
        className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-8"
        style={{
          background: 'radial-gradient(circle, #6366f1 0%, transparent 65%)',
          filter: 'blur(80px)',
          transform: 'translate(30%, -40%)',
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-6"
        style={{
          background: 'radial-gradient(circle, #a855f7 0%, transparent 65%)',
          filter: 'blur(60px)',
          transform: 'translate(-30%, 40%)',
        }}
      />

      <div
        className="max-w-3xl mx-auto px-5 md:px-10 text-center relative z-10 transition-all duration-700 ease-out"
        style={{
          opacity: isInView ? 1 : 0,
          transform: isInView ? 'translateY(0)' : 'translateY(20px)',
        }}
      >
        {/* Eyebrow */}
        <span
          className="text-xs font-semibold tracking-widest uppercase block mb-5"
          style={{
            color: '#c7d2fe',
            fontFamily: "'Georgia', serif",
            letterSpacing: '0.12em',
          }}
        >
          Ready to start?
        </span>

        {/* Headline */}
        <h2
          className="text-3xl md:text-4xl lg:text-5xl mb-5"
          style={{
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontWeight: 700,
            color: '#FFFFFF',
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
          }}
        >
          Your healthier meals
          <br />
          are one click away
        </h2>

        {/* Subheadline */}
        <p
          className="text-base md:text-lg mb-10 max-w-lg mx-auto"
          style={{
            color: 'rgba(255,255,255,0.55)',
            fontFamily: "'Georgia', serif",
            lineHeight: 1.7,
          }}
        >
          Join thousands already hitting their nutrition goals with
          AI-powered plans tailored to their lifestyle.
        </p>

        {/* CTA Button */}
        <button
          onClick={onGetStarted}
          className="group inline-flex items-center space-x-2.5 px-8 py-4 rounded-xl font-semibold text-sm transition-all duration-300 hover:translate-y-[-2px] mb-12"
          style={{
            backgroundColor: '#6366f1',
            color: '#FFFFFF',
            fontFamily: "'Georgia', serif",
            boxShadow: '0 6px 24px rgba(99, 102, 241, 0.35)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow =
              '0 10px 32px rgba(99, 102, 241, 0.45)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow =
              '0 6px 24px rgba(99, 102, 241, 0.35)';
          }}
        >
          <span>Start Your Free Trial</span>
          <ArrowRight
            size={17}
            className="transition-transform duration-300 group-hover:translate-x-1"
          />
        </button>

        {/* Benefits */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-5 sm:gap-8">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="flex items-center space-x-2 transition-all duration-500"
              style={{
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'translateY(0)' : 'translateY(10px)',
                transitionDelay: `${300 + index * 100}ms`,
              }}
            >
              <CheckCircle
                size={15}
                className="flex-shrink-0"
                style={{ color: '#c7d2fe' }}
              />
              <span
                className="text-xs md:text-sm"
                style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontFamily: "'Georgia', serif",
                }}
              >
                {benefit}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CTASection;