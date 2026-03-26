import React from 'react';
import { Box, AppBar, Toolbar, Drawer, List, ListItem, ListItemIcon, ListItemText, Typography, ListSubheader, Divider } from '@mui/material';
import Logo from '../components/branding/Logo';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import CategoryIcon from '@mui/icons-material/Category';
import InsightsIcon from '@mui/icons-material/Insights';
import ReportIcon from '@mui/icons-material/Report';
import MarkEmailUnreadIcon from '@mui/icons-material/MarkEmailUnread';
import AssignmentIcon from '@mui/icons-material/Assignment';
import HistoryIcon from '@mui/icons-material/History';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AddCardIcon from '@mui/icons-material/AddCard';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import NotificationsIcon from '@mui/icons-material/Notifications';
import SettingsIcon from '@mui/icons-material/Settings';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import TuneIcon from '@mui/icons-material/Tune';
import { Link, Outlet, useLocation } from 'react-router-dom';

import PaymentIcon from '@mui/icons-material/Payment';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CampaignIcon from '@mui/icons-material/Campaign';
import GavelIcon from '@mui/icons-material/Gavel';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import CreditScoreIcon from '@mui/icons-material/CreditScore';
import ProfileMenu from '../components/ProfileMenu';
import { useAuth } from '../context/AuthContext';

const drawerWidth = 240;
// navGroups moved inside component to access context

export default function MainLayout() {
  const location = useLocation();
  const { activeStoreId } = useAuth();
  
  const navGroups = [
  {
    title: 'Overview',
    items: [
      { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
      { text: 'Platform Analytics', icon: <InsightsIcon />, path: '/analytics/platform' },
    ]
  },
  {
    title: 'User Management',
    items: [
      { text: 'Users', icon: <PeopleIcon />, path: '/users' },
      { text: 'User Reports', icon: <ReportIcon />, path: '/admin/reports' },
      { text: 'Appeals', icon: <MarkEmailUnreadIcon />, path: '/admin/appeals' },
    ]
  },
  {
    title: 'Product Management',
    items: [
      { text: 'Products', icon: <Inventory2Icon />, path: '/products' },
      { text: 'Categories', icon: <CategoryIcon />, path: '/categories' },
      { text: 'Active Ads', icon: <CampaignIcon />, path: '/admin/active-ads' },
      { text: 'Product Approvals', icon: <PendingActionsIcon />, path: '/admin/product-approvals' },
      { text: 'Product Requests', icon: <AssignmentIcon />, path: '/admin/product-requests' },
      { text: 'Moderation Queue', icon: <ReportIcon />, path: '/admin/moderation' },
      { text: 'Search Keywords', icon: <InsightsIcon />, path: '/analytics/search-keywords' },
      { text: 'Marketing & Promos', icon: <LocalOfferIcon />, path: '/marketing' },
    ]
  },
  {
    title: 'Order Management',
    items: [
      { text: 'Orders', icon: <ShoppingCartIcon />, path: '/orders' },
      { text: 'Disputes', icon: <GavelIcon />, path: '/admin/disputes' },
    ]
  },
  {
    title: 'Finance',
    items: [
      { text: 'Wallet', icon: <AccountBalanceWalletIcon />, path: '/wallet' },
      { text: 'Global Payouts', icon: <MonetizationOnIcon />, path: '/admin/payouts' },
      { text: 'Withdrawals', icon: <PaymentIcon />, path: '/admin/withdrawals' },
      { text: 'Telebirr Audit', icon: <ReceiptLongIcon />, path: '/admin/telebirr-transactions' },
      { text: 'Ebirr Audit', icon: <ReceiptLongIcon />, path: '/admin/ebirr-transactions' },
      { text: 'Top-Up Requests', icon: <AddCardIcon />, path: '/admin/top-ups' },
      { text: 'Consumer Credit', icon: <CreditScoreIcon />, path: '/admin/credit' },
      { text: 'Bank Accounts', icon: <AccountBalanceWalletIcon />, path: '/admin/bank-accounts' },
      { text: 'FX Rates', icon: <MonetizationOnIcon />, path: '/admin/fx' },
    ]
  },
  {
    title: 'System & Settings',
    items: [
      { text: 'UI Settings', icon: <TuneIcon />, path: '/admin/ui-settings' },
      { text: 'System Health', icon: <MonitorHeartIcon />, path: '/admin/system-health' },
      { text: 'Notifications', icon: <NotificationsIcon />, path: '/admin/notifications' },
      { text: 'Global Audit', icon: <HistoryIcon />, path: '/admin/audit' },
      ...(activeStoreId ? [{ text: 'Team Settings', icon: <PeopleIcon />, path: '/settings/team' }] : [])
    ]
  }
];

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Box display="flex" alignItems="center" gap={1}>
            <Logo size="md" clickable />
            <Typography variant="h6" noWrap component="div">Admin</Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <ProfileMenu />
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {navGroups.map((group, index) => (
              <React.Fragment key={group.title}>
                {index > 0 && <Divider />}
                <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '32px', pt: 2, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary' }}>
                  {group.title}
                </ListSubheader>
                {group.items.map((item) => (
                  <ListItem
                    button
                    key={item.text}
                    component={Link}
                    to={item.path}
                    selected={location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path))}
                    sx={{
                      '&.Mui-selected': { bgcolor: 'primary.light', color: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' } },
                      '&:hover': { bgcolor: 'action.hover' },
                      py: 0.5
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: '0.875rem' }} />
                  </ListItem>
                ))}
              </React.Fragment>
            ))}
          </List>
        </Box>
      </Drawer>
  <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default', p: 3, pl: 0 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
