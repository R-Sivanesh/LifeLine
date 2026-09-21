import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './pages/HomePage';
import { OperationsPage } from './pages/OperationsPage';
import { EmergencyDetailPage } from './pages/EmergencyDetailPage';
import { HistoryPage } from './pages/HistoryPage';
import { AmbulanceTrackerPage } from './pages/AmbulanceTrackerPage';
import { HospitalPortalPage } from './pages/HospitalPortalPage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Unified LifeLine Entry Page & Patient Flow (No Login Required) */}
          <Route path="/" element={<HomePage />} />
          <Route path="/emergency" element={<HomePage />} />
          <Route path="/emergency/new" element={<HomePage />} />
          <Route path="/emergency/:id" element={<EmergencyDetailPage />} />

          {/* Authenticated Ambulance Driver Workspace */}
          <Route
            path="/ambulance/tracker"
            element={
              <ProtectedRoute allowedRoles={['DRIVER', 'ADMIN']}>
                <AmbulanceTrackerPage />
              </ProtectedRoute>
            }
          />
          <Route path="/tracker" element={<Navigate to="/ambulance/tracker" replace />} />

          {/* Authenticated Hospital Staff Workspace */}
          <Route
            path="/hospital/portal"
            element={
              <ProtectedRoute allowedRoles={['HOSPITAL_STAFF', 'ADMIN']}>
                <HospitalPortalPage />
              </ProtectedRoute>
            }
          />
          <Route path="/hospital" element={<Navigate to="/hospital/portal" replace />} />

          {/* Authenticated Operations & Dispatch Command Center */}
          <Route
            path="/operations"
            element={
              <ProtectedRoute allowedRoles={['OPERATOR', 'ADMIN']}>
                <OperationsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/simulation" element={<Navigate to="/operations" replace />} />
          <Route path="/dashboard" element={<Navigate to="/operations" replace />} />

          {/* Authenticated Incident History & Case Audit Log */}
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage />
              </ProtectedRoute>
            }
          />

          {/* Catch-all fallback redirects back to unified LifeLine entry */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
