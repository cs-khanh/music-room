const accessTokenKey = 'music-room-access-token';

export function getAccessToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(accessTokenKey);
}

export function storeAccessToken(token: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(accessTokenKey, token);
  }
}

export function clearAccessToken() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(accessTokenKey);
  }
}
