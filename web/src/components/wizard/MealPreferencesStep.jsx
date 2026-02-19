// web/src/components/wizard/MealPreferencesStep.jsx
import React from 'react';
import FloatingInput from './FloatingInput';
// No changes needed to this file — FloatingSelect and DayPicker handle dark mode.
import React from 'react';
import FloatingSelect from './FloatingSelect';
import DayPicker from './DayPicker';

const MealPreferencesStep = ({ formData, onChange }) => {
  return (
    <div className="flex flex-col gap-5">
      <FloatingSelect
        label="Dietary Preference"
        name="dietary"
        value={formData.dietary}
        onChange={onChange}
        options={[
          { value: 'None', label: 'No Restrictions' },
          { value: 'Vegetarian', label: 'Vegetarian' },
        ]}
      />

      <FloatingSelect
        label="Meals Per Day"
        name="eatingOccasions"
        value={formData.eatingOccasions}
        onChange={onChange}
        options={[
          { value: '3', label: '3 Meals' },
          { value: '4', label: '4 Meals (3 + 1 Snack)' },
          { value: '5', label: '5 Meals (3 + 2 Snacks)' },
        ]}
      />

      <FloatingSelect
        label="Grocery Store"
        name="store"
        value={formData.store}
        onChange={onChange}
        options={[
          { value: 'Woolworths', label: 'Woolworths' },
          { value: 'Coles', label: 'Coles' },
        ]}
      />

      <FloatingSelect
        label="Budget Priority"
        name="costPriority"
        value={formData.costPriority}
        onChange={onChange}
        options={[
          { value: 'Extreme Budget', label: 'Extreme Budget' },
          { value: 'Best Value', label: 'Best Value' },
          { value: 'Quality Focus', label: 'Quality Focus' },
        ]}
      />

      <FloatingSelect
        label="Meal Variety"
        name="mealVariety"
        value={formData.mealVariety}
        onChange={onChange}
        options={[
          { value: 'High Repetition', label: 'High Repetition (more consistency)' },
          { value: 'Balanced Variety', label: 'Balanced Variety' },
          { value: 'Low Repetition', label: 'Low Repetition (more variety)' },
        ]}
      />

      <FloatingInput
        label="Cuisine Profile"
        name="cuisine"
        value={formData.cuisine}
        onChange={onChange}
        placeholder="e.g., Mediterranean, Spicy Thai, Asian fusion"
      />

      <DayPicker value={formData.days} onChange={onChange} />
    </div>
  );
};

export default MealPreferencesStep;
export default MealPreferencesStep;
