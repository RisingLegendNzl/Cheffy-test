// web/src/components/NewUserProfileGate.jsx
// Full-screen onboarding gate shown to new users on first login.
// Requires the user to enter a name before they can proceed to the app.

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
        setTouched(true);
        setError('');
        onChange(e);
    };

    return (
        <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{
                zIndex: 10000,
                background: 'linear-gradient(135deg, #eef2ff 0%, #faf5ff 50%, #f0fdf4 100%)',
            }}
        >
            <div
                className="w-full max-w-md rounded-2xl overflow-hidden"
                style={{
                    backgroundColor: '#fff',
                    boxShadow: SHADOWS['2xl'],
                }}
            >
                {/* Gradient top bar */}
                <div
                    className="h-1.5"
                    style={{
                        background: `linear-gradient(90deg, ${COLORS.primary[500]}, ${COLORS.secondary[500]})`,
                    }}
                />

                {/* Header area */}
                <div className="pt-8 pb-4 px-8 text-center">
                    <div
                        className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                        style={{
                            background: `linear-gradient(135deg, ${COLORS.primary[500]}, ${COLORS.secondary[500]})`,
                        }}
                    >
                        <ChefHat className="text-white" size={32} />
                    </div>

                    <h1
                        className="text-2xl font-bold mb-2"
                        style={{ color: COLORS.gray[900] }}
                    >
                        Welcome to Cheffy!
                    </h1>
                    <p className="text-sm" style={{ color: COLORS.gray[500] }}>
                        Let's get you started. First, tell us your name so we can personalise your experience.
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-8 pb-8">
                    <div className="mb-6">
                        <label
                            htmlFor="onboarding-name"
                            className="block text-sm font-semibold mb-2"
                            style={{ color: COLORS.gray[700] }}
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
                                        ? COLORS.error?.main || '#ef4444'
                                        : COLORS.gray[200]
                                }`,
                                backgroundColor: COLORS.gray[50],
                                color: COLORS.gray[900],
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = COLORS.primary[400];
                                e.target.style.boxShadow = `0 0 0 3px ${COLORS.primary[100]}`;
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor =
                                    touched && !isValid
                                        ? COLORS.error?.main || '#ef4444'
                                        : COLORS.gray[200];
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                        {touched && error && (
                            <p
                                className="mt-2 text-sm"
                                style={{ color: COLORS.error?.main || '#ef4444' }}
                            >
                                {error}
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-base transition-all duration-200"
                        style={{
                            background:
                                saving
                                    ? COLORS.gray[300]
                                    : `linear-gradient(135deg, ${COLORS.primary[500]}, ${COLORS.secondary[500]})`,
                            boxShadow: saving
                                ? 'none'
                                : `0 4px 14px rgba(99, 102, 241, 0.35)`,
                            cursor: saving ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {saving ? (
                            <>
                                <span className="animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                                Saving…
                            </>
                        ) : (
                            <>
                                Continue to Cheffy
                                <ArrowRight size={18} />
                            </>
                        )}
                    </button>

                    {/* Subtle footer note */}
                    <p
                        className="mt-4 text-center text-xs flex items-center justify-center gap-1"
                        style={{ color: COLORS.gray[400] }}
                    >
                        <Sparkles size={12} />
                        You can update your full profile later
                    </p>
                </form>
            </div>
        </div>
    );
};

export default NewUserProfileGate;