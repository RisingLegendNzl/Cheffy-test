// web/src/components/landing/FeaturesSection.jsx
import React, { useRef } from 'react';
import { Sparkles, Target, Calendar, Heart } from 'lucide-react';
import { useInView } from '../../hooks/useResponsive';

/**
 * Features Section Component
 * Bento-grid inspired layout with warm editorial aesthetic
 */
const FeaturesSection = () => {
  const features = [
    {
      icon: <Sparkles size={24} />,
      title: 'AI Meal Generation',
      description:
        'Intelligent suggestions shaped by your preferences, restrictions, and nutritional targets — no two plans are the same.',
      accent: '#2D6A4F',
      accentBg: 'rgba(45, 106, 79, 0.07)',
      span: 'md:col-span-2',
    },
    {
      icon: <Target size={24} />,
      title: 'Precision Macro Tracking',
      description:
        'Visual breakdowns of protein, carbs, and fats with real-time progress toward your daily goals.',
      accent: '#D4A373',
      accentBg: 'rgba(212, 163, 115, 0.1)',
      span: '',
    },
    {
      icon: <Calendar size={24} />,
      title: 'Weekly Meal Calendar',
      description:
        'Drag-and-drop meal scheduling with automatic grocery list generation based on real local prices.',
      accent: '#BC6C25',
      accentBg: 'rgba(188, 108, 37, 0.08)',
      span: '',
    },
    {
      icon: <Heart size={24} />,
      title: 'Goal Alignment',
      description:
        'Whether you\'re cutting, bulking, or maintaining — every plan adapts dynamically to keep you on track.',
      accent: '#9B2226',
      accentBg: 'rgba(155, 34, 38, 0.06)',
      span: 'md:col-span-2',
    },
  ];

  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { threshold: 0.1, triggerOnce: true });

  return (
    <section
      id="features"
      ref={sectionRef}
      className="py-20 md:py-28 relative"
      style={{ backgroundColor: '#FAFAF7' }}
    >
      {/* Subtle divider line */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-px"
        style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}
      />

      <div className="max-w-7xl mx-auto px-5 md:px-10">
        {/* Section Header */}
        <div
          className="mb-16 max-w-2xl transition-all duration-700 ease-out"
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
            Features
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
            Everything you need to
            <br />
            <span style={{ color: '#2D6A4F' }}>master your nutrition</span>
          </h2>
          <p
            className="text-base md:text-lg leading-relaxed"
            style={{
              color: '#6B6B63',
              fontFamily: "'Georgia', serif",
              lineHeight: 1.7,
            }}
          >
            Powerful, intuitive tools designed to make healthy eating
            simple, sustainable, and genuinely enjoyable.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`group p-7 md:p-9 rounded-2xl transition-all duration-500 ease-out cursor-default ${feature.span}`}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid rgba(0,0,0,0.06)',
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'translateY(0)' : 'translateY(20px)',
                transitionDelay: `${index * 100}ms`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow =
                  '0 12px 40px -8px rgba(0,0,0,0.08)';
                e.currentTarget.style.transform = 'translateY(-3px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                style={{
                  backgroundColor: feature.accentBg,
                  color: feature.accent,
                }}
              >
                {feature.icon}
              </div>

              {/* Title */}
              <h3
                className="text-xl md:text-2xl mb-3"
                style={{
                  fontFamily: "'Georgia', serif",
                  fontWeight: 700,
                  color: '#1B1B18',
                  letterSpacing: '-0.01em',
                }}
              >
                {feature.title}
              </h3>

              {/* Description */}
              <p
                className="text-sm md:text-base leading-relaxed"
                style={{
                  color: '#6B6B63',
                  fontFamily: "'Georgia', serif",
                  lineHeight: 1.7,
                }}
              >
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;