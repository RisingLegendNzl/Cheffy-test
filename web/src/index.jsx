// web/src/index.jsx
import './theme-variables.css';          // Theme custom properties (must be first)
import './animations.css';
import './dashboard-enhancements.css';
import './concept-b-rings.css';
import './mpd-theme-override.css';       // Nutrition card light-mode overrides
import './cheffy-patches.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ThemeProvider } from './contexts/ThemeContext';
import './cheffy-sticky-tabs-enhancements.css';

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);

// ThemeProvider wraps the entire app so every component can
// access theme state via the useTheme() hook.
root.render(
    <ThemeProvider>
        <App />
    </ThemeProvider>
);