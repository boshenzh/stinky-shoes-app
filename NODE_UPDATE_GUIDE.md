# Node.js Update Guide

## Current Status
- **Your Node version**: v12.22.9
- **Required version**: Node 18+ (recommended: Node 20 LTS)
- **Vite requirement**: Node ^20.19.0 || >=22.12.0

## Why Update?

1. **Build compatibility**: Vite 7 requires Node 20+
2. **Dependencies**: Many packages require Node 18+ (bcrypt, pg, etc.)
3. **Local testing**: Build and test locally before deploying to Vercel
4. **Vercel compatibility**: Vercel uses Node 18+ automatically

## Update Methods

### Option 1: Using nvm (Recommended - Linux/Mac)

```bash
# Install nvm if you don't have it
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell or run:
source ~/.bashrc  # or ~/.zshrc

# Install Node 20 LTS (recommended)
nvm install 20

# Use Node 20
nvm use 20

# Set as default
nvm alias default 20

# Verify
node --version  # Should show v20.x.x
npm --version
```

### Option 2: Using nvm (Windows)

```powershell
# Download and install nvm-windows from:
# https://github.com/coreybutler/nvm-windows/releases

# Then in PowerShell/Command Prompt:
nvm install 20.18.0
nvm use 20.18.0

# Verify
node --version
```

### Option 3: Direct Download (All Platforms)

1. Visit https://nodejs.org/
2. Download Node.js 20 LTS (Long Term Support)
3. Run the installer
4. Verify: `node --version`

### Option 4: Using apt (Ubuntu/Debian)

```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js 20
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```

### Option 5: Using Homebrew (Mac)

```bash
# Install Homebrew if needed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node 20
brew install node@20

# Link it
brew link node@20

# Verify
node --version
```

## After Updating

1. **Reinstall dependencies** (some packages may need rebuilding):
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Test the build**:
   ```bash
   npm run build
   ```

3. **Test local dev server**:
   ```bash
   npm run dev
   ```

## Verify Your Installation

```bash
# Check Node version
node --version  # Should be v18.x.x or v20.x.x

# Check npm version
npm --version   # Should be v8.x.x or higher

# Verify build works
npm run build
```

## Troubleshooting

### "Command not found: node" after update
- Close and reopen your terminal
- Check PATH: `echo $PATH` (should include Node.js)
- On Linux/Mac: restart terminal or run `source ~/.bashrc`
- On Windows: restart Command Prompt/PowerShell

### Build still fails after update
- Clear cache: `npm cache clean --force`
- Remove node_modules: `rm -rf node_modules`
- Reinstall: `npm install`
- Try build again: `npm run build`

### Permission errors
- Don't use `sudo` with npm (use nvm or proper installation)
- If needed, fix npm permissions: `npm config set prefix ~/.npm-global`

## Recommended Version

**Node.js 20 LTS** is recommended because:
- ✅ Matches Vite 7 requirements exactly
- ✅ LTS (Long Term Support) - stable and supported
- ✅ Works with all your dependencies
- ✅ Matches Vercel's default Node version

## Quick Check

After updating, run:
```bash
node --version && npm --version && npm run build
```

All should work without errors!

