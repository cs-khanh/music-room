import type { Request } from 'express';

export type AuthenticatedUser = {
  id: number;
  email: string;
  username: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};
