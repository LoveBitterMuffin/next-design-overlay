#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const prompts = require('prompts');
const chalk = require('chalk');
const { execSync } = require('child_process');

async function main() {
  console.log(chalk.cyan.bold('\nWelcome to next-design-overlay init! 🎨\n'));

  const response = await prompts([
    {
      type: 'confirm',
      name: 'useSrcDir',
      message: 'Are you using a `src/` directory?',
      initial: true
    },
    {
      type: 'confirm',
      name: 'useAppRouter',
      message: 'Are you using the App Router (`app/`)?',
      initial: true
    }
  ]);

  if (!response.useAppRouter) {
    console.log(chalk.red('\nError: This tool currently only supports Next.js App Router.'));
    process.exit(1);
  }

  const projectRoot = process.cwd();
  const srcPrefix = response.useSrcDir ? 'src' : '';
  
  // Destination paths
  const destComponents = path.join(projectRoot, srcPrefix, 'components', 'design-overlay');
  const destApi = path.join(projectRoot, srcPrefix, 'app', 'api', 'design-overlay');
  const destScripts = path.join(projectRoot, 'scripts');

  // Source paths (from this package)
  const pkgRoot = path.join(__dirname, '..');
  const srcComponents = path.join(pkgRoot, 'templates', 'components', 'design-overlay');
  const srcApi = path.join(pkgRoot, 'templates', 'api', 'design-overlay');
  const srcScripts = path.join(pkgRoot, 'templates', 'scripts');

  try {
    console.log(chalk.gray('Copying components...'));
    await fs.copy(srcComponents, destComponents);
    
    console.log(chalk.gray('Copying API routes...'));
    await fs.copy(srcApi, destApi);
    
    console.log(chalk.gray('Copying MCP script...'));
    await fs.copy(srcScripts, destScripts);

    console.log(chalk.gray('Installing dependencies (html-to-image)...'));
    execSync('npm install html-to-image', { stdio: 'inherit', cwd: projectRoot });

    console.log(chalk.green.bold('\n✨ Installation complete!\n'));
    
    console.log(chalk.cyan('Next steps:'));
    console.log(`1. Import and mount ${chalk.yellow('<DesignOverlay />')} in your ${chalk.yellow(srcPrefix ? 'src/app/layout.tsx' : 'app/layout.tsx')}:`);
    console.log(chalk.gray(`
   import { DesignOverlay } from '@/components/design-overlay/DesignOverlay';
   
   export default function RootLayout({ children }) {
     return (
       <html lang="en">
         <body>
           {children}
           <DesignOverlay />
         </body>
       </html>
     );
   }
    `));
    console.log(`2. Setup MCP for your AI Agent (Cursor/Claude/Gemini):`);
    console.log(`   Command: ${chalk.yellow('node scripts/design-overlay-mcp.js')}`);
    console.log(`3. Run your dev server and click the 🎨 icon in the bottom left!\n`);

  } catch (err) {
    console.error(chalk.red('\nError during installation:'));
    console.error(err);
    process.exit(1);
  }
}

main().catch(console.error);
