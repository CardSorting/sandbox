import React, { useState, useEffect, useCallback, Suspense, memo, useRef } from 'react';
import * as Babel from '@babel/standalone';
import * as ReactDOM from 'react-dom/client';
import { debounce } from 'lodash';

const DEBOUNCE_DELAY = 500; // ms
const MOBILE_SIZES = {
  'iPhone SE': { width: 375, height: 667 },
  'iPhone XR': { width: 414, height: 896 },
  'iPad': { width: 768, height: 1024 },
};

// Utility function to transpile code using Babel
const transpileCode = (code) => {
  return Babel.transform(code, {
    presets: ['react'],
    plugins: [['transform-react-jsx', { pragma: 'React.createElement' }]],
    filename: 'user-component.jsx',
  }).code;
};

// Create a sandbox environment for isolated code execution
const createSandboxEnvironment = () => ({
  React,
  ReactDOM,
  ...React,
});

// Evaluate and render the user-provided code
const evaluateCode = (code, sandboxEnv) => {
  const transpiledCode = transpileCode(code);
  const wrappedCode = `
    const module = { exports: {} };
    const require = (moduleName) => moduleName === 'react' ? React : ReactDOM;
    ${transpiledCode}
    return module.exports.default || module.exports;
  `;

  try {
    const func = new Function(...Object.keys(sandboxEnv), wrappedCode);
    const result = func(...Object.values(sandboxEnv));
    return React.isValidElement(result) ? () => result : result;
  } catch (error) {
    return () => (
      <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
        <h2 className="text-lg font-semibold mb-2">Evaluation Error:</h2>
        <pre className="whitespace-pre-wrap">{error.message}</pre>
      </div>
    );
  }
};

// ErrorBoundary Component to catch JavaScript errors anywhere in child components
const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      setError(event.error);
    };

    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  if (error) {
    return (
      <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
        <h2 className="text-lg font-semibold mb-2">Runtime Error:</h2>
        <pre className="whitespace-pre-wrap">{error.message}</pre>
      </div>
    );
  }

  return <>{children}</>;
};

// MiniBrowser Component that dynamically renders user-provided components
const MiniBrowser: React.FC<{ Component: React.ComponentType }> = memo(({ Component }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobileSize, setMobileSize] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<ReactDOM.Root | null>(null);

  useEffect(() => {
    if (containerRef.current && !rootRef.current) {
      rootRef.current = ReactDOM.createRoot(containerRef.current);
    }

    return () => {
      if (rootRef.current) {
        rootRef.current.unmount();
        rootRef.current = null; // Properly clean up rootRef to avoid updating an unmounted root
      }
    };
  }, [containerRef]);

  useEffect(() => {
    if (rootRef.current) {
      rootRef.current.render(
        <ErrorBoundary>
          <Suspense fallback={<div>Loading...</div>}>
            <Component />
          </Suspense>
        </ErrorBoundary>
      );
    }
  }, [Component]);

  return (
    <div className={`border rounded-lg overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Control Panel */}
      <div className="bg-gray-200 p-2 flex items-center">
        <button onClick={() => setIsFullscreen(!isFullscreen)} className="px-2 py-1 bg-green-500 text-white rounded">
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
        <select onChange={(e) => setMobileSize(MOBILE_SIZES[e.target.value] || null)} className="px-2 py-1 rounded">
          <option value="">Desktop</option>
          {Object.keys(MOBILE_SIZES).map(device => <option key={device} value={device}>{device}</option>)}
        </select>
        <div className="ml-2 px-2 py-1 bg-white rounded flex-grow">sandbox://localhost</div>
      </div>
      {/* Output Area */}
      <div className="p-4 bg-white" style={{ height: '400px', overflowY: 'auto', ...mobileSize }}>
        <div ref={containerRef} />
      </div>
    </div>
  );
});

const CodeEditor: React.FC<{ code: string; onChange: (code: string) => void; onSave: (name: string, code: string) => void }> = ({ code, onChange, onSave }) => {
  const [componentName, setComponentName] = useState('');

  const handleSave = () => {
    if (componentName.trim()) {
      onSave(componentName, code);
      setComponentName('');
    } else {
      alert('Please enter a component name before saving.');
    }
  };

  return (
    <div className="relative">
      <textarea value={code} onChange={(e) => onChange(e.target.value)} className="w-full h-96 p-2 font-mono text-sm border rounded-md focus:ring-indigo-500" spellCheck="false" />
      <div className="absolute top-2 right-2 space-x-2">
        <input type="text" value={componentName} onChange={(e) => setComponentName(e.target.value)} placeholder="Component Name" className="px-2 py-1 border rounded" />
        <button onClick={handleSave} className="px-2 py-1 bg-blue-500 text-white rounded">Save</button>
      </div>
    </div>
  );
};

// Sidebar Component for managing history
const Sidebar: React.FC<{ history: Array<{ name: string; code: string }>; onSelect: (code: string) => void; onDelete: (index: number) => void }> = ({ history, onSelect, onDelete }) => (
  <div className="w-64 bg-gray-100 p-4 h-screen overflow-y-auto">
    <h2 className="text-xl font-bold mb-4">Component History</h2>
    {history.map((item, index) => (
      <div key={index} className="mb-2 p-2 bg-white rounded shadow">
        <h3 className="font-semibold">{item.name}</h3>
        <button onClick={() => onSelect(item.code)} className="text-blue-500 mr-2">Load</button>
        <button onClick={() => onDelete(index)} className="text-red-500">Delete</button>
      </div>
    ))}
  </div>
);

// Main Sandbox Component
const Sandbox: React.FC = () => {
  const [code, setCode] = useState('');
  const [Component, setComponent] = useState<React.ComponentType>(() => () => null);
  const [history, setHistory] = useState<Array<{ name: string; code: string }>>([]);

  const debouncedCodeEvaluation = useCallback(
    debounce((code: string) => {
      const sandboxEnv = createSandboxEnvironment();
      const evaluatedComponent = evaluateCode(code, sandboxEnv);
      setComponent(() => evaluatedComponent);
    }, DEBOUNCE_DELAY),
    []
  );

  useEffect(() => {
    debouncedCodeEvaluation(code);
  }, [code, debouncedCodeEvaluation]);

  return (
    <div className="flex">
      <Sidebar history={history} onSelect={setCode} onDelete={(index) => setHistory(prev => prev.filter((_, i) => i !== index))} />
      <div className="flex-1 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <h3 className="text-lg leading-6 font-medium text-gray-900">React Sandbox</h3>
            </div>
            <CodeEditor code={code} onChange={setCode} onSave={(name, code) => setHistory(prev => [...prev, { name, code }])} />
          </div>
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Output</h3>
            </div>
            <MiniBrowser Component={Component} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sandbox;
