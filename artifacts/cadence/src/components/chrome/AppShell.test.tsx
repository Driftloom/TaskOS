/**
 * AppShell — the sample-data banner.
 *
 * The dev mock answers API requests with fixtures. Those fixtures are not the
 * user's account, so the shell has to say so. `AppShell` wraps every page, so
 * the banner is visible everywhere or nowhere; this test pins the "everywhere".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ['/today', vi.fn()],
}));

vi.mock('@clerk/react', () => ({
  useClerk: () => ({ signOut: vi.fn() }),
  useUser: () => ({ user: { firstName: 'Dev' } }),
}));

vi.mock('@workspace/api-client-react', () => ({
  useListFocusSessions: () => ({ data: [] }),
  useListTasks: () => ({ data: [] }),
  useHealthCheck: () => ({ data: undefined, isValid: true, isPending: false, refetch: vi.fn() }),
  getListFocusSessionsQueryKey: () => ['focus-sessions'],
  getListTasksQueryKey: () => ['tasks'],
}));

vi.mock('./ThemeProvider', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

// Both mount against the network or a query cache; neither is what this test
// is about.
vi.mock('./AutomationPausedBanner', () => ({
  AutomationPausedBanner: () => null,
}));
vi.mock('./CommandPalette', () => ({
  CommandPalette: () => null,
}));

const BANNER_TEXT = 'Sample data — this is a local preview, not your account.';

describe('AppShell sample-data banner', () => {
  const originalFetch = window.fetch;

  beforeEach(() => {
    // The dev-mock flag is module-level and one-way, so each test gets a
    // fresh module registry and therefore a fresh `devMockActive === false`.
    vi.resetModules();
    window.fetch = originalFetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  async function renderShell() {
    const { AppShell } = await import('./AppShell');
    return render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
  }

  it('says nothing about sample data while the real backend answers', async () => {
    await renderShell();
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
  });

  it('shows a role="status" banner on the page once the dev mock serves', async () => {
    const { setupDevMock } = await import('@/lib/dev-mock');
    setupDevMock();
    // The mock answers, which is what flips the flag the banner reads.
    await fetch('/api/tasks');

    await renderShell();

    await waitFor(() => {
      expect(screen.getByText(BANNER_TEXT)).toBeInTheDocument();
    });
    expect(screen.getByRole('status')).toHaveTextContent(BANNER_TEXT);
  });
});

describe('AppShell mobile drawer & navigation', () => {
  async function renderShell() {
    const { AppShell } = await import('./AppShell');
    return render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );
  }

  it('renders mobile profile avatar in the header', async () => {
    await renderShell();
    const profileBtn = screen.getByTestId('button-profile-mobile');
    expect(profileBtn).toBeInTheDocument();
    expect(profileBtn).toHaveTextContent('D'); // Dev -> 'D'
  });

  it('opens mobile drawer with grouped nav, capture CTA, and quick settings toolbar', async () => {
    await renderShell();
    
    // Initially drawer is closed
    expect(screen.queryByTestId('button-close-drawer')).not.toBeInTheDocument();

    // Tap menu button
    const menuBtn = screen.getByTestId('button-mobile-menu');
    fireEvent.click(menuBtn);

    // Drawer is now open
    const drawer = screen.getByRole('dialog', { name: 'Navigation menu' });
    expect(drawer).toBeInTheDocument();
    const inDrawer = within(drawer);

    expect(inDrawer.getByTestId('button-close-drawer')).toBeInTheDocument();
    expect(inDrawer.getByTestId('link-drawer-brand')).toBeInTheDocument();
    expect(inDrawer.getByTestId('button-drawer-capture')).toBeInTheDocument();

    // Section headers exist inside drawer
    expect(inDrawer.getByText('Workspace')).toBeInTheDocument();
    expect(inDrawer.getByText('Organize')).toBeInTheDocument();
    expect(inDrawer.getByText('Account')).toBeInTheDocument();

    // Nav items exist inside drawer
    expect(inDrawer.getByTestId('link-drawer-dashboard')).toBeInTheDocument();
    expect(inDrawer.getByTestId('link-drawer-today')).toBeInTheDocument();
    expect(inDrawer.getByTestId('link-drawer-projects')).toBeInTheDocument();
    expect(inDrawer.getByTestId('link-drawer-settings')).toBeInTheDocument();

    // Quick settings toolbar buttons exist inside drawer
    expect(inDrawer.getByTestId('button-sound-toggle-drawer')).toBeInTheDocument();
    expect(inDrawer.getByTestId('button-theme-toggle-drawer')).toBeInTheDocument();
    expect(inDrawer.getByTestId('button-palette-drawer')).toBeInTheDocument();

    // Tap close button
    fireEvent.click(inDrawer.getByTestId('button-close-drawer'));
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
  });
});
