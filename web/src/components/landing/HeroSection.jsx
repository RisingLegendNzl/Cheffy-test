// web/src/components/landing/HeroSection.jsx
import React, { useState, useEffect } from 'react';
import { ArrowRight, Leaf } from 'lucide-react';

/**
 * Hero Section Component
 * Editorial aesthetic — asymmetric layout
 * Theme aligned to Cheffy app indigo/purple palette
 */
const HeroSection = ({ onGetStarted }) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const stats = [
    { icon: <Leaf size={16} />, label: 'Personalized Plans', value: 'AI-Driven' },
  ];

  return (
    <section
      className="relative overflow-hidden pt-28 md:pt-36 pb-16 md:pb-24"
      style={{ backgroundColor: '#f9fafb' }}
    >
      {/* Decorative grain texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Subtle organic blob shapes */}
      <div
        className="absolute -top-20 -right-20 w-96 h-96 rounded-full opacity-10"
        style={{
          background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute bottom-0 -left-32 w-80 h-80 rounded-full opacity-8"
        style={{
          background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />

      <div className="max-w-7xl mx-auto px-5 md:px-10 relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* ─── Left Column: Copy ─── */}
          <div
            className="transition-all duration-700 ease-out"
            style={{
              opacity: isMounted ? 1 : 0,
              transform: isMounted ? 'translateY(0)' : 'translateY(24px)',
            }}
          >
            {/* Eyebrow tag — UPDATED copy */}
            <div
              className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full mb-7"
              style={{
                backgroundColor: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.15)',
              }}
            >
              <span className="text-sm" role="img" aria-label="sparkles">✨</span>
              <span
                className="text-xs font-semibold tracking-wide uppercase"
                style={{
                  color: '#6366f1',
                  fontFamily: "'Georgia', serif",
                  letterSpacing: '0.08em',
                }}
              >
                Powered by the world's most powerful AI
              </span>
            </div>

            {/* Headline */}
            <h1
              className="mb-6"
              style={{
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontWeight: 700,
                lineHeight: 1.08,
                color: '#1B1B18',
                letterSpacing: '-0.025em',
              }}
            >
              <span className="block text-4xl md:text-5xl lg:text-6xl">
                Eat well,
              </span>
              <span
                className="block text-4xl md:text-5xl lg:text-6xl mt-1"
                style={{ color: '#6366f1' }}
              >
                effortlessly.
              </span>
            </h1>

            {/* Subheadline */}
            <p
              className="text-base md:text-lg mb-9 max-w-lg leading-relaxed"
              style={{
                color: '#6B6B63',
                fontFamily: "'Georgia', serif",
                lineHeight: 1.7,
              }}
            >
              Cheffy generates personalized meal plans calibrated to your macros,
              budget, and local grocery prices — so every plate moves you
              closer to your goals.
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 mb-12">
              <button
                onClick={onGetStarted}
                className="group px-7 py-3.5 rounded-xl font-semibold text-white text-sm transition-all duration-300 hover:shadow-xl hover:translate-y-[-2px] flex items-center space-x-2.5"
                style={{
                  backgroundColor: '#6366f1',
                  fontFamily: "'Georgia', serif",
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.25)',
                }}
              >
                <span>Start Your Free Trial</span>
                <ArrowRight
                  size={17}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </button>

              <span
                className="text-xs"
                style={{
                  color: '#9C9C94',
                  fontFamily: "'Georgia', serif",
                }}
              >
                7 days free · No credit card required
              </span>
            </div>

            {/* Stats Row — metrics removed, only Personalized Plans remains */}
            <div className="flex flex-wrap gap-6">
              {stats.map((stat, i) => (
                <div
                  key={i}
                  className="flex items-center space-x-2.5 transition-all duration-500"
                  style={{
                    opacity: isMounted ? 1 : 0,
                    transform: isMounted ? 'translateY(0)' : 'translateY(12px)',
                    transitionDelay: `${400 + i * 120}ms`,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: 'rgba(99, 102, 241, 0.08)',
                      color: '#6366f1',
                    }}
                  >
                    {stat.icon}
                  </div>
                  <div>
                    <div
                      className="text-xs"
                      style={{
                        color: '#9C9C94',
                        fontFamily: "'Georgia', serif",
                      }}
                    >
                      {stat.label}
                    </div>
                    <div
                      className="text-sm font-bold"
                      style={{
                        color: '#1B1B18',
                        fontFamily: "'Georgia', serif",
                      }}
                    >
                      {stat.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Right Column: Hero Visual ─── */}
          <div
            className="relative transition-all duration-1000 ease-out"
            style={{
              opacity: isMounted ? 1 : 0,
              transform: isMounted ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.97)',
              transitionDelay: '300ms',
            }}
          >
            {/* Main Image Card */}
            <div
              className="relative rounded-3xl overflow-hidden"
              style={{
                boxShadow:
                  '0 25px 60px -12px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
              }}
            >
              <img
                src="https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&h=900&fit=crop&q=80"
                alt="Healthy meal prep bowls with colorful fresh ingredients"
                className="w-full h-auto"
                loading="eager"
                style={{ aspectRatio: '4/4.5' }}
              />

              {/* Overlay gradient at bottom */}
              <div
                className="absolute bottom-0 left-0 right-0 h-32"
                style={{
                  background:
                    'linear-gradient(to top, rgba(27, 27, 24, 0.55), transparent)',
                }}
              />

              {/* Floating card on image */}
              <div
                className="absolute bottom-5 left-5 right-5 p-4 rounded-2xl"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.92)',
                  backdropFilter: 'blur(12px) saturate(180%)',
                  border: '1px solid rgba(255,255,255,0.4)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div
                      className="text-[10px] uppercase tracking-wider font-semibold mb-0.5"
                      style={{
                        color: '#6366f1',
                        fontFamily: "'Georgia', serif",
                      }}
                    >
                      Today's plan
                    </div>
                    <div
                      className="text-sm font-bold"
                      style={{
                        color: '#1B1B18',
                        fontFamily: "'Georgia', serif",
                      }}
                    >
                      2,400 kcal · 180g protein
                    </div>
                  </div>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)' }}
                  >
                    <span className="text-lg">🍳</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating badge — top right */}
            <div
              className="absolute -top-4 -right-4 md:-right-6 p-3 rounded-xl"
              style={{
                backgroundColor: '#FFFFFF',
                boxShadow: '0 8px 30px -4px rgba(0,0,0,0.1)',
                border: '1px solid rgba(0,0,0,0.04)',
                transform: isMounted ? 'rotate(3deg)' : 'rotate(3deg) scale(0.9)',
                opacity: isMounted ? 1 : 0,
                transition: 'all 0.6s ease-out 0.5s',
              }}
            >
              <div className="flex items-center space-x-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                  style={{ backgroundColor: '#eef2ff' }}
                >
                  🎯
                </div>
                <div>
                  <div
                    className="text-[10px]"
                    style={{
                      color: '#9C9C94',
                      fontFamily: "'Georgia', serif",
                    }}
                  >
                    Daily target
                  </div>
                  <div
                    className="text-sm font-bold"
                    style={{
                      color: '#1B1B18',
                      fontFamily: "'Georgia', serif",
                    }}
                  >
                    On track
                  </div>
                </div>
              </div>
            </div>

            {/* Floating badge — bottom left */}
            <div
              className="absolute -bottom-3 -left-3 md:-left-6 p-3 rounded-xl"
              style={{
                backgroundColor: '#FFFFFF',
                boxShadow: '0 8px 30px -4px rgba(0,0,0,0.1)',
                border: '1px solid rgba(0,0,0,0.04)',
                transform: isMounted ? 'rotate(3deg)' : 'rotate(3deg) scale(0.9)',
                opacity: isMounted ? 1 : 0,
                transition: 'all 0.6s ease-out 0.6s',
              }}
            >
              <div className="flex items-center space-x-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                  style={{ backgroundColor: '#eef2ff' }}
                >
                  🥗
                </div>
                <div>
                  <div
                    className="text-[10px]"
                    style={{
                      color: '#9C9C94',
                      fontFamily: "'Georgia', serif",
                    }}
                  >
                    Weekly meals
                  </div>
                  <div
                    className="text-sm font-bold"
                    style={{
                      color: '#1B1B18',
                      fontFamily: "'Georgia', serif",
                    }}
                  >
                    21 planned
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;