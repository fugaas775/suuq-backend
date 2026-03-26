import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { Box, Typography, Paper, CircularProgress, Button, Grid, Alert, Skeleton, IconButton, Tooltip, Stack, Chip, Divider } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useModerationStats } from '../hooks/useModeration';
import { useProductModeration } from '../hooks/useProductModeration';
import { getReports } from '../services/reportService';
import { getCommissionAnalytics } from '../services/analyticsService';
import { useAuth } from '../context/AuthContext';

// Reusable number formatter
const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

const MetricCard = ({ label, value, color="primary", loading=false, error=false, hint }) => (
  <Paper elevation={0} variant="outlined" sx={{ p: 3, borderRadius: 2, position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', jc: 'center' }}>
    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>{label}</Typography>
    {loading ? (
      <Skeleton variant="text" width={80} height={46} />
    ) : error ? (
      <Typography variant="body2" color="error">ERR</Typography>
    ) : (
      <Typography variant="h4" color={color} sx={{ fontWeight: 600 }}>
        {typeof value === 'number' ? nf.format(value) : (value ?? '—')}
      </Typography>
    )}
    {hint && !loading && !error && (
      <Typography variant="caption" sx={{ mt: 'auto', pt: 1, display: 'block', opacity: 0.6 }}>{hint}</Typography>
    )}
  </Paper>
);

const ActionCard = ({ title, count, subtitle, loading, error, to, buttonText, color = "primary" }) => (
    <Paper elevation={0} variant="outlined" sx={{ p: 3, borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column', borderColor: error ? 'error.light' : undefined }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
            <Typography variant="subtitle2" color="text.secondary">{title}</Typography>
            {color === 'error.main' && <WarningAmberIcon color="error" fontSize="small" />}
            {color === 'warning.main' && <PendingActionsIcon color="warning" fontSize="small" />}
        </Box>
        <Box my={2}>
            {loading ? (
                <Skeleton variant="text" width={60} height={40} />
            ) : (
                <Typography variant="h3" color={color} fontWeight="bold">
                    {nf.format(count || 0)}
                </Typography>
            )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, flexGrow: 1 }}>
            {subtitle}
        </Typography>
        <Button
            component={RouterLink}
            to={to}
            variant="contained"
            color={color.split('.')[0] === 'error' ? 'error' : color.split('.')[0] === 'warning' ? 'warning' : 'primary'}
            endIcon={<ArrowForwardIcon />}
            size="small"
            sx={{ alignSelf: 'flex-start' }}
        >
            {buttonText}
        </Button>
    </Paper>
);

const DashboardPage = () => {
  const { availableStores, activeStoreId } = useAuth();
  const [stats, setStats] = useState(null); // main admin stats
  const [subStats, setSubStats] = useState(null); // subscription stats
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [fetching, setFetching] = useState(false);
  const { stats: moderationStats, loading: modLoading, error: modError } = useModerationStats();
  const [auditSummary, setAuditSummary] = useState({ vendorEvents24h: 0, orderEvents24h: 0 });
  const { total: pendingModerationTotal, loading: pendingCountLoading, error: pendingCountError } = useProductModeration({ page: 1, pageSize: 1, status: 'pending_approval' });
  const [pendingReportsCount, setPendingReportsCount] = useState(0);

  const fetchStats = useCallback(async (opts = { initial: false }) => {
    if (opts.initial) {
      setLoading(true);
    } else {
      setFetching(true);
    }
    setError(null);
    try {
      // Parallel fetch for main stats
      const [res, comRes] = await Promise.allSettled([
        api.get('/api/admin/stats', { params: { _ts: Date.now() } }),
        getCommissionAnalytics() // Now returns commission revenue
      ]);

      // Process Main Stats
      const core = res.status === 'fulfilled' ? (res.value?.data || {}) : {};
      if (res.status === 'rejected') throw res.reason;
      setStats(core);

      // Process Commission Stats (normalize keys and derive revenue)
      const comData = comRes.status === 'fulfilled' ? (comRes.value || {}) : {};
      const grossCommission = Number(
        comData.totalCommission ?? comData.total_commission ??
        comData.totalMrr ?? comData.total_mrr ?? comData.totalMRR ?? 0
      );
      const ebirrFees = Number(comData.ebirrFees ?? comData.ebirr_fees ?? 0);
      const platformRevenue = Number(
        comData.platformRevenue ?? comData.platform_revenue ?? (grossCommission - ebirrFees)
      );
      const grossSales = Number(comData.grossSales ?? comData.gross_sales ?? 0);
      const currency = comData.currency || core?.currency || 'ETB';

      setSubStats({
        totalCommission: grossCommission,
        ebirrFees,
        platformRevenue,
        grossSales,
        totalMRR: 0,
        currency,
      });


      // Optional: derive a tiny audit-aware summary if backend exposes it
      const audit = core.audit || core.auditSummary || {};
      setAuditSummary({
        vendorEvents24h: Number(audit.vendorEvents24h || audit.vendorEventsLast24h || 0),
        orderEvents24h: Number(audit.orderEvents24h || audit.orderEventsLast24h || 0),
      });
      
      // Fetch pending reports count
      try {
        const reportsData = await getReports({ page: 1, limit: 1, status: 'pending' });
        setPendingReportsCount(reportsData.total || reportsData.count || 0);
      } catch (e) {
        console.error('Failed to fetch pending reports count', e);
      }

      setLastUpdated(new Date());
    } catch (err) {
      setError(err);
    } finally {
      if (opts.initial) setLoading(false);
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchStats({ initial: true });
    const id = setInterval(() => fetchStats(), 60_000); // auto refresh every 60s
    return () => clearInterval(id);
  }, [fetchStats]);

  const downloadCsv = () => {
    const rows = [];
    const base = stats || {};
    const mod = moderationStats || {};
    const collect = (obj, prefix='') => Object.entries(obj).forEach(([k,v]) => {
      if (v == null) return;
      if (typeof v === 'object' && !Array.isArray(v)) return; // skip nested objects for brevity
      rows.push({ key: `${prefix}${k}`, value: v });
    });
    collect(base, 'core.');
    collect(mod, 'moderation.');
    const csv = 'key,value\n' + rows.map(r => `${r.key},${r.value}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dashboard_stats_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const showSkeleton = loading;
  const hasError = !!error && !loading;

  const primaryErrorMessage = hasError ? (error?.response?.status ? `Failed (${error.response.status})` : 'Failed to fetch stats') : null;

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            {showSkeleton ? 'Loading data...' : hasError ? 'Partial data available' : lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : '—'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Refresh now">
            <IconButton color="primary" onClick={() => fetchStats()} disabled={fetching || loading}>
              {fetching ? <CircularProgress size={20} /> : <RefreshIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Download CSV">
            <IconButton onClick={downloadCsv} disabled={loading} color="primary">
              <DownloadIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Logout">
            <IconButton
                color="error"
                onClick={() => { localStorage.removeItem('accessToken'); localStorage.removeItem('user'); window.location.href = '/'; }}
            >
                <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Multiple Store Context Alert */}
      {availableStores && availableStores.length > 1 && (
        <Alert severity="info" sx={{ mb: 3 }} icon={<CheckCircleOutlineIcon fontSize="inherit" />}>
            <Typography variant="subtitle2" fontWeight="bold">
                Multiple Stores Detected
            </Typography>
            You have access to <strong>{availableStores.length} stores</strong> (e.g., {availableStores[0].storeName}). 
            Currently active: <strong>{availableStores.find(s => s.vendorId == activeStoreId)?.storeName || 'None'}</strong>. 
            Use the profile menu (top-right) to switch contexts.
        </Alert>
      )}

      {hasError && (
        <Alert severity="warning" sx={{ mb: 3 }} action={
          <Button color="inherit" size="small" onClick={() => fetchStats()}>Retry</Button>
        }>
          {primaryErrorMessage}
        </Alert>
      )}

      {/* Overview Section */}
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Platform Overview</Typography>
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard 
            label="Total Platform Revenue" 
            value={subStats?.platformRevenue} 
            loading={showSkeleton} 
            color="secondary.main" 
            hint={`${subStats?.currency || stats?.currency || 'ETB'} (Gross: ${nf.format(subStats?.totalCommission || 0)} - Fees: ${nf.format(subStats?.ebirrFees || 0)})`} 
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard 
            label="Paid Order Volume" 
            value={subStats?.grossSales} 
            loading={showSkeleton} 
            color="success.main" 
            hint={`Count: ${nf.format(stats?.totalOrders || 0)}`} 
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Total Users" value={stats?.totalUsers} loading={showSkeleton} color="primary.main" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Total Vendors" value={stats?.totalVendors} loading={showSkeleton} color="info.main" />
        </Grid>
      </Grid>
      
      {/* Commission Breakdown Section */}
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Commission Analysis</Typography>
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={4}>
           <MetricCard 
             label="Gross Commission" 
             value={subStats?.totalCommission} 
             loading={showSkeleton}
             color="primary.main"
             hint="Total collected (3% Base + 1% Ebirr)"
           />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
           <MetricCard 
             label="Ebirr Fees" 
             value={subStats?.ebirrFees} 
             loading={showSkeleton}
             color="error.main"
             hint="Gateway Cost (1% of Ebirr Vol)"
           />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
           <MetricCard 
             label="Net Platform Profit" 
               value={subStats?.platformRevenue} 
             loading={showSkeleton}
             color="success.main"
             hint="Actual Earnings (Gross - Fees)"
           />
        </Grid>
      </Grid>

      <Divider sx={{ my: 4 }} />

      {/* Action Required Section */}
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Actions Required</Typography>
      <Grid container spacing={3} mb={4}>
          <Grid item xs={12} md={6}>
              <ActionCard 
                  title="Pending User Reports" 
                  count={pendingReportsCount} 
                  subtitle="User reports that require administrative review and action."
                  loading={loading}
                  to="/admin/reports"
                  buttonText="Review Reports"
                  color="error.main"
              />
          </Grid>
          <Grid item xs={12} md={6}>
              <ActionCard 
                  title="Pending Products" 
                  count={pendingModerationTotal} 
                  subtitle="Products awaiting moderation approval before they can be listed."
                  loading={pendingCountLoading}
                  to="/admin/product-approvals"
                  buttonText="Moderation Queue"
                  color="warning.main"
              />
          </Grid>
      </Grid>

      <Grid container spacing={4}>
          <Grid item xs={12} md={8}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Moderation Activity</Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard label="Flagged" value={moderationStats?.flagged || moderationStats?.pending} loading={modLoading} error={!!modError} color="warning.main" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard label="Approved" value={moderationStats?.approved} loading={modLoading} error={!!modError} color="success.main" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard label="Rejected" value={moderationStats?.rejected} loading={modLoading} error={!!modError} color="error.main" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard label="Rescans" value={moderationStats?.rescanned} loading={modLoading} error={!!modError} color="info.main" />
                </Grid>
              </Grid>
          </Grid>
          <Grid item xs={12} md={4}>
             <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>System Activity (24h)</Typography>
             <Stack spacing={2}>
                 <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <Box>
                         <Typography variant="body2" color="text.secondary">Vendor Audits</Typography>
                         <Typography variant="h6">{nf.format(auditSummary.vendorEvents24h || 0)}</Typography>
                     </Box>
                     <Chip size="small" label="Events" />
                 </Paper>
                 <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <Box>
                         <Typography variant="body2" color="text.secondary">Order Audits</Typography>
                         <Typography variant="h6">{nf.format(auditSummary.orderEvents24h || 0)}</Typography>
                     </Box>
                     <Chip size="small" label="Events" />
                 </Paper>
             </Stack>
          </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
