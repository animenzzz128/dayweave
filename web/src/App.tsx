import { AppDataProvider } from './data/AppData';
import { I18nProvider } from './i18n/I18n';
import { ThemeProvider } from './lib/theme';
import { Layout } from './components/Layout';
import { Fragment, lazy, Suspense } from 'react';
import { useLocation } from './lib/router';
import { Today } from './pages/Today';
import { Coursework } from './pages/Coursework';
import { Week } from './pages/Week';
import { Review } from './pages/Review';
import { CareerPage } from './pages/Career';
import { EmailPage } from './pages/Email';
import { Health } from './pages/Health';
import { PageSkeleton } from './components/ui';

// The case study is long text the app pages never need, so it loads only when opened.
const CaseStudy = lazy(() => import('./pages/CaseStudy'));

function Routed() {
  const { route, params } = useLocation();
  const page = {
    today: <Today />,
    coursework: <Coursework params={params} />,
    week: <Week params={params} />,
    review: <Review params={params} />,
    career: <CareerPage />,
    email: <EmailPage />,
    health: <Health />,
    'case-study': <Suspense fallback={<PageSkeleton />}><CaseStudy /></Suspense>,
  }[route];
  // Keyed by the whole location, so following a link to another item on the same page starts that page fresh.
  return <Layout route={route}><Fragment key={route + '?' + params}>{page}</Fragment></Layout>;
}

export function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AppDataProvider>
          <Routed />
        </AppDataProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
