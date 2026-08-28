export const REQUIRED_AUTH_ROUTES: readonly [
  "/login",
  "/sign-up",
  "/verify-email",
  "/enroll-mfa"
];

export function assertProductionAuthRoutes(
  appRoot: string,
  appName: string
): Promise<typeof REQUIRED_AUTH_ROUTES>;
