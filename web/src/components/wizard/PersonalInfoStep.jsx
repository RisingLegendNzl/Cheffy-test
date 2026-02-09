// web/src/components/wizard/PersonalInfoStep.jsx
import React from 'react';
import FloatingInput from './FloatingInput';
import FloatingSelect from './FloatingSelect';

const PersonalInfoStep = ({ formData, onChange, errors }) => {
  return (
    <div className="flex flex-col gap-4">
      <FloatingInput
        label="Name"
        name="name"
        value={formData.name}
        onChange={onChange}
        placeholder="What should we call you?"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FloatingInput
          label="Height"
          name="height"
          type="number"
          value={formData.height}
          onChange={onChange}
          suffix="cm"
          required
          error={errors.height}
          min="100"
          max="250"
        />
        <FloatingInput
          label="Weight"
          name="weight"
          type="number"
          value={formData.weight}
          onChange={onChange}
          suffix="kg"
          required
          error={errors.weight}
          min="30"
          max="300"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FloatingInput
          label="Age"
          name="age"
          type="number"
          value={formData.age}
          onChange={onChange}
          required
          error={errors.age}
          min="13"
          max="99"
        />
        <FloatingInput
          label="Body Fat %"
          name="bodyFat"
          type="number"
          value={formData.bodyFat}
          onChange={onChange}
          suffix="%"
          placeholder="Optional"
          error={errors.bodyFat}
          min="3"
          max="60"
        />
      </div>

      <FloatingSelect
        label="Gender"
        name="gender"
        value={formData.gender}
        onChange={onChange}
        required
        error={errors.gender}
        options={[
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
        ]}
      />
    </div>
  );
};

export default PersonalInfoStep;
