import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@app/AppLayout';
import { RequireAuth } from '@app/RequireAuth';
import { LoginPage } from '@features/auth/LoginPage';
import { MyPostsPage } from '@features/posts/MyPostsPage';
import { PostEditorPage } from '@features/posts/editor/PostEditorPage';
import { ApprovalQueuePage } from '@features/approvals/ApprovalQueuePage';
import { ApprovalReviewPage } from '@features/approvals/review/ApprovalReviewPage';

/**
 * Route table. Each guarded route names the permission its screen needs; the same check is repeated
 * server-side on every request behind it.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/posts" replace /> },
      {
        path: 'posts',
        element: (
          <RequireAuth permission="post:read:own">
            <MyPostsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'posts/:id/edit',
        element: (
          <RequireAuth permission="post:read:own">
            <PostEditorPage />
          </RequireAuth>
        ),
      },
      {
        path: 'approvals',
        element: (
          <RequireAuth permission="approval:read:assigned">
            <ApprovalQueuePage />
          </RequireAuth>
        ),
      },
      {
        path: 'approvals/:id/review',
        element: (
          <RequireAuth permission="approval:read:assigned">
            <ApprovalReviewPage />
          </RequireAuth>
        ),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
