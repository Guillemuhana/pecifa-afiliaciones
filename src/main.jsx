import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Formulario from './Formulario.jsx';
import Admin from './admin/Admin.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
        <Route path="*" element={<Formulario />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
