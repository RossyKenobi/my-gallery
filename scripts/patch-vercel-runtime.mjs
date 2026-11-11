import fs from 'node:fs';
import path from 'node:path';

const adapterPath = path.resolve('node_modules/@astrojs/vercel/dist/serverless/adapter.js');

if (fs.existsSync(adapterPath)) {
    let content = fs.readFileSync(adapterPath, 'utf8');
    // Force @astrojs/vercel serverless runtime to nodejs26.x required by Vercel
    content = content.replace(
        /function getRuntime\(process, logger\) \{[\s\S]*?^}/m,
        `function getRuntime() {\n    return 'nodejs26.x';\n}`
    );
    fs.writeFileSync(adapterPath, content, 'utf8');
    console.log('[patch-vercel-runtime] Patched @astrojs/vercel runtime to nodejs26.x');
}
