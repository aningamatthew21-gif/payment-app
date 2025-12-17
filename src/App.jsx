import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, signInAnonymously } from 'firebase/auth';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { db, auth } from './firebase-config';

// Contexts
import { PaymentProvider } from './contexts/PaymentProvider.jsx';
import { SettingsProvider } from './contexts/SettingsContext.jsx';

// Pages
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import WeeklyPaymentsPage from './pages/WeeklyPaymentsPage.jsx';
import WeeklyPaymentsDetail from './pages/WeeklyPaymentsDetail.jsx';
import PaymentGeneratorPage from './pages/PaymentGeneratorPage.jsx';
import BudgetManagementPage from './pages/BudgetManagementPage.jsx';
import BankManagementPage from './pages/BankManagementPage.jsx';
import VendorManager from './components/vendors/VendorManager.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

// Components
import MasterLogDashboard from './components/MasterLogDashboard.jsx';
import ExcelDemo from './components/ExcelDemo.jsx';
import AuditService, { AUDIT_ACTIONS } from './services/AuditService';

// Global variables from the environment
const appId = import.meta.env.VITE_FIREBASE_APP_ID;

const AppContent = () => {
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();

  // Initialize audit service
  const auditService = React.useMemo(() => {
    if (db && appId) {
      return new AuditService(db, appId);
    }
    return null;
  }, [db, appId]);

  // Navigation adapter for backward compatibility
  const handleNavigate = (page, params = {}) => {
    console.log('=== navigateTo (Adapter) DEBUG ===');
    console.log('Page:', page);
    console.log('Params:', params);

    switch (page) {
      case 'login':
        navigate('/login');
        break;
      case 'dashboard':
        navigate('/dashboard');
        // Log navigation
        if (auditService && auth?.currentUser) {
          auditService.log(AUDIT_ACTIONS.VIEW_PAGE, 'Dashboard', 'Navigated to dashboard', auth.currentUser);
        }
        break;
      case 'weeklyPayments':
        navigate('/weekly-payments');
        if (auditService && auth?.currentUser) {
          auditService.log(AUDIT_ACTIONS.VIEW_PAGE, 'Weekly Payments', 'Viewed weekly payments', auth.currentUser);
        }
        break;
      case 'weeklyPaymentsDetail':
        navigate('/weekly-payments/detail', { state: params });
        if (auditService && auth?.currentUser) {
          auditService.log(AUDIT_ACTIONS.VIEW_PAGE, 'Weekly Payments Detail', `Viewed detail for sheet: ${params.sheetName}`, auth.currentUser);
        }
        break;
      case 'paymentGenerator':
        navigate('/payment-generator', {
          state: {
            selectedPayments: params.payments,
            initialSheetName: params.sheetName
          }
        });
        if (auditService && auth?.currentUser) {
          auditService.log(AUDIT_ACTIONS.VIEW_PAGE, 'Payment Generator', 'Opened payment generator', auth.currentUser);
        }
        break;
      case 'budgetManagement':
        navigate('/budget-management');
        if (auditService && auth?.currentUser) {
          auditService.log(AUDIT_ACTIONS.VIEW_PAGE, 'Budget Management', 'Viewed budget management', auth.currentUser);
        }
        break;
      case 'bankManagement':
        navigate('/bank-management');
        if (auditService && auth?.currentUser) {
          auditService.log(AUDIT_ACTIONS.VIEW_PAGE, 'Bank Management', 'Viewed bank management', auth.currentUser);
        }
        break;
      case 'vendorManagement':
        navigate('/vendor-management');
        if (auditService && auth?.currentUser) {
          auditService.log(AUDIT_ACTIONS.VIEW_PAGE, 'Vendor Management', 'Viewed vendor database', auth.currentUser);
        }
        break;
      case 'masterLogDashboard':
        navigate('/master-log');
        if (auditService && auth?.currentUser) {
          auditService.log(AUDIT_ACTIONS.VIEW_PAGE, 'Master Log', 'Viewed master log dashboard', auth.currentUser);
        }
        break;
      case 'excelDemo':
        navigate('/excel-demo');
        if (auditService && auth?.currentUser) {
          auditService.log(AUDIT_ACTIONS.VIEW_PAGE, 'Excel Demo', 'Viewed Excel demo', auth.currentUser);
        }
        break;
      case 'settings':
        navigate('/settings');
        if (auditService && auth?.currentUser) {
          auditService.log(AUDIT_ACTIONS.VIEW_PAGE, 'Settings', 'Accessed settings', auth.currentUser);
        }
        break;
      default:
        console.warn(`Unknown page navigation: ${page}`);
        navigate('/dashboard');
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleLogin = async () => {
    try {
      console.log('[App] User clicked Sign In...');

      if (!auth) {
        console.error('[App] Auth not initialized');
        return;
      }

      // Check if user is already signed in
      const currentUser = auth.currentUser;
      if (currentUser) {
        console.log('[App] User already signed in, navigating to dashboard');
        setUserId(currentUser.uid);
        navigate('/dashboard');
        return;
      }

      // Perform anonymous sign-in when user clicks the button
      console.log('[App] Performing anonymous authentication...');
      const result = await signInAnonymously(auth);
      setUserId(result.user.uid);
      console.log('[App] Anonymous sign-in successful, navigating to dashboard');

      // Log successful login
      if (auditService) {
        auditService.log(AUDIT_ACTIONS.LOGIN, 'Authentication', 'Anonymous user logged in successfully', result.user);
      }

      navigate('/dashboard');

    } catch (error) {
      console.error('[App] Anonymous sign-in failed:', error);
      alert('Sign-in failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      console.log('[App] User logging out...');
      const currentUser = auth?.currentUser;

      if (auth) {
        // Log logout before signing out
        if (auditService && currentUser) {
          auditService.log(AUDIT_ACTIONS.LOGOUT, 'Authentication', 'User logged out', currentUser);
        }

        await signOut(auth);
      }
      setUserId(null);
      console.log('[App] User logged out successfully');
      navigate('/login');
    } catch (error) {
      console.error('[App] Logout failed:', error);
      // Still navigate to login page even if logout fails
      setUserId(null);
      navigate('/login');
    }
  };

  // Firebase initialization and auth
  useEffect(() => {
    if (!appId) {
      console.error("Firebase config is missing. App will not function correctly.");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is already signed in (returning user)
        setUserId(user.uid);
        console.log('[App] User already signed in');

        // If on login page, redirect to dashboard
        if (location.pathname === '/login' || location.pathname === '/') {
          navigate('/dashboard');
        }
      } else {
        // No user signed in
        console.log('[App] No user signed in');
        setUserId(null);
        if (location.pathname !== '/login') {
          navigate('/login');
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [appId, navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-xl font-semibold text-gray-700">Loading...</div>
      </div>
    );
  }

  const commonProps = {
    db,
    userId,
    appId,
    onNavigate: handleNavigate,
    onBack: handleBack,
    onLogout: handleLogout,
  };

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
      <Route path="/dashboard" element={<DashboardPage {...commonProps} />} />
      <Route path="/weekly-payments" element={<WeeklyPaymentsPage {...commonProps} />} />
      <Route
        path="/weekly-payments/detail"
        element={<WeeklyPaymentsDetailWrapper commonProps={commonProps} />}
      />
      <Route
        path="/payment-generator"
        element={<PaymentGeneratorWrapper commonProps={commonProps} />}
      />
      <Route path="/budget-management" element={<BudgetManagementPage {...commonProps} />} />
      <Route path="/bank-management" element={<BankManagementPage {...commonProps} />} />
      <Route path="/vendor-management" element={<VendorManager {...commonProps} />} />
      <Route path="/master-log" element={<MasterLogDashboard {...commonProps} onNavigate={handleNavigate} />} />
      <Route path="/excel-demo" element={<ExcelDemo />} />
      <Route path="/settings" element={<SettingsPage {...commonProps} />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

// Wrapper components to handle location state
const WeeklyPaymentsDetailWrapper = ({ commonProps }) => {
  const location = useLocation();
  const sheetName = location.state?.sheetName;

  if (!sheetName) {
    return <Navigate to="/weekly-payments" replace />;
  }

  return <WeeklyPaymentsDetail {...commonProps} sheetName={sheetName} />;
};

const PaymentGeneratorWrapper = ({ commonProps }) => {
  const location = useLocation();
  const selectedPayments = location.state?.selectedPayments;
  const initialSheetName = location.state?.initialSheetName;

  return <PaymentGeneratorPage {...commonProps} selectedPayments={selectedPayments} initialSheetName={initialSheetName} />;
};

const App = () => {
  return (
    <PaymentProvider>
      <SettingsProvider appId={appId}>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </SettingsProvider>
    </PaymentProvider>
  );
};

export default App;
