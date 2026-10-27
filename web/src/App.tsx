import { AppDataProvider } from './data/AppData';
import { I18nProvider } from './i18n/I18n';
import { ThemeProvider } from './lib/theme';
import { Layout } from './components/Layout';
import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { useI18n } from './i18n/I18n';
import { trackPage } from './lib/analytics';
import { useLocation } from './lib/router';
import { Today } from './pages/Today';
import { PageSkeleton } from './components/ui';

// Today is the landing page and ships in the main bundle; every other page loads when first opened.
const named = <K extends string>(load: () => Promise<Record<K, ComponentType<any>>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const Coursework = named(() => import('./pages/Coursework'), 'Coursework');
const Week = named(() => import('./pages/Week'), 'Week');
const Plan = named(() => import('./pages/Plan'), 'Plan');
const Review = named(() => import('./pages/Review'), 'Review');
const CareerPage = named(() => import('./pages/Career'), 'CareerPage');
const EmailPage = named(() => import('./pages/Email'), 'EmailPage');
const Health = named(() => import('./pages/Health'), 'Health');
const CaseStudy = lazy(() => import('./pages/CaseStudy'));

function Routed() {
  const { route, params } = useLocation();
  const { t } = useI18n();
  useEffect(() => { document.title = `${t.nav[route]} · Dayweave`; }, [route, t]);
  useEffect(() => { trackPage(route); }, [route]);
  const page = {
    today: <Today />,
    plan: <Plan params={params} />,
    coursework: <Coursework params={params} />,
    week: <Week params={params} />,
    review: <Review params={params} />,
    career: <CareerPage params={params} />,
    email: <EmailPage />,
    health: <Health />,
    'case-study': <CaseStudy />,
  }[route];
  // Keyed by the whole location, so following a link to another item on the same page starts that page fresh.
  return <Layout route={route}><Suspense key={route + '?' + params} fallback={<PageSkeleton />}>{page}</Suspense></Layout>;
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
