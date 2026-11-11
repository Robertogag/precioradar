import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { TopBar } from './components/TopBar.tsx';
import { useT } from './i18n/index.ts';
import { useResolvedTheme } from './state/settings.ts';
import { DealsPage } from './pages/DealsPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { LegalPage } from './pages/LegalPage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import { StatsPage } from './pages/StatsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { StoresPage } from './pages/StoresPage.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 },
  },
});

function Shell() {
  const { t, lang } = useT();
  const { pathname } = useLocation();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // El tema se aplica como atributo en <html>; tokens.css define los colores de cada uno.
  const theme = useResolvedTheme();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (pathname === '/') document.title = t((d) => d.app.title);
  }, [pathname, t]);

  return (
    <>
      <a className="skip" href="#main">
        {t((d) => d.nav.skip)}
      </a>
      <TopBar />
      <main id="main" className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/buscar" element={<SearchPage />} />
          <Route path="/descuentos" element={<DealsPage />} />
          <Route path="/tiendas" element={<StoresPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="/privacidad" element={<LegalPage kind="privacidad" />} />
          <Route path="/terminos" element={<LegalPage kind="terminos" />} />
          {/* Reporte privado de uso: sin enlace en el menú; pide la llave del reporte. */}
          <Route path="/estadisticas" element={<StatsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="foot">
        <div className="wrap foot__inner">
          <span>{t((d) => d.footer.note)}</span>
          <nav className="foot__links" aria-label={t((d) => d.footer.legal)}>
            <Link to="/privacidad">{t((d) => d.footer.privacy)}</Link>
            <Link to="/terminos">{t((d) => d.footer.terms)}</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
