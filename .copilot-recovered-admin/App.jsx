import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RegisterPage from './pages/RegisterPage';
import UserManagementPage from './pages/UserManagementPage';
import OrderManagementPage from './pages/OrderManagementPage';
import CategoryManagementPage from './pages/CategoryManagementPage';
import UISettingsPage from './pages/UISettingsPage';
import ProtectedRoute from './layouts/ProtectedRoute';
import AdminRoute from './layouts/AdminRoute';
import ProductsCurationPage from './pages/ProductsCurationPage.jsx';
import SearchKeywordsPage from './pages/SearchKeywordsPage.jsx';
import ProductModerationPage from './pages/ProductModerationPage.jsx';
import ModerationQueuePage from './pages/ModerationQueuePage.jsx';
import VendorAppealsPage from './pages/VendorAppealsPage.jsx';
import ProductRequestsAdminPage from './pages/ProductRequestsAdminPage.jsx';
import ProductRequestDetailPage from './pages/ProductRequestDetailPage.jsx';
import ActiveAdsPage from './pages/ActiveAdsPage.jsx';
import GlobalAuditPage from './pages/GlobalAuditPage.jsx';
import FXRatesPage from './pages/FXRatesPage.jsx';
import WalletTransactionsPage from './pages/WalletTransactionsPage.jsx';
import UserReportsPage from './pages/UserReportsPage.jsx';
import TopUpRequestsPage from './pages/TopUpRequestsPage.jsx';
import PlatformAnalyticsPage from './pages/PlatformAnalyticsPage.jsx';
import TelebirrTransactionsPage from './pages/TelebirrTransactionsPage.jsx';
import EbirrTransactionsPage from './pages/EbirrTransactionsPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import SystemHealthPage from './pages/SystemHealthPage.jsx';
import WithdrawalsPage from './pages/WithdrawalsPage.jsx';
import BankAccountSettingsPage from './pages/BankAccountSettingsPage.jsx';
import GlobalPayoutsPage from './pages/GlobalPayoutsPage.jsx';
import DisputesPage from './pages/DisputesPage.jsx';
import MarketingPage from './pages/MarketingPage.jsx';
import CreditManagementPage from './pages/CreditManagementPage.jsx';
import TeamSettingsPage from './pages/settings/TeamSettingsPage.jsx';


// 1. Create a client
const queryClient = new QueryClient();

function App() {
  return (
    // 2. Provide the client to your App
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
        <Router>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/*" element={<ProtectedRoute />}>
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="users" element={<UserManagementPage />} />
              <Route path="orders" element={<OrderManagementPage />} />
              <Route path="wallet" element={<WalletTransactionsPage />} />
              <Route path="admin/top-ups" element={<AdminRoute><TopUpRequestsPage /></AdminRoute>} />
              <Route path="categories" element={<CategoryManagementPage />} />
              <Route path="admin/ui-settings" element={<UISettingsPage />} />
              <Route path="analytics/search-keywords" element={<SearchKeywordsPage />} />
              <Route path="analytics/platform" element={<AdminRoute><PlatformAnalyticsPage /></AdminRoute>} />
              <Route path="products" element={<ProductsCurationPage />} />
              <Route path="admin/moderation" element={<AdminRoute><ModerationQueuePage /></AdminRoute>} />
              <Route path="admin/reports" element={<AdminRoute><UserReportsPage /></AdminRoute>} />
              <Route path="admin/product-approvals" element={<AdminRoute><ProductModerationPage /></AdminRoute>} />
              <Route path="admin/fx" element={<AdminRoute><FXRatesPage /></AdminRoute>} />
              <Route path="admin/appeals" element={<AdminRoute><VendorAppealsPage /></AdminRoute>} />
              <Route path="admin/active-ads" element={<AdminRoute><ActiveAdsPage /></AdminRoute>} />
              <Route path="admin/product-requests" element={<AdminRoute><ProductRequestsAdminPage /></AdminRoute>} />
              <Route path="admin/product-requests/:id" element={<AdminRoute><ProductRequestDetailPage /></AdminRoute>} />
              <Route path="admin/telebirr-transactions" element={<AdminRoute><TelebirrTransactionsPage /></AdminRoute>} />
              <Route path="admin/ebirr-transactions" element={<AdminRoute><EbirrTransactionsPage /></AdminRoute>} />
              <Route path="admin/audit" element={<AdminRoute><GlobalAuditPage /></AdminRoute>} />
              <Route path="admin/notifications" element={<AdminRoute><NotificationsPage /></AdminRoute>} />
              <Route path="admin/system-health" element={<AdminRoute><SystemHealthPage /></AdminRoute>} />
              <Route path="admin/withdrawals" element={<AdminRoute><WithdrawalsPage /></AdminRoute>} />
              <Route path="admin/payouts" element={<AdminRoute><GlobalPayoutsPage /></AdminRoute>} />
              <Route path="admin/disputes" element={<AdminRoute><DisputesPage /></AdminRoute>} />
              <Route path="marketing" element={<AdminRoute><MarketingPage /></AdminRoute>} />
              <Route path="admin/credit" element={<AdminRoute><CreditManagementPage /></AdminRoute>} />
              <Route path="admin/bank-accounts" element={<AdminRoute><BankAccountSettingsPage /></AdminRoute>} />
              <Route path="settings/team" element={<TeamSettingsPage />} />
            </Route>
          </Routes>
        </Router>
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;