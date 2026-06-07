import { apiClient } from '@/lib/api-client';
import { clearAccessToken, storeAccessToken } from '@/lib/auth-token';
import { resetSocket } from '@/lib/socket-client';

export type AuthUser = {
  id: number;
  email: string;
  username: string;
  avatarUrl: string | null;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export const authService = {
  async register(payload: { email: string; username: string; password: string }) {
    const response = await apiClient<AuthResponse>('/auth/register', {
      body: payload,
      method: 'POST'
    });
    storeAccessToken(response.accessToken);
    return response;
  },

  async login(payload: { email: string; password: string }) {
    const response = await apiClient<AuthResponse>('/auth/login', {
      body: payload,
      method: 'POST'
    });
    storeAccessToken(response.accessToken);
    return response;
  },

  async logout() {
    clearAccessToken();
    resetSocket();
    return apiClient<{ ok: boolean }>('/auth/logout', {
      method: 'POST'
    });
  },

  changePassword(payload: { currentPassword: string; newPassword: string }) {
    return apiClient<{ ok: boolean }>('/auth/change-password', {
      body: payload,
      method: 'POST'
    });
  },

  async refresh() {
    const response = await apiClient<AuthResponse>('/auth/refresh', {
      method: 'POST'
    });
    storeAccessToken(response.accessToken);
    return response;
  },

  me() {
    return apiClient<AuthUser>('/auth/me');
  }
};
