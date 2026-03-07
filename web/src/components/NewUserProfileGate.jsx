// web/src/components/NewUserProfileGate.jsx
// Full-screen onboarding gate shown to new users on first login.
// Requires the user to enter a name before they can proceed to the app.
//
// FIX Issue 5: Added `keep-light` class to the card container so that
// dark-mode CSS overrides in theme-variables.css do not bleed into the
// onboarding UI (input fields, labels, backgrounds).

import React, { useState } from 'react';
import { ChefHat, ArrowRight, User, Sparkles } from 'lucide-react';
import { COLORS, SHADOWS } from '../constants';

/**
 * NewUserProfileGate
 *
 * Renders a blocking overlay on first login that forces the user
 * to provide their name. Once submitted, calls `onComplete` which
 * persists the name and marks the profile as set up.
 *
 * Props:
 *  - formData        {object}   Current form data (reads formData.name)
 *  - onChange         {function} Standard handleChange from App.jsx
 *  - onComplete       {function} Called when the user submits a valid name
 *  - saving           {boolean}  Loading indicator while saving
 */
const NewUserProfileGate = ({ formData, onChange, onComplete, saving = false }) => {
    const [error, setError] = useState('');
    const [touched, setTouched] = useState(false);

    const nameValue = (formData?.name || '').trim();
    const isValid = nameValue.length >= 1;

    const handleSubmit = (e) => {
        e.preventDefault();
        setTouched(true);

        if (!isValid) {
            setError('Please enter your name to continue.');
            return;
        }

        setError('');
        onComplete();
    };

    const handleNameChange = (e) => {
        if (error) setError('');
        onChange(e);
    };

    return (
        <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{
                zIndex: 9999,
                background: 'linear-gradient(135deg, #eef2ff 0%, #faf5ff 50%, #eff6ff 100%)',
            }}
        >
            {/* ── Card — keep-light prevents ALL dark-mode CSS overrides ── */}
            <div
                className="keep-light w-full max-w-md rounded-2xl overflow-hidden animate-scaleIn"
                style={{
                    backgroundColor: '#ffffff',
                    boxShadow: SHADOWS['2xl'] || '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                }}
            >
                {/* Decorative top strip */}
                <div
                    style={{
                        height: '4px',
                        background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7)',
                    }}
                />

                {/* Header section */}
                <div className="keep-light text-center pt-8 pb-4 px-8">
                    <div
                        className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
                        style={{
                            width: '64px',
                            height: '64px',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                        }}
                    >
                        <ChefHat size={32} color="#ffffff" />
                    </div>
                    <h1
                        className="text-2xl font-bold mb-2"
                        style={{ color: '#111827' }}
                    >
                        Welcome to Cheffy!{' '}
                        <Sparkles
                            size={20}
                            className="inline -mt-1"
                            style={{ color: '#f59e0b' }}
                        />
                    </h1>
                    <p className="text-sm" style={{ color: '#6b7280' }}>
                        Let's get you started. First, tell us your name so we can personalise your experience.
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="keep-light px-8 pb-8">
                    <div className="mb-6">
                        <label
                            htmlFor="onboarding-name"
                            className="block text-sm font-semibold mb-2"
                            style={{ color: '#374151' }}
                        >
                            <User size={14} className="inline mr-1.5 -mt-0.5" />
                            Your Name
                        </label>
                        <input
                            id="onboarding-name"
                            type="text"
                            name="name"
                            value={formData?.name || ''}
                            onChange={handleNameChange}
                            placeholder="Enter your name"
                            autoFocus
                            autoComplete="given-name"
                            className="w-full px-4 py-3 rounded-xl text-base transition-all duration-200 outline-none"
                            style={{
                                border: `2px solid ${
                                    touched && !isValid
                                        ? '#ef4444'
                                        : '#e5e7eb'
                                }`,
                                backgroundColor: '#f9fafb',
                                color: '#111827',
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = COLORS.primary?.[400] || '#818cf8';
                                e.target.style.boxShadow = `0 0 0 3px ${COLORS.primary?.[100] || 'rgba(99,102,241,0.15)'}`;
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor =
                                    touched && !isValid
                                        ? '#ef4444'
                                        : '#e5e7eb';
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                        {touched && !isValid && error && (
                            <p className="text-sm mt-1.5" style={{ color: '#ef4444' }}>
                                {error}
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                            background: saving
                                ? '#9ca3af'
                                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            boxShadow: saving
                                ? 'none'
                                : '0 4px 14px rgba(99, 102, 241, 0.35)',
                        }}
                    >
                        {saving ? (
                            'Setting up…'
                        ) : (
                            <>
                                Let's Get Started
                                <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default NewUserProfileGate;
