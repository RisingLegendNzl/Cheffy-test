// web/src/pages/LandingPage.jsx
import React, { useState, useEffect } from 'react';
import { ChefHat, Menu, X } from 'lucide-react';
import { COLORS } from '../constants';
import HeroSection from '../components/landing/HeroSection';
import FeaturesSection from '../components/landing/FeaturesSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import PricingSection from '../components/landing/PricingSection';
import CTASection from '../components/landing/CTASection';
import Footer from '../components/landing/Footer';
import AuthModal from '../components/AuthModal';

/**
 * Main Landing Page Component
 * Entry point for non-authenticated users
 * 
 * Redesigned with warm editorial aesthetic —
 * organic greens, amber accents, asymmetric layouts
 */
const LandingPage = ({ onSignUp, onSignIn, authLoading = false }) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleGetStarted = () => {
    setShowAuthModal(true);
    setMobileMenuOpen(false);
  };

  const handleCloseAuthModal = () => {
    if (!authLoading) {
      setShowAuthModal(false);
    }
  };

  const handleSignUp = async (credentials) => {
    await onSignUp(credentials);
  };

  const handleSignIn = async (credentials) => {
    await onSignIn(credentials);
  };

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Pricing', href: '#pricing' },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF7' }}>
      {/* ─── Navigation Header ─── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
        style={{
          backgroundColor: scrolled ? 'rgba(250, 250, 247, 0.92)' : 'transparent',
          backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
        }}
      >
        <div className="max-w-7xl mx-auto px-5 md:px-10">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <a href="#" className="flex items-center space-x-2.5 group">
              <div
                className="rounded-xl w-9 h-9 flex items-center justify-center transition-transform duration-300 group-hover:rotate-12"
                style={{ backgroundColor: '#2D6A4F' }}
              >
                <ChefHat className="text-white" size={18} />
              </div>
              <span
                className="text-lg tracking-tight"
                style={{
                  fontFamily: "'Georgia', 'Times New Roman', serif",
                  fontWeight: 700,
                  color: '#1B1B18',
                }}
              >
                Cheffy
              </span>
            </a>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center space-x-8">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm transition-colors duration-200"
                  style={{
                    fontFamily: "'Georgia', serif",
                    color: '#6B6B63',
                    letterSpacing: '0.01em',
                  }}
                  onMouseEnter={(e) => (e.target.style.color = '#1B1B18')}
                  onMouseLeave={(e) => (e.target.style.color = '#6B6B63')}
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center space-x-3">
              <button
                onClick={handleGetStarted}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:shadow-lg hover:translate-y-[-1px]"
                style={{
                  backgroundColor: '#2D6A4F',
                  fontFamily: "'Georgia', serif",
                }}
              >
                Get Started Free
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg transition-colors"
              style={{ color: '#1B1B18' }}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div
          className="md:hidden overflow-hidden transition-all duration-300"
          style={{
            maxHeight: mobileMenuOpen ? '300px' : '0',
            opacity: mobileMenuOpen ? 1 : 0,
            backgroundColor: 'rgba(250, 250, 247, 0.98)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <div className="px-5 pb-5 pt-2 space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block py-3 text-base transition-colors border-b"
                style={{
                  fontFamily: "'Georgia', serif",
                  color: '#1B1B18',
                  borderColor: 'rgba(0,0,0,0.06)',
                }}
              >
                {link.label}
              </a>
            ))}
            <button
              onClick={handleGetStarted}
              className="w-full mt-3 px-5 py-3 rounded-xl text-sm font-semibold text-white"
              style={{
                backgroundColor: '#2D6A4F',
                fontFamily: "'Georgia', serif",
              }}
            >
              Get Started Free
            </button>
          </div>
        </div>
      </nav>

      {/* ─── Main Content ─── */}
      <main>
        <HeroSection onGetStarted={handleGetStarted} />
        <FeaturesSection />
        <HowItWorksSection />
        <PricingSection onGetStarted={handleGetStarted} />
        <CTASection onGetStarted={handleGetStarted} />
      </main>

      {/* ─── Footer ─── */}
      <Footer />

      {/* ─── Auth Modal ─── */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={handleCloseAuthModal}
        onSignUp={handleSignUp}
        onSignIn={handleSignIn}
        loading={authLoading}
      />
    </div>
  );
};

export default LandingPage;