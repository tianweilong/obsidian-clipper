# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian Web Clipper is a multi-browser extension (Chrome, Firefox, Safari) that captures web content and saves it to Obsidian as Markdown files. The extension features a sophisticated template system with variables and filters, content extraction, HTML-to-Markdown conversion, highlighting capabilities, and AI integration.

## Build Commands

### Development
```bash
npm run dev              # Watch mode for Chrome (default)
npm run dev:chrome       # Watch mode for Chrome
npm run dev:firefox      # Watch mode for Firefox
npm run dev:safari       # Watch mode for Safari
```

### Production Build
```bash
npm run build            # Build all browser versions
npm run build:chrome     # Build Chrome version only
npm run build:firefox    # Build Firefox version only
npm run build:safari     # Build Safari version only
```

Build outputs:
- Chrome: `dist/` (production) or `dev/` (development)
- Firefox: `dist_firefox/` (production) or `dev_firefox/` (development)
- Safari: `dist_safari/` (production) or `dev_safari/` (development)
- Production builds also create zipped packages in `builds/`

### Localization
```bash
npm run update-locales   # Auto-translate missing strings (requires OPENAI_API_KEY in .env)
npm run add-locale fr    # Add a new locale (e.g., French)
npm run check-strings    # Check for unused translation strings
```

## Architecture Overview

### Core Components

**Extension Entry Points:**
- `src/background.ts` - Service worker managing tab lifecycle, context menus, and inter-process communication
- `src/content.ts` - Content script injected into web pages for extraction and highlighting
- `src/core/popup.ts` - Main UI for clipping web pages
- `src/core/settings.ts` - Settings and configuration UI

**Content Processing Pipeline:**
```
Web Page → Content Extractor → Markdown Converter → Template Compiler → Frontmatter Generator → Obsidian
```

Key files:
- `src/utils/content-extractor.ts` - Extracts page content and metadata
- `src/utils/markdown-converter.ts` - HTML to Markdown conversion using Turndown
- `src/utils/template-compiler.ts` - Processes template variables and filters
- `src/utils/obsidian-note-creator.ts` - Generates frontmatter and Obsidian URIs

### Template System

Templates are stored compressed (LZ-string) in `browser.storage.sync` and support:
- Variables: `{{title}}`, `{{content}}`, `{{selector:.class}}`, `{{schema:author}}`
- Filters: 50+ filters including `split`, `join`, `wikilink`, `date`, `markdown`, etc.
- Logic: `{% for item in items %}...{% endfor %}` loops
- AI prompts: `{{prompt:summarize this}}` (requires interpreter configuration)

Template compilation flow:
1. Logic processing (`processLogic`)
2. Variable replacement (`processVariables`)
3. Filter application (`applyFilters`)

Key files:
- `src/managers/template-manager.ts` - Template CRUD operations
- `src/utils/variables/` - Variable processors (simple, selector, schema, prompt)
- `src/utils/filters.ts` - Filter registry
- `src/utils/filters/*.ts` - Individual filter implementations

### Highlighter System

Allows users to highlight text and elements on web pages with persistent storage using XPath references. Features include:
- Visual overlays with customizable colors
- Undo/redo history (30 items max)
- Annotation support
- Integration with template system via `{{highlights}}` variable

Key files:
- `src/utils/highlighter.ts` - Main highlighter logic
- `src/utils/highlighter-overlays.ts` - Visual overlay management

### Browser Compatibility

The extension uses `webextension-polyfill` to abstract browser API differences. Browser-specific manifests:
- `src/manifest.chrome.json` - Chrome/Chromium (uses sidePanel API)
- `src/manifest.firefox.json` - Firefox (uses tabs.executeScript)
- `src/manifest.safari.json` - Safari (native extension)

Webpack configuration (`webpack.config.js`) handles browser-specific builds with the `BROWSER` environment variable.

### Communication Architecture

Message flow:
```
Content Script ↔ Background Script ↔ Popup/Settings
                                   ↓
                           Obsidian (via obsidian:// URI)
```

Storage layers:
- `browser.storage.sync` - Templates, settings (cross-device sync)
- `browser.storage.local` - Temporary data, cache

### Localization

34 languages supported via Chrome i18n format in `src/_locales/{lang}/messages.json`. The system includes:
- Runtime language detection
- RTL language support (Arabic, Hebrew, Persian, etc.)
- dayjs locale integration for date formatting
- Automated translation via OpenAI (see localization scripts)

Key files:
- `src/utils/i18n.ts` - Localization utilities
- `src/utils/i18n-automation.ts` - Automated translation management

## TypeScript Configuration

The project uses path aliases configured in `tsconfig.json`:
- `managers/*` → `src/managers/*`
- `utils/*` → `src/utils/*`
- `icons` → `src/icons`

Base URL is `src/`, so imports should be relative to the src directory.

## Key Architectural Patterns

1. **Memoization with Expiration**: Expensive operations (template compilation, content extraction) are memoized with 50ms expiration for UI responsiveness
2. **Storage Chunking**: Templates are split into 8KB chunks to fit browser storage limits
3. **Compression**: LZ-string compression reduces template storage footprint
4. **Message Passing**: Asynchronous communication between extension components with error handling
5. **Browser Polyfills**: `webextension-polyfill` provides cross-browser compatibility

## Development Notes

**IMPORTANT: After making code changes, DO NOT create or update any documentation files about the changes. Only modify code files as requested.**

### Testing the Extension Locally

**Chrome/Chromium:**
1. Navigate to `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked" and select the `dist/` or `dev/` directory

**Firefox:**
1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `manifest.json` from `dist_firefox/` or `dev_firefox/`

**Safari (iOS Simulator):**
1. Run `npm run build`
2. Open `xcode/Obsidian Web Clipper/Obsidian Web Clipper.xcodeproj` in Xcode
3. Select "Obsidian Web Clipper (iOS)" scheme
4. Choose an iOS Simulator and click Run

### Important Implementation Details

**Content Extraction:**
- Uses `defuddle` library for content extraction
- Extracts schema.org metadata when available
- Handles relative URLs by converting to absolute
- Preserves iframes, videos, audio, SVG, and math elements

**Markdown Conversion:**
- Uses `turndown` with custom rules
- Handles complex tables with colspan/rowspan
- Converts MathML to LaTeX via `mathml-to-latex`
- Manages footnotes and preserves code blocks

**Obsidian Integration:**
- Uses `obsidian://` URI protocol for communication
- Clipboard fallback for large content (URI length limits)
- Supports multiple save behaviors: create, append, prepend, overwrite
- Handles daily notes and specific vault paths

**Security:**
- DOMPurify sanitizes HTML before insertion
- Content Security Policy restricts script sources
- XPath validation for element references
- API keys stored in browser.storage.sync (encrypted by browser)

### Performance Considerations

- Template compilation is memoized with 50ms expiration
- Settings are loaded on demand
- Source maps only generated in development mode
- Terser minification with aggressive optimization in production
- Debouncing for UI updates

## Third-Party Libraries

- `webextension-polyfill` - Browser compatibility layer
- `defuddle` - Content extraction
- `turndown` - HTML to Markdown conversion
- `dayjs` - Date parsing and formatting
- `lz-string` - Template compression
- `lucide` - Icons
- `mathml-to-latex` - MathML conversion
- `dompurify` - HTML sanitization
- `highlight.js` - Syntax highlighting in reader mode
