const env = import.meta.env;

export const config = {
  apiUrl: (env.VITE_API_URL ?? '').replace(/\/$/, ''),
  region: env.VITE_AWS_REGION ?? 'us-east-1',
  userPoolId: env.VITE_COGNITO_USER_POOL_ID ?? '',
  userPoolClientId: env.VITE_COGNITO_CLIENT_ID ?? '',
};

/**
 * With no AWS config the app serves the bundled sample cases so the prototype
 * stays demoable without a deployed stack.
 */
export const isLive = Boolean(config.apiUrl && config.userPoolClientId);
