// src/pages/ProductRequestsAdminPage.jsx
import React, { useMemo, useState } from 'react';
import {
  Paper,
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  TablePagination,
  Chip,
  Button,
  Alert,
  CircularProgress,
  Checkbox,
  Snackbar,
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAdminProductRequestList, useDeleteProductRequest, useDeleteProductRequestsBatch } from '../hooks/useProductRequestsAdmin';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const STATUS_OPTIONS = ['', 'OPEN', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED', 'EXPIRED'];

const COUNTRY_OPTIONS = [
  { code: '', label: 'Any' },
  { code: 'ET', label: 'Ethiopia' },
  { code: 'SO', label: 'Somalia' },
  { code: 'KE', label: 'Kenya' },
  { code: 'DJ', label: 'Djibouti' },
];

const CURRENCY_BY_COUNTRY = {
  ET: 'ETB',
  SO: 'SOS',
  KE: 'KES',
  DJ: 'DJF',
};

const CONDITION_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'ANY', label: 'Any' },
  { value: 'NEW', label: 'New' },
  { value: 'USED', label: 'Used' },
];

const parseSearchParams = (search) => {
  try {
    const u = new URLSearchParams(search || '');
    const page = Number(u.get('page') || '1');
    const statusRaw = u.get('status') || '';
    const status = statusRaw ? statusRaw.split(',').filter(Boolean) : [];
    const categoryId = u.get('categoryId') || '';
    const city = u.get('city') || '';
    const country = u.get('country') || '';
    const createdFrom = u.get('createdFrom') || '';
    const createdTo = u.get('createdTo') || '';
    return { page, status, categoryId, city, country, createdFrom, createdTo };
  } catch {
    return { page: 1, status: [], categoryId: '', city: '', country: '', createdFrom: '', createdTo: '' };
  }
};

const ProductRequestsAdminPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const isSuperAdmin = useMemo(() => {
    if (!user) return false;
    const role = (user.role || '').toUpperCase();
    const roles = Array.isArray(user.roles) ? user.roles.map(r => String(r).toUpperCase()) : [];
    return role === 'SUPER_ADMIN' || roles.includes('SUPER_ADMIN');
  }, [user]);

  const initial = useMemo(() => parseSearchParams(location.search), [location.search]);

  const [page, setPage] = useState(initial.page || 1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [status, setStatus] = useState(initial.status || []);
  const [categoryId, setCategoryId] = useState(initial.categoryId || '');
  const [city, setCity] = useState(initial.city || '');
  const [country, setCountry] = useState(initial.country || '');
  const [createdFrom, setCreatedFrom] = useState(initial.createdFrom || '');
  const [createdTo, setCreatedTo] = useState(initial.createdTo || '');

  const [selectedIds, setSelectedIds] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const deleteMutation = useDeleteProductRequest();
  const deleteBatchMutation = useDeleteProductRequestsBatch();

  // Create request form state (matches CreateProductRequestDto)
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [currency, setCurrency] = useState('ETB');
  const [condition, setCondition] = useState('ANY');
  const [urgency, setUrgency] = useState('');
  const [preferredCity, setPreferredCity] = useState('');
  const [preferredCountry, setPreferredCountry] = useState('ET');
  const [imageUrl, setImageUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [createAsGuest, setCreateAsGuest] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const filters = useMemo(() => ({
    page,
    limit: rowsPerPage,
    // backend accepts comma-separated statuses
    status: (Array.isArray(status) && status.length) ? status.join(',') : undefined,
    categoryId: categoryId || undefined,
    city: city || undefined,
    country: country || undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
  }), [page, rowsPerPage, status, categoryId, city, country, createdFrom, createdTo]);
  const { data, isLoading, error, refetch } = useAdminProductRequestList(filters);
  const items = data?.items || [];
  const total = data?.total || 0;

  const updateUrl = (nextPage, overrides = {}) => {
    const params = new URLSearchParams();
    params.set('page', String(nextPage));
    if (Array.isArray(status) && status.length) params.set('status', status.join(','));
    if (categoryId) params.set('categoryId', categoryId);
    if (city) params.set('city', city);
    if (country) params.set('country', country);
    if (createdFrom) params.set('createdFrom', createdFrom);
    if (createdTo) params.set('createdTo', createdTo);
    Object.entries(overrides).forEach(([k, v]) => {
      if (v == null || v === '') return;
      params.set(k, String(v));
    });
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  };

  const handleChangePage = (event, newPage) => {
    const oneBased = newPage + 1;
    setPage(oneBased);
    updateUrl(oneBased);
  };

  const handleChangeRowsPerPage = (event) => {
    const v = parseInt(event.target.value, 10) || 25;
    setRowsPerPage(v);
    setPage(1);
    updateUrl(1, { limit: v });
  };

  const handleApplyFilters = () => {
    setPage(1);
    updateUrl(1);
  };

  const handleResetFilters = () => {
    setStatus('');
    setCategoryId('');
    setCity('');
    setCountry('');
    setCreatedFrom('');
    setCreatedTo('');
    setPage(1);
    navigate({ pathname: location.pathname, search: '' }, { replace: true });
  };

  const openDetail = (id) => {
    navigate(`/admin/product-requests/${id}`);
  };

  const handlePreferredCountryChange = (value) => {
    setPreferredCountry(value);
    const nextCurrency = CURRENCY_BY_COUNTRY[value];
    if (nextCurrency) {
      setCurrency(nextCurrency);
    }
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedIds(items.map((n) => n.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (event, id) => {
    const selectedIndex = selectedIds.indexOf(id);
    let newSelected = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selectedIds, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selectedIds.slice(1));
    } else if (selectedIndex === selectedIds.length - 1) {
      newSelected = newSelected.concat(selectedIds.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selectedIds.slice(0, selectedIndex),
        selectedIds.slice(selectedIndex + 1),
      );
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} requests?`)) return;

    try {
      await deleteBatchMutation.mutateAsync(selectedIds);
      setSnackbar({ open: true, message: `Successfully deleted ${selectedIds.length} requests`, severity: 'success' });
      setSelectedIds([]);
      // Refetch automatically happens via React Query invalidation
    } catch (err) {
      console.error('Failed to delete some requests', err);
      setSnackbar({ open: true, message: 'Failed to delete one or more requests.', severity: 'error' });
    }
  };

  const handleSubmitCreate = async () => {
    setCreateError('');
    if (!title.trim()) {
      setCreateError('Title is required.');
      return;
    }
    if (!preferredCity.trim()) {
      setCreateError('City is required.');
      return;
    }
    if (createAsGuest) {
      if (!guestName.trim()) {
        setCreateError('Guest name is required.');
        return;
      }
      if (!guestEmail.trim() && !guestPhone.trim()) {
        setCreateError('Provide guest email or phone.');
        return;
      }
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      categoryId: formCategoryId ? Number(formCategoryId) : undefined,
      budgetMin: budgetMin ? Number(budgetMin) : undefined,
      budgetMax: budgetMax ? Number(budgetMax) : undefined,
      currency: currency || undefined,
      condition: condition || undefined,
      urgency: urgency || undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      preferredCity: preferredCity.trim(),
      preferredCountry: preferredCountry || undefined,
      imageUrl: imageUrl.trim() || undefined,
      location: {
        city: preferredCity.trim(),
        country: preferredCountry || undefined,
      },
      guestName: createAsGuest ? guestName.trim() : undefined,
      guestEmail: createAsGuest ? guestEmail.trim() || undefined : undefined,
      guestPhone: createAsGuest ? guestPhone.trim() || undefined : undefined,
    };

    setCreateLoading(true);
    try {
      const path = createAsGuest ? '/api/product-requests/guest' : '/api/product-requests';
      await api.post(path, payload);
      // Reset form and refetch admin list so SUPER_ADMIN can see it
      setTitle('');
      setDescription('');
      setFormCategoryId('');
      setBudgetMin('');
      setBudgetMax('');
      setCurrency('ETB');
      setCondition('ANY');
      setUrgency('');
      setPreferredCity('');
      setPreferredCountry('ET');
      setImageUrl('');
      setExpiresAt('');
      setCreateAsGuest(false);
      setGuestName('');
      setGuestEmail('');
      setGuestPhone('');
      setCreateOpen(false);
      refetch();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to create product request.';
      setCreateError(msg);
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>Buyer Product Requests</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        View all buyer product requests, inspect offers, and forward them to vendors.
      </Typography>

      <Box sx={{ mt: 1, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Create a new buyer request on behalf of a customer (same payload as mobile app).
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end' }}>
          <TextField
            size="small"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            sx={{ minWidth: 260 }}
          />
          <TextField
            size="small"
            label="City"
            value={preferredCity}
            onChange={(e) => setPreferredCity(e.target.value)}
            sx={{ minWidth: 180 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="preferred-country-label">Country</InputLabel>
            <Select
              labelId="preferred-country-label"
              label="Country"
              value={preferredCountry}
              onChange={(e) => handlePreferredCountryChange(e.target.value)}
            >
              {COUNTRY_OPTIONS.filter(c => c.code).map((c) => (
                <MenuItem key={c.code} value={c.code}>{c.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="currency-label">Currency</InputLabel>
            <Select
              labelId="currency-label"
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <MenuItem value="ETB">ETB</MenuItem>
              <MenuItem value="SOS">SOS</MenuItem>
              <MenuItem value="KES">KES</MenuItem>
              <MenuItem value="DJF">DJF</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label={`Budget min (${currency})`}
            type="number"
            value={budgetMin}
            onChange={(e) => setBudgetMin(e.target.value)}
            sx={{ maxWidth: 160 }}
          />
          <TextField
            size="small"
            label={`Budget max (${currency})`}
            type="number"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            sx={{ maxWidth: 160 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="condition-label">Condition</InputLabel>
            <Select
              labelId="condition-label"
              label="Condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              {CONDITION_OPTIONS.map((c) => (
                <MenuItem key={c.value || 'any-cond'} value={c.value}>{c.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Category ID"
            type="number"
            value={formCategoryId}
            onChange={(e) => setFormCategoryId(e.target.value)}
            sx={{ maxWidth: 140 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="as-guest-label">Guest?</InputLabel>
            <Select
              labelId="as-guest-label"
              label="Guest?"
              value={createAsGuest ? 'yes' : 'no'}
              onChange={(e) => setCreateAsGuest(e.target.value === 'yes')}
            >
              <MenuItem value="no">No (authenticated)</MenuItem>
              <MenuItem value="yes">Yes (guest)</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1, alignItems: 'flex-start' }}>
          <TextField
            size="small"
            label="Description"
            multiline
            minRows={2}
            maxRows={4}
            fullWidth
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <TextField
            size="small"
            label="Image URL"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            sx={{ minWidth: 260 }}
          />
          <TextField
            size="small"
            label="Expires At"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 200 }}
          />
          {createAsGuest && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 260 }}>
              <TextField
                size="small"
                label="Guest name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
              <TextField
                size="small"
                label="Guest email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
              />
              <TextField
                size="small"
                label="Guest phone"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
              />
            </Box>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button
              variant="contained"
              onClick={handleSubmitCreate}
              disabled={createLoading}
            >
              {createLoading ? 'Creating…' : 'Create Request'}
            </Button>
            {createError && (
              <Typography variant="caption" color="error">{createError}</Typography>
            )}
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="status-label">Status</InputLabel>
          <Select
            labelId="status-label"
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <MenuItem key={s || 'any'} value={s}>{s || 'Any'}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          label="Category ID"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        />

        <TextField
          size="small"
          label="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />

        <TextField
          size="small"
          label="Country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />

        <TextField
          size="small"
          label="Created from (ISO)"
          value={createdFrom}
          onChange={(e) => setCreatedFrom(e.target.value)}
        />

        <TextField
          size="small"
          label="Created to (ISO)"
          value={createdTo}
          onChange={(e) => setCreatedTo(e.target.value)}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button variant="contained" onClick={handleApplyFilters}>Apply</Button>
          <Button variant="text" onClick={handleResetFilters}>Reset</Button>
          {isSuperAdmin && selectedIds.length > 0 && (
            <Button
              variant="contained"
              color="error"
              onClick={handleBulkDelete}
              disabled={deleteBatchMutation.isLoading}
            >
              Delete ({selectedIds.length})
            </Button>
          )}
        </Box>
      </Box>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={
          <Button color="inherit" size="small" onClick={() => refetch()}>Retry</Button>
        }>
          {error.message || 'Failed to load product requests'}
        </Alert>
      )}

      {!isLoading && !error && (
        <>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {isSuperAdmin && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        color="primary"
                        indeterminate={selectedIds.length > 0 && selectedIds.length < items.length}
                        checked={items.length > 0 && selectedIds.length === items.length}
                        onChange={handleSelectAll}
                        inputProps={{ 'aria-label': 'select all' }}
                      />
                    </TableCell>
                  )}
                  <TableCell>ID</TableCell>
                  <TableCell>Buyer</TableCell>
                  <TableCell>Contact</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Budget</TableCell>
                  <TableCell>City / Country</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Offers</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((r) => {
                  const isSelected = selectedIds.indexOf(r.id) !== -1;
                  return (
                    <TableRow
                      key={r.id}
                      hover
                      onClick={() => openDetail(r.id)}
                      role="checkbox"
                      aria-checked={isSelected}
                      selected={isSelected}
                      sx={{ cursor: 'pointer' }}
                    >
                      {isSuperAdmin && (
                        <TableCell padding="checkbox">
                          <Checkbox
                            color="primary"
                            checked={isSelected}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSelectOne(event, r.id);
                            }}
                            inputProps={{
                              'aria-labelledby': `enhanced-table-checkbox-${r.id}`,
                            }}
                          />
                        </TableCell>
                      )}
                      <TableCell>{r.id}</TableCell>
                      <TableCell>{r.buyer?.name || r.buyerName || r.buyerId}</TableCell>
                    <TableCell>
                      {(r.guestEmail || r.guestPhone)
                        ? [r.guestEmail, r.guestPhone].filter(Boolean).join(' / ')
                        : (r.buyer?.email || r.buyerEmail || r.buyer?.phone || r.buyerPhone || '-')}
                    </TableCell>
                    <TableCell>{r.title}</TableCell>
                    <TableCell>{r.category?.name || r.categoryName || r.categoryId || '-'}</TableCell>
                    <TableCell>
                      {(r.budgetMin || r.budgetMax)
                        ? `${Number(r.budgetMin || 0)} - ${Number(r.budgetMax || 0)} ${r.currency || 'ETB'}`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {[
                        r.preferredCity || r.location?.city,
                        r.preferredCountry || r.location?.country || r.location?.region,
                      ]
                        .filter(Boolean)
                        .join(' / ') || '-'}
                    </TableCell>
                    <TableCell>
                      {r.status ? <Chip size="small" label={r.status} /> : '-'}
                    </TableCell>
                    <TableCell>{typeof r.offerCount === 'number' ? r.offerCount : (r.offers?.length ?? 0)}</TableCell>
                    <TableCell>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}</TableCell>
                    <TableCell>{r.expiresAt ? new Date(r.expiresAt).toLocaleString() : '-'}</TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={(e) => { e.stopPropagation(); openDetail(r.id); }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isSuperAdmin ? 13 : 12} align="center">
                      <Typography variant="body2" color="text.secondary">No product requests</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page - 1}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Paper>
  );
};

export default ProductRequestsAdminPage;
