const env = import.meta.env;

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in .env — see .env.example, or run scripts/deploy.sh / scripts/deploy.ps1 to generate it.`
    );
  }
  return value;
}

export const config = {
  apiUrl: required('VITE_API_URL', env.VITE_API_URL).replace(/\/$/, ''),
  region: env.VITE_AWS_REGION ?? 'us-east-1',
  userPoolId: required('VITE_COGNITO_USER_POOL_ID', env.VITE_COGNITO_USER_POOL_ID),
  userPoolClientId: required('VITE_COGNITO_CLIENT_ID', env.VITE_COGNITO_CLIENT_ID),
};
