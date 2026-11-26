import { lazy, Suspense } from 'react';
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
const RoomsPage = lazy(() => import('@/features/rooms/RoomsPage'));

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
      { path: 'lesson/:id', element: lazyRoute(LessonPage) },
      { path: 'lesson/:id/feedback', element: lazyRoute(FeedbackPage) },
      { path: 'lesson/:id/feedback/write', element: lazyRoute(FeedbackWritePage) },
      { path: 'students', element: lazyRoute(() => <PeoplePage kind="elev" />) },
      { path: 'students/:id', element: lazyRoute(() => <DirectoryDetailPage kind="elev" />) },
      { path: 'teachers', element: lazyRoute(() => <PeoplePage kind="laerer" />) },
      { path: 'teachers/:id', element: lazyRoute(() => <DirectoryDetailPage kind="laerer" />) },
      { path: 'rooms', element: lazyRoute(RoomsPage) },
      { path: 'rooms/:id', element: lazyRoute(() => <DirectoryDetailPage kind="lokale" />) },
      { path: 'chat', element: lazyRoute(ChatPage) },
      { path: 'chat/:id', element: lazyRoute(ChatPage) },
      { path: 'settings', element: lazyRoute(SettingsPage) },
    ],
  },
]);

/** Checks the Lectio session once; any later NotLoggedInError sends us back here too. */
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
  const loggedOut = session.error instanceof NotLoggedInError || queryClient.getQueryCache().getAll().some((q) => q.state.error instanceof NotLoggedInError && q.state.status === 'error' && q.getObserversCount() > 0);
  if (session.isPending) return <Loading />;
  if (loggedOut) return <LoginGate school={school} />;
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
