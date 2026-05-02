import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { NcrisProvider } from './bridge/NcrisProvider.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NcrisProvider>
      <App />
    </NcrisProvider>
  </React.StrictMode>
);
