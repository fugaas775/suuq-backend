import { Request } from 'express';
import { User } from '../users/entities/user.entity'; // <-- FIXED IMPORT

export interface RequestWithUser extends Request {
  user: User;
}