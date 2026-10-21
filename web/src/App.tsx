import { AppDataProvider } from './data/AppData';
import { I18nProvider } from './i18n/I18n';
import { ThemeProvider } from './lib/theme';
import { Layout } from './components/Layout';
import { useLocation } from './lib/router';
import { Today } from './pages/Today';
import { Coursework } from './pages/Coursework';
import { Week } from './pages/Week';
import { Review } from './pages/Review';
import { CareerPage } from './pages/Career';
import { EmailPage } from './pages/Email';
import { Health } from './pages/Health';

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
  }[route];
  return <Layout route={route}>{page}</Layout>;
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
