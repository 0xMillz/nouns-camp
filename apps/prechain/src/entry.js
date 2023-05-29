// import "./polyfills";
import React from "react";
import { createRoot } from "react-dom/client";
import {
  AuthProvider,
  AppStoreProvider,
  CacheStoreProvider,
  useAuth,
  useActions,
} from "@shades/common/app";
import { useFetch } from "@shades/common/react";
import "./reset.css";
import "./index.css";

const LazyApp = React.lazy(() => import("./app"));

const App = () => {
  const { status: authStatus } = useAuth();
  const actions = useActions();

  const { fetchClientBootData, fetchPubliclyReadableChannels } = actions;

  React.useEffect(() => {
    if (authStatus !== "authenticated") return;
    fetchClientBootData();
  }, [authStatus, fetchClientBootData]);

  useFetch(
    () => fetchPubliclyReadableChannels(),
    [fetchPubliclyReadableChannels]
  );

  return (
    <React.Suspense fallback={null}>
      <LazyApp />
    </React.Suspense>
  );
};

let cacheStoreStorage;
try {
  // This might throw in contexts where storage access isn’t allowed
  cacheStoreStorage = window.localStorage;
} catch (e) {
  console.warn(e);
}

createRoot(document.getElementById("app-mount")).render(
  <React.StrictMode>
    <CacheStoreProvider syncStorage={cacheStoreStorage}>
      <AuthProvider apiOrigin="/api">
        <AppStoreProvider
          cloudflareAccountHash={process.env.CLOUDFLARE_ACCT_HASH}
        >
          <App />
        </AppStoreProvider>
      </AuthProvider>
    </CacheStoreProvider>
  </React.StrictMode>
);