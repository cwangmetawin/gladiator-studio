import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteContentProvider } from '@/shared/content/SiteContentContext';

// The public site and the admin are isolated apps with separate stylesheets.
// Both are lazy so /admin never loads the site's cosmic CSS (which owns generic
// class names like .field/.card/.btn) — and vice-versa.
const App = lazy(() => import('./App').then((m) => ({ default: m.App })));
const AdminApp = lazy(() => import('@/features/admin/AdminApp').then((m) => ({ default: m.AdminApp })));

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

const isAdminRoute = window.location.pathname.replace(/\/+$/, '').endsWith('/admin');

createRoot(rootElement).render(
  <StrictMode>
    <Suspense fallback={null}>
      {isAdminRoute ? (
        <AdminApp />
      ) : (
        <SiteContentProvider>
          <App />
        </SiteContentProvider>
      )}
    </Suspense>
  </StrictMode>,
);
