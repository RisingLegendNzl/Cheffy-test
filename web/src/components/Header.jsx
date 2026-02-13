// web/src/components/Header.jsx
import React, { useState, useEffect } from 'react';
import { ChefHat, Menu, X, User, Settings, LogOut, Bookmark } from 'lucide-react';
import { COLORS, SPACING, SHADOWS, Z_INDEX } from '../constants';
import { APP_CONFIG } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Main app header with branding, user menu, and scroll behavior.
 * Theme-aware: adapts background, text, dropdown to dark/light mode.
 */
const Header = ({ userId, userName, onOpenSettings, onNavigateToProfile, onSignOut, onOpenSavedPlans }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isDark } = useTheme();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const displayName = (() => {
    if (userName && userName.trim()) return userName.trim();
    if (userId && userId.startsWith('local_')) return 'Local User';
    return userId || 'User';
  })();

  // Theme-derived colours
  const headerBg = isDark
    ? (isScrolled ? 'rgba(15, 17, 23, 0.92)' : 'rgba(15, 17, 23, 0.6)')
    : (isScrolled ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0)');
  const borderColor = isDark ? '#2d3148' : COLORS.gray[200];
  const titleColor = isDark ? '#f0f1f5' : COLORS.gray[900];
  const subtitleColor = isDark ? '#6b7280' : COLORS.gray[500];
  const menuBtnColor = isDark ? '#d1d5db' : COLORS.gray[700];

  // Dropdown theme
  const dropdownBg = isDark ? '#1e2130' : '#ffffff';
  const dropdownBorder = isDark ? '#2d3148' : COLORS.gray[200];
  const dropdownShadow = isDark
    ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.08)'
    : SHADOWS['2xl'];
  const userInfoBg = isDark ? '#252839' : COLORS.gray[50];
  const userInfoLabel = isDark ? '#6b7280' : COLORS.gray[500];
  const userInfoName = isDark ? '#f0f1f5' : COLORS.gray[900];
  const menuItemColor = isDark ? '#e5e7eb' : COLORS.gray[900];
  const menuIconColor = isDark ? '#9ca3b0' : COLORS.gray[600];
  const menuHoverBg = isDark ? '#252839' : COLORS.gray[50];
  const dividerColor = isDark ? '#2d3148' : COLORS.gray[200];
  const versionColor = isDark ? '#4b5563' : COLORS.gray[400];

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 border-b transition-all duration-300 ${
          isScrolled ? 'shadow-md' : ''
        }`}
        style={{
          zIndex: Z_INDEX.sticky,
          backgroundColor: headerBg,
          borderColor: isScrolled ? borderColor : 'transparent',
          backdropFilter: isScrolled ? 'blur(20px) saturate(180%)' : 'none',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div
            className={`flex items-center justify-between transition-all duration-300 ${
              isScrolled ? 'py-3' : 'py-4'
            }`}
          >
            {/* Logo and Brand */}
            <div className="flex items-center space-x-3">
              <div
                className={`bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isScrolled ? 'w-10 h-10' : 'w-12 h-12'
                }`}
              >
                <ChefHat className="text-white" size={isScrolled ? 20 : 24} />
              </div>
              <div>
                <h1
                  className={`font-bold font-poppins transition-all duration-300 ${
                    isScrolled ? 'text-xl' : 'text-2xl'
                  }`}
                  style={{ color: titleColor }}
                >
                  Cheffy
                </h1>
                {!isScrolled && (
                  <p className="text-xs" style={{ color: subtitleColor }}>
                    Your AI Meal Planner
                  </p>
                )}
              </div>
            </div>

            {/* User Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-full transition-colors"
              style={{ color: menuBtnColor }}
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 animate-fadeIn"
            style={{
              zIndex: Z_INDEX.dropdown - 1,
              backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.25)',
            }}
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Menu Panel */}
          <div
            className="fixed top-16 right-4 w-64 rounded-xl animate-scaleIn"
            style={{
              zIndex: Z_INDEX.dropdown,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              boxShadow: dropdownShadow,
            }}
          >
            <div className="p-2">
              {/* User Info */}
              {userId && (
                <div
                  className="px-4 py-3 mb-2 rounded-lg"
                  style={{ backgroundColor: userInfoBg }}
                >
                  <p className="text-xs mb-1" style={{ color: userInfoLabel }}>
                    Signed in as
                  </p>
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: userInfoName }}
                  >
                    {displayName}
                  </p>
                </div>
              )}

              {/* Menu Items — Issue #2: ensure visible text in dark mode */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onNavigateToProfile && onNavigateToProfile();
                }}
                className="w-full flex items-center px-4 py-3 rounded-lg transition-fast text-left"
                style={{ color: menuItemColor }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = menuHoverBg)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <User size={18} className="mr-3" style={{ color: menuIconColor }} />
                <span>Edit Profile</span>
              </button>

              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenSavedPlans && onOpenSavedPlans();
                }}
                className="w-full flex items-center px-4 py-3 rounded-lg transition-fast text-left"
                style={{ color: menuItemColor }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = menuHoverBg)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Bookmark size={18} className="mr-3" style={{ color: menuIconColor }} />
                <span>My Saved Plans</span>
              </button>

              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenSettings && onOpenSettings();
                }}
                className="w-full flex items-center px-4 py-3 rounded-lg transition-fast text-left"
                style={{ color: menuItemColor }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = menuHoverBg)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Settings size={18} className="mr-3" style={{ color: menuIconColor }} />
                <span>Settings</span>
              </button>

              {/* Sign Out — Issue #4: fix divider lines in dark mode */}
              {userId && !userId.startsWith('local_') && (
                <>
                  <div
                    className="my-2"
                    style={{
                      height: '1px',
                      backgroundColor: dividerColor,
                    }}
                  />

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onSignOut && onSignOut();
                    }}
                    className="w-full flex items-center px-4 py-3 rounded-lg transition-fast text-left"
                    style={{ color: COLORS.error.main }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = isDark ? 'rgba(239,68,68,0.1)' : '#fef2f2')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <LogOut size={18} className="mr-3" style={{ color: COLORS.error.main }} />
                    <span>Sign Out</span>
                  </button>
                </>
              )}
            </div>

            {/* App Version — Issue #4: fix bottom divider */}
            <div
              className="px-4 py-2 text-center"
              style={{
                borderTop: `1px solid ${dividerColor}`,
              }}
            >
              <p className="text-xs" style={{ color: versionColor }}>
                v{APP_CONFIG.version}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Spacer */}
      <div className={isScrolled ? 'h-16' : 'h-20'} />
    </>
  );
};

export default Header;