#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const path = require('path');

async function isVercelLoggedIn() {
  try {
    const out = execSync('vercel whoami', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: true });
    return out.trim().length > 0;
  } catch (e) {
    return false;
  }
}

async function loginVercel() {
  console.log('Initiating Vercel device login flow...');
  return new Promise((resolve, reject) => {
    const child = spawn('vercel', ['login'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let codeFound = false;

    child.stdout.on('data', data => {
      const text = data.toString();
      process.stdout.write(text);
      if (text.includes('oauth/device')) {
        codeFound = true;
      }
    });

    child.stderr.on('data', data => {
      const text = data.toString();
      process.stderr.write(text);
      if (text.includes('oauth/device')) {
        codeFound = true;
      }
    });

    child.on('close', code => {
      if (code === 0) {
        console.log('\n[SUCCESS] Vercel login completed successfully!');
        resolve();
      } else {
        reject(new Error(`vercel login exited with code ${code}`));
      }
    });
  });
}

async function deployProd() {
  console.log('\n[DEPLOY] Deploying artifacts/cadence directly to production on Vercel...');
  return new Promise((resolve, reject) => {
    const child = spawn('vercel', ['deploy', 'artifacts/cadence', '--prod', '--yes'], {
      shell: true,
      stdio: 'inherit'
    });

    child.on('close', code => {
      if (code === 0) {
        console.log('\n[SUCCESS] Vercel production deployment completed successfully!');
        resolve();
      } else {
        reject(new Error(`vercel deploy exited with code ${code}`));
      }
    });
  });
}

async function verifyLive() {
  console.log('\n[VERIFY] Probing live production CDN (https://cadence-task-os.vercel.app)...');
  try {
    const swRes = await fetch('https://cadence-task-os.vercel.app/sw.js', { cache: 'no-store' });
    const swText = await swRes.text();
    const cacheMatch = swText.match(/const CACHE = [^;]+;/);
    console.log('Live sw.js Cache constant:', cacheMatch ? cacheMatch[0] : 'Not found');

    const htmlRes = await fetch('https://cadence-task-os.vercel.app/', { cache: 'no-store' });
    const htmlText = await htmlRes.text();
    const scriptMatch = htmlText.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
    console.log('Live index.html entry script:', scriptMatch ? scriptMatch[1] : 'Not found');
  } catch (err) {
    console.error('Verification fetch error:', err.message);
  }
}

async function main() {
  const loggedIn = await isVercelLoggedIn();
  if (!loggedIn) {
    console.log('[AUTH] Vercel CLI session expired or not authenticated.');
    await loginVercel();
  } else {
    console.log('[AUTH] Vercel CLI is authenticated.');
  }

  await deployProd();
  await verifyLive();
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
