// web/src/components/landing/HowItWorksSection.jsx
import React, { useRef } from 'react';
import { UserPlus, ChefHat, TrendingUp } from 'lucide-react';
import { useInView } from '../../hooks/useResponsive';

/**
 * How It Works Section Component
 * Clean horizontal timeline — theme aligned to Cheffy app indigo/purple palette
 */
const HowItWorksSection = () => {
  const steps = [
    {
      number: '01',
      icon: <UserPlus size={26} />,
      title: 'Build Your Profile',
      description:
        'Tell us about your dietary preferences, goals, and lifestyle in under two minutes.',
      accent: '#6366f1',
      accentBg: 'rgba(99, 102, 241, 0.07)',
    },
    {
      number: '02',
      icon: <ChefHat size={26} />,
      title: 'Get Your Plan',
      description:
        'Our AI instantly crafts a weekly meal plan calibrated to your macros, budget, and local store prices.',
      accent: '#a855f7',
      accentBg: 'rgba(168, 85, 247, 0.08)',
    },
    {
      number: '03',
      icon: <TrendingUp size={26} />,
      title: 'Track & Adapt',
      description:
        'Monitor your nutrition, mark meals as eaten, and watch your plan evolve with your progress.',
      accent: '#7e22ce',
      accentBg: 'rgba(126, 34, 206, 0.07)',
    },
  ];

  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { threshold: 0.1, triggerOnce: true });

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="py-20 md:py-28 relative"
      style={{ backgroundColor: '#eef2ff' }}
    >
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        {/* Section Header */}
        <div
          className="text-center mb-16 md:mb-20 transition-all duration-700 ease-out"
          style={{
            opacity: isInView ? 1 : 0,
            transform: isInView ? 'translateY(0)' : 'translateY(20px)',
          }}
        >
          <span
            className="text-xs font-semibold tracking-widest uppercase block mb-4"
            style={{
              color: '#6366f1',
              fontFamily: "'Georgia', serif",
              letterSpacing: '0.12em',
            }}
          >
            How It Works
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
            From sign-up to your first
            <br />
            <span style={{ color: '#6366f1' }}>meal plan in minutes</span>
          </h2>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 relative">
          {/* Connecting Line (Desktop) */}
          <div
            className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px transition-all duration-1000"
            style={{
              background:
                'linear-gradient(to right, rgba(99,102,241,0.3), rgba(168,85,247,0.3), rgba(126,34,206,0.2))',
              opacity: isInView ? 1 : 0,
              transform: isInView ? 'scaleX(1)' : 'scaleX(0)',
              transformOrigin: 'left',
            }}
          />

          {steps.map((step, index) => (
            <div
              key={index}
              className="relative transition-all duration-600 ease-out"
              style={{
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'translateY(0)' : 'translateY(24px)',
                transitionDelay: `${200 + index * 150}ms`,
              }}
            >
              {/* Step Number Circle */}
              <div className="flex justify-center mb-6">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold relative z-10"
                  style={{
                    backgroundColor: step.accent,
                    color: '#FFFFFF',
                    fontFamily: "'Georgia', serif",
                    boxShadow: `0 6px 20px ${step.accent}33`,
                  }}
                >
                  {step.number}
                </div>
              </div>

              {/* Card */}
              <div
                className="p-7 rounded-2xl text-center transition-all duration-300"
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid rgba(0,0,0,0.05)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow =
                    '0 10px 30px -6px rgba(99,102,241,0.08)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5"
                  style={{
                    backgroundColor: step.accentBg,
                    color: step.accent,
                  }}
                >
                  {step.icon}
                </div>

                {/* Title */}
                <h3
                  className="text-xl mb-3"
                  style={{
                    fontFamily: "'Georgia', serif",
                    fontWeight: 700,
                    color: '#1B1B18',
                  }}
                >
                  {step.title}
                </h3>

                {/* Description */}
                <p
                  className="text-sm leading-relaxed"
                  style={{
                    color: '#6B6B63',
                    fontFamily: "'Georgia', serif",
                    lineHeight: 1.7,
                  }}
                >
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;