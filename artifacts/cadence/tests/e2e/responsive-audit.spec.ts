import { test, expect, installMockApi } from './fixtures';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/Dell/.gemini/antigravity/brain/2accebc1-9670-4e0e-8cec-f89acd5905ed/responsive';

const VIEWPORTS = [
  { name: 'compact-mobile', width: 360, height: 740 },
  { name: 'standard-mobile', width: 390, height: 844 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

const PAGES_TO_AUDIT = [
  { path: '/today', name: 'today' },
  { path: '/focus', name: 'focus' },
  { path: '/calendar', name: 'calendar' },
  { path: '/inbox', name: 'inbox' },
  { path: '/goals', name: 'goals' },
  { path: '/agent', name: 'agent' },
  { path: '/settings', name: 'settings' },
];

const now = new Date();
const todayIso = now.toISOString();

const SEED_TASKS = [
  {
    id: 1,
    title: 'Review production infrastructure telemetry and metrics',
    status: 'open' as const,
    priority: 'high' as const,
    durationMin: 45,
    dueAt: todayIso,
    notes: 'Check Supabase connection pool and latency percentiles.',
  },
  {
    id: 2,
    title: 'Audit mobile navigation drawer and touch targets',
    status: 'open' as const,
    priority: 'medium' as const,
    durationMin: 30,
    dueAt: todayIso,
    notes: 'Verify 44px tap targets and zero hit area overlap.',
  },
  {
    id: 3,
    title: 'Weekly planning and time blocking session',
    status: 'completed' as const,
    priority: 'low' as const,
    durationMin: 25,
    dueAt: todayIso,
    completedAt: todayIso,
  },
];

test.describe('Responsive Multi-Device Audit', () => {
  for (const pageItem of PAGES_TO_AUDIT) {
    for (const vp of VIEWPORTS) {
      test(`${pageItem.name} at ${vp.name} (${vp.width}x${vp.height}) has zero horizontal overflow`, async ({ page, open }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await installMockApi(page, { tasks: SEED_TASKS });

        const consoleErrors: string[] = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
          }
        });

        await open(pageItem.path);
        await page.waitForTimeout(600);

        // Check horizontal overflow
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
          const clientWidth = doc.clientWidth;
          return {
            scrollWidth,
            clientWidth,
            hasOverflow: scrollWidth > clientWidth + 1, // 1px threshold for fractional subpixels
          };
        });

        expect(
          overflow.hasOverflow,
          `${pageItem.name} at ${vp.name} has horizontal overflow: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`
        ).toBe(false);

        // Capture screenshot for standard-mobile and tablet-portrait and desktop
        if (vp.name === 'standard-mobile' || vp.name === 'tablet-portrait' || vp.name === 'desktop') {
          const screenshotPath = path.join(ARTIFACT_DIR, `${pageItem.name}-${vp.name}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
        }
      });
    }
  }
});
