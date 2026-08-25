export function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === "production";
}
