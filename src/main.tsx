import { LanguageProvider } from './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReactFlowProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ReactFlowProvider>
  </React.StrictMode>,
);
