interface Env {
  OPENROUTER_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DASH_ADMIN_USERNAME: string;
  DASH_ADMIN_PASSWORD: string;
  OBSERVER_ADMIN_TOKEN: string;
  OBSERVER: Fetcher;
  BROWSER: BrowserRun;
  ASSETS: Fetcher;
}
