// web/src/components/wizard/wizardSteps.js
// Step definitions for the Plan Setup Wizard.

export const WIZARD_STEPS = [
  {
    id: 'personal',
    title: 'About You',
    subtitle: 'Basic body metrics for accurate calculations',
    icon: '👤',
    accentColor: '#6366f1', // primary[500]
  },
  {
    id: 'goals',
    title: 'Your Goals',
    subtitle: 'Define what you want to achieve',
    icon: '🎯',
    accentColor: '#f59e0b', // amber
  },
  {
    id: 'preferences',
    title: 'Preferences',
    subtitle: 'Customize your meal plan experience',
    icon: '🍳',
    accentColor: '#10b981', // success green
  },
  {
    id: 'inspiration',
    title: 'Meal Inspiration',
    subtitle: 'Dream up any meals you can imagine',
    icon: '👨‍🍳',
    accentColor: '#8b5cf6', // violet
  },
  {
    id: 'review',
    title: 'Review & Go',
    subtitle: 'Confirm your setup and generate',
    icon: '🚀',
    accentColor: '#f43f5e', // rose
  },
];
