const fs = require('fs');
const content = fs.readFileSync(
  'src/deliverer/deliverer.controller.ts',
  'utf8',
);

const additionalEndpoints = `
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/my-deliveries')
  async getMyDeliveries(@Req() req: any) {
    return this.delivererService.getMyAssignments(req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/assigned-orders')
  async getAssignedOrders(@Req() req: any) {
    return this.delivererService.getMyAssignments(req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/available-orders')
  async getAvailableOrdersPool(@Req() req: any) {
    return this.delivererService.getAvailableOrders();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/open-orders')
  async getOpenOrdersPool(@Req() req: any) {
    return this.delivererService.getAvailableOrders();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/pending-orders')
  async getPendingOrdersPool(@Req() req: any) {
    return this.delivererService.getAvailableOrders();
  }
`;

const updated = content.replace(
  '  // Detail with vendor summary',
  additionalEndpoints + '\n  // Detail with vendor summary',
);
fs.writeFileSync('src/deliverer/deliverer.controller.ts', updated);
