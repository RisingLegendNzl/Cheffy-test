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
 *
 * The .wizard-form-exclude class on the outer form tells theme-variables.css
 * to skip dark-mode overrides on inputs inside this wizard (issue #6).
 */
const PlanSetupWizard = ({
  formData,
  onChange,
  onSliderChange,
  onSubmit,
  onLoadProfile,
  onSaveProfile,
  loading,
  isAuthReady,
  userId,
  firebaseConfig,
  firebaseInitializationError,
  onClose,
  isMobile,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [slideDirection, setSlideDirection] = useState('right');
  const [isAnimating, setIsAnimating] = useState(false);

  const stepConfig = WIZARD_STEPS[currentStep];
  const isLastStep = currentStep === WIZARD_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  const canProceed = useMemo(
    () => isStepValid(stepConfig.id, formData),
    [stepConfig.id, formData]
  );

  const isProfileActionDisabled =
    !isAuthReady || !userId || userId.startsWith('local_');

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

  const goForward = useCallback(() => {
    if (isAnimating) return;
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

  const canReachStep = useCallback(
    (targetIndex) => {
      if (targetIndex < currentStep) return true;
      if (targetIndex === currentStep) return false;
      for (let i = 0; i < targetIndex; i++) {
        const stepId = WIZARD_STEPS[i].id;
        if (!isStepValid(stepId, formData)) return false;
      }
      return true;
    },
    [currentStep, formData]
  );

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

  const getAnimationClass = () => {
    if (isAnimating) return 'animate-wizardSlideOut';
    return slideDirection === 'right'
      ? 'animate-wizardSlideInRight'
      : 'animate-wizardSlideInLeft';
  };

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

      {/* ===== PROGRESS BAR ===== */}
      <StepProgressBar
        currentStep={currentStep}
        steps={WIZARD_STEPS}
        onStepClick={goToStep}
        canReachStep={canReachStep}
      />

      {/* ===== CARD CONTAINER =====
           .wizard-form-exclude prevents dark mode from darkening
           inputs/selects inside the wizard (issue #6).
           .keep-light prevents bg-white override on the card itself. */}
      <form
        onSubmit={handleFormSubmit}
        className="wizard-form-exclude keep-light rounded-2xl overflow-hidden"
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
          {!isFirstStep ? (
            <button
              type="button"
              onClick={goBack}
              className="flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={{
                color: COLORS.gray[600],
                border: `1px solid ${COLORS.gray[300]}`,
              }}
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {isLastStep ? (
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: COLORS.primary[500],
                boxShadow: `0 4px 16px ${COLORS.primary[500]}30`,
              }}
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Zap size={16} />
                  Generate Plan
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={goForward}
              disabled={!canProceed}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: canProceed ? COLORS.primary[500] : COLORS.gray[200],
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