# Admin Panel API Documentation

This document describes the secure admin-level API endpoints for the marketplace platform.

## 🔐 Security

**All admin endpoints require authentication and proper authorization:**
- **Authentication**: JWT token in the `Authorization: Bearer <token>` header
- **Authorization**: User must have `ADMIN` or `SUPER_ADMIN` role
- **Base URL**: `/api/admin`

## 📋 User Management Endpoints

### GET /api/admin/users
Retrieve all users with pagination and optional role filtering.

**Query Parameters:**
- `role` (optional): Filter by role (VENDOR, CUSTOMER, ADMIN, SUPER_ADMIN)
- `page` (optional): Page number (default: 1)  
- `pageSize` (optional): Items per page (default: 20)

**Response:**
```json
{
  "users": [...],
  "total": 150
}
```

### GET /api/admin/users/:id
Retrieve a specific user by ID.

**Response:** User object with all details

### PATCH /api/admin/users/:id
Update user information.

**Request Body:**
```json
{
  "displayName": "string",
  "avatarUrl": "string", 
  "storeName": "string",
  "phoneCountryCode": "string",
  "phoneNumber": "string",
  "isActive": boolean,
  "verificationStatus": "PENDING|APPROVED|REJECTED",
  "verificationDocuments": ["string"],
  "verified": boolean
}
```

### POST /api/admin/users
Create a new ADMIN user (**SUPER_ADMIN only**).

**Request Body:**
```json
{
  "displayName": "Admin Name",
  "email": "admin@example.com",
  "password": "securePassword123"
}
```

### PATCH /api/admin/users/:id/roles
Update user roles (**SUPER_ADMIN only**).

**Request Body:**
```json
{
  "roles": ["ADMIN", "VENDOR"]
}
```

### PATCH /api/admin/users/:id/deactivate
Deactivate a user account.

**Response:** Updated user object with `isActive: false`

## 📦 Order Management Endpoints

### GET /api/admin/orders
Retrieve all orders with filtering and pagination.

**Query Parameters:**
- `status` (optional): Filter by order status
- `page` (optional): Page number
- `pageSize` (optional): Items per page

**Response:**
```json
{
  "orders": [...],
  "total": 500
}
```

### PATCH /api/admin/orders/:id/cancel
Cancel an order as admin.

**Response:** Updated order object with cancelled status

## 📊 Platform Stats Endpoint

### GET /api/admin/stats
Get comprehensive platform statistics.

**Response:**
```json
{
  "totalUsers": 1250,
  "totalVendors": 85,
  "totalCustomers": 1150,
  "totalAdmins": 15,
  "totalRevenue": 45000.50,
  "totalOrders": 2300,
  "pendingWithdrawals": 12
}
```

## 💰 Withdrawal Management Endpoints

### GET /api/admin/withdrawals
List all withdrawal requests with optional status filtering.

**Query Parameters:**
- `status` (optional): PENDING, APPROVED, REJECTED

### PATCH /api/admin/withdrawals/:id/approve
Approve a withdrawal request.

### PATCH /api/admin/withdrawals/:id/reject
Reject a withdrawal request.

## 🛡️ Permission Levels

- **ADMIN**: Access to all endpoints except user creation and role management
- **SUPER_ADMIN**: Full access to all admin endpoints including:
  - Creating new admin users
  - Managing user roles
  - All standard admin functions

## 📝 Error Responses

**401 Unauthorized**: Missing or invalid JWT token
```json
{
  "message": "Unauthorized",
  "statusCode": 401
}
```

**403 Forbidden**: Insufficient role permissions  
```json
{
  "message": "Insufficient permissions",
  "statusCode": 403
}
```

**404 Not Found**: Resource not found
```json
{
  "message": "User not found",
  "statusCode": 404
}
```

## 🧪 Testing the Endpoints

All endpoints require authentication. First obtain a JWT token by logging in as an admin user, then include it in the Authorization header:

```bash
# Login as admin to get JWT token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "adminPassword"}'

# Use the token in admin requests
curl -X GET http://localhost:3000/api/admin/stats \
  -H "Authorization: Bearer <your-jwt-token>"
```
