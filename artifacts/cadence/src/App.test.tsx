import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock wouter
const mockRedirect = vi.fn();
vi.mock('wouter', () => ({
  Redirect: (props: { to: string }) => {
    mockRedirect(props.to);
    return <div data-testid="mock-redirect" data-to={props.to} />;
  },
  Link: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ['/', vi.fn()],
  Route: ({ component: Component }: any) => <Component />,
  Switch: ({ children }: any) => <div>{children}</div>,
  Router: ({ children }: any) => <div>{children}</div>,
}));

// Mock Clerk auth
let mockAuthState = { isLoaded: true, isSignedIn: false };
vi.mock('@clerk/react', () => ({
  useAuth: () => mockAuthState,
  SignIn: () => <div data-testid="clerk-sign-in" />,
  SignUp: () => <div data-testid="clerk-sign-up" />,
  ClerkProvider: ({ children }: any) => <div>{children}</div>,
}));

// Mock Theme context
let mockTheme = 'dark';
const mockToggleTheme = vi.fn();
vi.mock('@/components/chrome/ThemeProvider', () => ({
  useTheme: () => ({
    theme: mockTheme,
    toggleTheme: mockToggleTheme,
  }),
  ThemeProvider: ({ children }: any) => <div>{children}</div>,
}));

// Mock LandingPage
vi.mock('@/pages/landing/LandingPage', () => ({
  LandingPage: () => <div data-testid="landing-page">Landing Page Mock</div>,
}));

import { isDevTestAuth, HomeRedirect, AuthThemeToggle } from './App';

describe('AUT-04: isDevTestAuth bypass validation', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).location;
    (window as any).location = new URL('http://localhost:5173/');
  });

  it('returns false when neither query param nor localStorage is set', () => {
    expect(isDevTestAuth()).toBe(false);
  });

  it('returns true when query param test_auth=true is present in dev mode', () => {
    (window as any).location = new URL('http://localhost:5173/?test_auth=true');
    expect(isDevTestAuth()).toBe(true);
  });

  it('returns true when localStorage cadence_test_auth is set to true', () => {
    localStorage.setItem('cadence_test_auth', 'true');
    expect(isDevTestAuth()).toBe(true);
  });
});

describe('HomeRedirect routing logic', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    localStorage.clear();
    delete (window as any).location;
    (window as any).location = new URL('http://localhost:5173/');
    mockAuthState = { isLoaded: true, isSignedIn: false };
  });

  it('renders LandingPage when user is unauthenticated', () => {
    render(<HomeRedirect />);
    expect(screen.getByTestId('landing-page')).toBeInTheDocument();
  });

  it('renders LoadingScreen when auth is not loaded', () => {
    mockAuthState = { isLoaded: false, isSignedIn: false };
    render(<HomeRedirect />);
    expect(screen.getByText(/Loading your cadence/i)).toBeInTheDocument();
  });

  it('redirects to /dashboard by default when user is signed in', () => {
    mockAuthState = { isLoaded: true, isSignedIn: true };
    render(<HomeRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('preserves and redirects to cadence_last_path when present in localStorage', () => {
    mockAuthState = { isLoaded: true, isSignedIn: true };
    localStorage.setItem('cadence_last_path', '/calendar');
    render(<HomeRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith('/calendar');
  });

  it('ignores invalid last paths such as /sign-in or /download and defaults to /dashboard', () => {
    mockAuthState = { isLoaded: true, isSignedIn: true };
    localStorage.setItem('cadence_last_path', '/sign-in');
    render(<HomeRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });
});

describe('AuthThemeToggle Component', () => {
  beforeEach(() => {
    mockToggleTheme.mockClear();
    mockTheme = 'dark';
  });

  it('renders with accessible name to switch to light appearance in dark mode', () => {
    render(<AuthThemeToggle />);
    const button = screen.getByTestId('auth-theme-toggle');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Switch to light appearance');
    expect(button).toHaveAttribute('title', 'Light appearance');
  });

  it('fires toggleTheme on click', () => {
    render(<AuthThemeToggle />);
    const button = screen.getByTestId('auth-theme-toggle');
    fireEvent.click(button);
    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('renders with accessible name to switch to dark appearance in light mode', () => {
    mockTheme = 'light';
    render(<AuthThemeToggle />);
    const button = screen.getByTestId('auth-theme-toggle');
    expect(button).toHaveAttribute('aria-label', 'Switch to dark appearance');
    expect(button).toHaveAttribute('title', 'Dark appearance');
  });
});
