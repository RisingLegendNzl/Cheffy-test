// web/src/components/wizard/wizardValidation.js
// Per-step validation for the Plan Setup Wizard.
// Each validator returns an object of { fieldName: 'Error message' }.
// Empty object {} = step is valid.

const VALID_ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'veryActive'];
const VALID_GOALS = ['maintain', 'cut_moderate', 'cut_aggressive', 'bulk_lean', 'bulk_aggressive'];

export const STEP_VALIDATORS = {
  personal: (formData) => {
    const errors = {};
    const height = parseFloat(formData.height);
    const weight = parseFloat(formData.weight);
    const age = parseInt(formData.age, 10);
    const bodyFat = parseFloat(formData.bodyFat);

    if (!formData.height || isNaN(height) || height < 100 || height > 250) {
      errors.height = 'Enter a height between 100–250 cm';
    }
    if (!formData.weight || isNaN(weight) || weight < 30 || weight > 300) {
      errors.weight = 'Enter a weight between 30–300 kg';
    }
    if (!formData.age || isNaN(age) || age < 13 || age > 99) {
      errors.age = 'Enter an age between 13–99';
    }
    if (!formData.gender) {
      errors.gender = 'Please select your gender';
    }
    // bodyFat is optional, but if provided it must be reasonable
    if (formData.bodyFat && formData.bodyFat !== '' && (isNaN(bodyFat) || bodyFat < 3 || bodyFat > 60)) {
      errors.bodyFat = 'Body fat should be between 3–60%';
    }

    return errors;
  },

  goals: (formData) => {
    const errors = {};
    if (!formData.activityLevel || !VALID_ACTIVITY_LEVELS.includes(formData.activityLevel)) {
      errors.activityLevel = 'Select your activity level';
    }
    if (!formData.goal || !VALID_GOALS.includes(formData.goal)) {
      errors.goal = 'Select a fitness goal';
    }
    return errors;
  },

  preferences: () => ({}),

  review: () => ({}),
};

/**
 * Check if a step is valid without setting errors.
 * Used for enabling/disabling the Continue button.
 */
export const isStepValid = (stepId, formData) => {
  const validator = STEP_VALIDATORS[stepId];
  if (!validator) return true;
  return Object.keys(validator(formData)).length === 0;
};
