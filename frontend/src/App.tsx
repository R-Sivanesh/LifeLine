import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { OperationsPage } from './pages/OperationsPage';
import { EmergencyDetailPage } from './pages/EmergencyDetailPage';
import { HistoryPage } from './pages/HistoryPage';
import { AmbulanceTrackerPage } from './pages/AmbulanceTrackerPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Simple Emergency Experience */}
        <Route path="/" element={<HomePage />} />
        <Route path="/emergency" element={<HomePage />} />
        <Route path="/emergency/new" element={<HomePage />} />
        <Route path="/emergency/:id" element={<EmergencyDetailPage />} />
        
        {/* Dedicated Operations & Demo Simulation Center */}
        <Route path="/operations" element={<OperationsPage />} />
        <Route path="/simulation" element={<OperationsPage />} />
        <Route path="/dashboard" element={<Navigate to="/operations" replace />} />
        
        {/* Ambulance Driver Real-time GPS Tracker */}
        <Route path="/ambulance/tracker" element={<AmbulanceTrackerPage />} />
        <Route path="/tracker" element={<AmbulanceTrackerPage />} />
        
        {/* History & Case Log */}
        <Route path="/history" element={<HistoryPage />} />
        
        {/* Catch-all fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
