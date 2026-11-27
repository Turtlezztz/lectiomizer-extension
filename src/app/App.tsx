import { lazy, Suspense, useEffect, useRef } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { queryClient } from '@/lib/lectio/query';
import { NotLoggedInError, getPage } from '@/lib/lectio/client';
import { pageUrl, PATHS } from '@/lib/lectio/paths';
import { Shell } from './Shell';
import { LoginGate, SchoolPicker } from './Onboarding';
import { Skeleton } from '@/components/ui/skeleton';

const HomePage = lazy(() => import('@/features/home/HomePage'));
const SchedulePage = lazy(() => import('@/features/schedule/SchedulePage'));
const AssignmentsPage = lazy(() => import('@/features/assignments/AssignmentsPage'));
const AssignmentPage = lazy(() => import('@/features/assignments/AssignmentPage'));
const MessagesPage = lazy(() => import('@/features/messages/MessagesPage'));
const GradesPage = lazy(() => import('@/features/grades/GradesPage'));
const AbsencePage = lazy(() => import('@/features/absence/AbsencePage'));
const LessonPage = lazy(() => import('@/features/lesson/LessonPage'));
const FeedbackPage = lazy(() => import('@/features/lesson/FeedbackPage'));
const FeedbackWritePage = lazy(() => import('@/features/lesson/FeedbackWritePage'));
const ChatPage = lazy(() => import('@/features/chat/ChatPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const PeoplePage = lazy(() => import('@/features/people/PeoplePage'));
const DirectoryDetailPage = lazy(() => import('@/features/people/DirectoryDetailPage'));
const QuestionnairesPage = lazy(() => import('@/features/questionnaires/QuestionnairesPage'));
const QuestionnairePage = lazy(() => import('@/features/questionnaires/QuestionnairePage'));
const RoomsPage = lazy(() => import('@/features/rooms/RoomsPage'));
const TeamsPage = lazy(() => import('@/features/teams/TeamsPage'));
const TeamPage = lazy(() => import('@/features/teams/TeamPage'));

function Loading() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-4 px-8 py-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-4 pt-4 md:grid-cols-3">
        <Skeleton className="h-40 md:col-span-2" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

const lazyRoute = (Comp: React.ComponentType) => (
  <Suspense fallback={<Loading />}>
    <Comp />
  </Suspense>
);

const router = createHashRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: lazyRoute(HomePage) },
      { path: 'schedule', element: lazyRoute(SchedulePage) },
      { path: 'assignments', element: lazyRoute(AssignmentsPage) },
      { path: 'assignments/:id', element: lazyRoute(AssignmentPage) },
      { path: 'messages', element: lazyRoute(MessagesPage) },
      { path: 'messages/:id', element: lazyRoute(MessagesPage) },
      { path: 'grades', element: lazyRoute(GradesPage) },
      { path: 'absence', element: lazyRoute(AbsencePage) },
      { path: 'questionnaires', element: lazyRoute(QuestionnairesPage) },
      { path: 'questionnaires/:id', element: lazyRoute(QuestionnairePage) },
      { path: 'lesson/:id', element: lazyRoute(LessonPage) },
      { path: 'lesson/:id/feedback', element: lazyRoute(FeedbackPage) },
      { path: 'lesson/:id/feedback/write', element: lazyRoute(FeedbackWritePage) },
      { path: 'students', element: lazyRoute(() => <PeoplePage kind="elev" />) },
      { path: 'students/:id', element: lazyRoute(() => <DirectoryDetailPage kind="elev" />) },
      { path: 'teachers', element: lazyRoute(() => <PeoplePage kind="laerer" />) },
      { path: 'teachers/:id', element: lazyRoute(() => <DirectoryDetailPage kind="laerer" />) },
      { path: 'teams', element: lazyRoute(TeamsPage) },
      { path: 'teams/:id', element: lazyRoute(TeamPage) },
      { path: 'rooms', element: lazyRoute(RoomsPage) },
      { path: 'rooms/:id', element: lazyRoute(() => <DirectoryDetailPage kind="lokale" />) },
      { path: 'chat', element: lazyRoute(ChatPage) },
      { path: 'chat/:id', element: lazyRoute(ChatPage) },
      { path: 'settings', element: lazyRoute(SettingsPage) },
    ],
  },
]);

/**
 * Checks the Lectio session once, then keeps an eye on every page load and
 * action: when one of them lands on Lectio's login page, the session is checked
 * again and, if it really has expired, the app is swapped for the login prompt
 * (rather than leaving each page with its own error). Once the student is back
 * in, the failed pages are reloaded.
 */
function SessionGate() {
  const { settings } = useSettings();
  const school = settings.school!;
  const session = useQuery({
    queryKey: ['session', school.id],
    queryFn: async () => {
      await getPage(pageUrl(school.id, PATHS.home));
      return true;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
  const loggedOut = session.error instanceof NotLoggedInError;

  useEffect(() => {
    const recheck = () => queryClient.refetchQueries({ queryKey: ['session', school.id], exact: true }, { cancelRefetch: false });
    const offQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error' || event.query.queryKey[0] === 'session') return;
      if (event.action.error instanceof NotLoggedInError) recheck();
    });
    const offMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error' && event.action.error instanceof NotLoggedInError) recheck();
    });
    return () => {
      offQueries();
      offMutations();
    };
  }, [school.id]);

  // The login happens in another tab; check again whenever the student comes back here.
  useEffect(() => {
    if (!loggedOut) return;
    const recheck = () => {
      if (document.visibilityState === 'visible') session.refetch({ cancelRefetch: false });
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, [loggedOut, session.refetch]);

  // Logged out → back in: reload everything that failed (or was cached) under the old session.
  const wasLoggedOut = useRef(false);
  useEffect(() => {
    if (loggedOut) wasLoggedOut.current = true;
    else if (session.isSuccess && wasLoggedOut.current) {
      wasLoggedOut.current = false;
      queryClient.resetQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
    }
  }, [loggedOut, session.isSuccess]);

  if (session.isPending) return <Loading />;
  if (loggedOut) return <LoginGate school={school} checking={session.isFetching} onCheck={() => session.refetch()} />;
  return <RouterProvider router={router} />;
}

function Root() {
  const { settings, ready } = useSettings();
  if (!ready) return null;
  if (!settings.school) return <SchoolPicker />;
  return <SessionGate />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <Root />
      </SettingsProvider>
    </QueryClientProvider>
  );
}
