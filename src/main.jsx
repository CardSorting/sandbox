// src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/SandboxIDE'; // Ensure this path is correct
import './index.css'; // Import Tailwind CSS

const rootElement = document.getElementById('app');
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);