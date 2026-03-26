import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../context/AuthContext.jsx';
import { Box, CircularProgress } from '@mui/material';

export default function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();

  // Show a loading spinner while the auth state is being determined
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  // If not loading and not authenticated, redirect to the login page
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // If authenticated, render the main layout with the nested routes
  return (
    <MainLayout>
      <Outlet />
    </MainLayout>
  );
}
