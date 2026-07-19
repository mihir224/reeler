export const ONBOARDING_APP_ID_KEY = "reeler_onboarding_app_id";
export const ONBOARDING_ENDPOINT_SECRET_KEY = "reeler_onboarding_endpoint_secret";

export function getOnboardingAppId() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(ONBOARDING_APP_ID_KEY);
}

export function setOnboardingAppId(appId: string) {
  window.sessionStorage.setItem(ONBOARDING_APP_ID_KEY, appId);
}

export function getOnboardingEndpointSecret() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(ONBOARDING_ENDPOINT_SECRET_KEY);
}

export function setOnboardingEndpointSecret(secret: string) {
  window.sessionStorage.setItem(ONBOARDING_ENDPOINT_SECRET_KEY, secret);
}

export function clearOnboardingState() {
  window.sessionStorage.removeItem(ONBOARDING_APP_ID_KEY);
  window.sessionStorage.removeItem(ONBOARDING_ENDPOINT_SECRET_KEY);
}
