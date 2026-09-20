import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { NewEmergencyPage } from './pages/NewEmergencyPage';
import { EmergencyDetailPage } from './pages/EmergencyDetailPage';
import { SimulationPage } from './pages/SimulationPage';
import { HistoryPage } from './pages/HistoryPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/emergency/new" element={<NewEmergencyPage />} />
        <Route path="/emergency/:id" element={<EmergencyDetailPage />} />
        <Route path="/simulation" element={<SimulationPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
