// web/src/components/wizard/PlanSetupWizard.jsx
import React, { useState, useCallback, useMemo } from 'react';
import { RefreshCw, Zap, Save, FolderDown, X, ChevronRight, Check } from 'lucide-react';
import { COLORS, SHADOWS } from '../../constants';

// Wizard internals
import { WIZARD_STEPS } from './wizardSteps';
import { STEP_VALIDATORS, isStepValid } from './wizardValidation';
import StepProgressBar from './StepProgressBar';
import WizardStepHeader from './WizardStepHeader';

// Step content components
import PersonalInfoStep from './PersonalInfoStep';
import FitnessGoalsStep from './FitnessGoalsStep';
import MealPreferencesStep from './MealPreferencesStep';
import MealInspirationStep from './MealInspirationStep';
import ReviewStep from './ReviewStep';

/**
 * PlanSetupWizard
 *
 * Multi-step form wizard that replaces the old inline <form> in MainApp.
 * Owns step navigation and validation state; all form data lives in the parent.
 */
const PlanSetupWizard = ({
  // Form data (owned by App.jsx)
  formData,
  onChange,
  onSliderChange,
  onSubmit,

  // Profile actions
  onLoadProfile,
  onSaveProfile,

  // Auth & loading states
  loading,
  isAuthReady,
  userId,
  firebaseConfig,
  firebaseInitializationError,

  // Mobile
  onClose,
  isMobile,
}) => {
  // --- Internal wizard state ---
  const [currentStep, setCurrentStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [slideDirection, setSlideDirection] = useState('right');
  const [isAnimating, setIsAnimating] = useState(false);

  const stepConfig = WIZARD_STEPS[currentStep];
  const isLastStep = currentStep === WIZARD_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  // Can the user proceed? (validation check without setting errors)
  const canProceed = useMemo(
    () => isStepValid(stepConfig.id, formData),
    [stepConfig.id, formData]
  );

  const isProfileActionDisabled =
    !isAuthReady || !userId || userId.startsWith('local_');

  // --- Error-clearing onChange wrapper ---
  const handleFieldChange = useCallback(
    (e) => {
      onChange(e);
      const fieldName = e.target.name;
      if (errors[fieldName]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[fieldName];
          return next;
        });
      }
    },
    [onChange, errors]
  );

  // --- Step navigation ---
  const goForward = useCallback(() => {
    if (isAnimating) return;

    // Validate current step
    const validator = STEP_VALIDATORS[stepConfig.id];
    if (validator) {
      const stepErrors = validator(formData);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        return;
      }
    }

    setSlideDirection('right');
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentStep((s) => s + 1);
      setErrors({});
      setTimeout(() => setIsAnimating(false), 50);
    }, 200);
  }, [isAnimating, stepConfig.id, formData]);

  const goBack = useCallback(() => {
    if (isAnimating || isFirstStep) return;
    setSlideDirection('left');
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentStep((s) => s - 1);
      setErrors({});
      setTimeout(() => setIsAnimating(false), 50);
    }, 200);
  }, [isAnimating, isFirstStep]);

  // --- Fast-step navigation ---

  /**
   * Determines whether the user is allowed to jump to `targetIndex`.
   * Rule: every step *before* the target must be valid.
   * Going backward is always allowed.
   */
  const canReachStep = useCallback(
    (targetIndex) => {
      // Always allow going to earlier (completed) steps
      if (targetIndex < currentStep) return true;
      // Don't allow clicking the current step (no-op)
      if (targetIndex === currentStep) return false;
      // For future steps, validate every preceding step including current
      for (let i = 0; i < targetIndex; i++) {
        const stepId = WIZARD_STEPS[i].id;
        if (!isStepValid(stepId, formData)) return false;
      }
      return true;
    },
    [currentStep, formData]
  );

  /**
   * Jump directly to a specific step index.
   * Respects animation lock and validation via canReachStep.
   */
  const goToStep = useCallback(
    (targetIndex) => {
      if (isAnimating) return;
      if (targetIndex === currentStep) return;
      if (!canReachStep(targetIndex)) return;

      const direction = targetIndex > currentStep ? 'right' : 'left';
      setSlideDirection(direction);
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep(targetIndex);
        setErrors({});
        setTimeout(() => setIsAnimating(false), 50);
      }, 200);
    },
    [isAnimating, currentStep, canReachStep]
  );

  // --- Form submission (only on last step) ---
  const handleFormSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (isLastStep) {
        onSubmit(e);
      } else {
        goForward();
      }
    },
    [isLastStep, onSubmit, goForward]
  );

  // --- Animation class ---
  const getAnimationClass = () => {
    if (isAnimating) return 'animate-wizardSlideOut';
    return slideDirection === 'right'
      ? 'animate-wizardSlideInRight'
      : 'animate-wizardSlideInLeft';
  };

  // --- Step content renderer ---
  const renderStepContent = () => {
    switch (stepConfig.id) {
      case 'personal':
        return (
          <PersonalInfoStep
            formData={formData}
            onChange={handleFieldChange}
            errors={errors}
          />
        );
      case 'goals':
        return (
          <FitnessGoalsStep
            formData={formData}
            onChange={handleFieldChange}
            errors={errors}
          />
        );
      case 'preferences':
        return (
          <MealPreferencesStep formData={formData} onChange={handleFieldChange} />
        );
      case 'inspiration':
        return (
          <MealInspirationStep formData={formData} onChange={handleFieldChange} />
        );
      case 'review':
        return <ReviewStep formData={formData} />;
      default:
        return null;
    }
  };

  return (
    <div>
      {/* ===== WIZARD HEADER ===== */}
      <div className="flex justify-between items-center mb-5">
        <h2
          className="text-2xl font-bold"
          style={{ color: COLORS.primary[600] }}
        >
          Plan Setup
        </h2>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onLoadProfile}
            disabled={isProfileActionDisabled}
            className="flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg shadow transition-colors hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: COLORS.info.main,
              color: '#fff',
            }}
            title="Load Saved Profile"
          >
            <FolderDown size={14} className="mr-1" /> Load
          </button>
          <button
            type="button"
            onClick={onSaveProfile}
            disabled={isProfileActionDisabled}
            className="flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg shadow transition-colors hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: COLORS.success.main,
              color: '#fff',
            }}
            title="Save Current Profile"
          >
            <Save size={14} className="mr-1" /> Save
          </button>
          {/* Mobile close button */}
          {onClose && (
            <button
              type="button"
              className="md:hidden p-1.5"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* ===== PROGRESS BAR (with fast-step navigation) ===== */}
      <StepProgressBar
        currentStep={currentStep}
        steps={WIZARD_STEPS}
        onStepClick={goToStep}
        canReachStep={canReachStep}
      />

      {/* ===== CARD CONTAINER ===== */}
      <form
        onSubmit={handleFormSubmit}
        className="rounded-2xl overflow-hidden"
        style={{
          background: '#fff',
          border: `1px solid ${COLORS.gray[200]}`,
          boxShadow: SHADOWS.lg,
        }}
      >
        {/* Step header */}
        <WizardStepHeader step={stepConfig} />

        {/* Animated content area */}
        <div
          className={getAnimationClass()}
          style={{
            padding: '24px',
            maxHeight: 'calc(100vh - 380px)',
            overflowY: 'auto',
          }}
        >
          {renderStepContent()}
        </div>

        {/* ===== FOOTER ===== */}
        <div
          className="flex justify-between items-center gap-3"
          style={{ padding: '16px 24px 24px' }}
        >
          {/* Back button */}
          {!isFirstStep ? (
            <button
              type="button"
              onClick={goBack}
              disabled={isAnimating}
              className="font-semibold rounded-xl transition-all hover:bg-gray-50"
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                border: `1.5px solid ${COLORS.gray[200]}`,
                background: '#fff',
                color: COLORS.gray[600],
                cursor: 'pointer',
              }}
            >
              ← Back
            </button>
          ) : (
            <div /> // Spacer to push Continue to the right
          )}

          {/* Continue or Generate button */}
          {isLastStep ? (
            <button
              type="submit"
              disabled={loading || !isAuthReady || !firebaseConfig}
              className="font-bold rounded-xl transition-all flex items-center gap-2"
              style={{
                padding: '14px 32px',
                fontSize: '15px',
                border: 'none',
                background:
                  loading || !isAuthReady || !firebaseConfig
                    ? COLORS.gray[300]
                    : `linear-gradient(135deg, ${COLORS.primary[500]}, ${COLORS.success.main})`,
                color:
                  loading || !isAuthReady || !firebaseConfig
                    ? COLORS.gray[500]
                    : '#fff',
                cursor:
                  loading || !isAuthReady || !firebaseConfig
                    ? 'not-allowed'
                    : 'pointer',
                boxShadow:
                  loading || !isAuthReady || !firebaseConfig
                    ? 'none'
                    : `0 4px 20px ${COLORS.primary[500]}40`,
                letterSpacing: '0.01em',
              }}
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <Zap size={18} />
                  Generate Plan
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={goForward}
              disabled={isAnimating}
              className="font-semibold rounded-xl transition-all flex items-center gap-1.5"
              style={{
                padding: '12px 28px',
                fontSize: '14px',
                border: 'none',
                background: canProceed ? COLORS.primary[500] : COLORS.gray[200],
                color: canProceed ? '#fff' : COLORS.gray[400],
                cursor: canProceed ? 'pointer' : 'default',
                boxShadow: canProceed
                  ? `0 4px 16px ${COLORS.primary[500]}30`
                  : 'none',
              }}
            >
              {stepConfig.id === 'inspiration' ? 'Continue' : 'Continue'}
              <ChevronRight size={16} />
            </button>
          )}
        </div>

        {/* Firebase error note */}
        {(!isAuthReady || !firebaseConfig) && isLastStep && (
          <p
            className="text-xs text-center pb-4 px-6"
            style={{ color: COLORS.error.main }}
          >
            {firebaseInitializationError || 'Initializing Firebase auth…'}
          </p>
        )}
      </form>

      {/* Step counter */}
      <div
        className="text-center mt-4"
        style={{ fontSize: '12px', color: COLORS.gray[400], opacity: 0.6 }}
      >
        Step {currentStep + 1} of {WIZARD_STEPS.length}
      </div>
    </div>
  );
};

export default PlanSetupWizard;