const requiredPublicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL
};

for (const [key, value] of Object.entries(requiredPublicEnv)) {
  if (!value) {
    throw new Error(`Missing frontend environment variable: ${key}`);
  }
}

export const env = {
  apiUrl: requiredPublicEnv.apiUrl,
  socketUrl: requiredPublicEnv.socketUrl
} as const;
