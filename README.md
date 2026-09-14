# StyleSnap

A comprehensive digital closet management platform that helps users organize their wardrobe, create outfit combinations, and receive AI-powered style suggestions.

## Description

StyleSnap is a full-stack web application designed for fashion enthusiasts who want to digitally organize their wardrobes and discover new outfit combinations. The platform features an interactive drag-and-drop outfit creator, AI-powered styling suggestions using Google Gemini, virtual try-on capabilities via Hugging Face, social features for sharing outfits with friends, and real-time notifications. Built with Vue.js 3 and powered by Supabase, it provides a seamless experience for managing your personal style.

## Features

- **Digital Closet Management** - Upload, organize, and categorize clothing items with photos
- **Interactive Outfit Creator** - Drag-and-drop canvas to create and visualize outfit combinations
- **AI-Powered Suggestions** - Get automated outfit recommendations using Google Gemini
- **Virtual Try-On** - See outfits on AI-generated models using Hugging Face IDM-VTON
- **Friend Connections** - Add friends, view their closets, and share outfit ideas
- **Real-time Notifications** - Stay updated on friend activities and suggestions
- **Smart Search & Filter** - Find items by name, brand, category, or color
- **Theme Customization** - Light/dark mode with multiple theme options
- **Catalog Browsing** - Browse and add pre-seeded catalog items to your closet

## Technologies Used

- **Vue.js 3** - Frontend framework with Composition API
- **Vite** - Fast development server and build tool
- **Tailwind CSS** - Utility-first CSS framework
- **Supabase** - Backend-as-a-Service (PostgreSQL, Auth, Realtime)
- **Cloudinary** - Image storage and optimization
- **TypeScript** - Type-safe JavaScript
- **Pinia** - State management
- **Vue Router** - Client-side routing
- **@google/genai** - Google Generative AI for outfit suggestions
- **@huggingface/inference** - Virtual try-on integration
- **Three.js** - 3D graphics for avatar carousel

## Storage usage audit

Run **Cloudinary storage usage** from GitHub Actions on `main` to read the product
environment's aggregate bytes and resource counts using the existing Cloudinary
repository secrets. The inventory runs only on manual dispatch, after its tests
pass. It does not list or download assets, change data, or expose provider payloads.
Its JSON summary includes units and safe failure codes; a failed check exits nonzero.
Storage includes the provider's retained originals and derived resources, so this
aggregate alone does not prove that a future Supabase migration fits its allowance.
Bandwidth follows the provider's usage-report window; it is not a verified calendar-month total.

Local validation: `python -m unittest discover -s tests/maintenance -p test_cloudinary_usage.py -v`.

The **Private media manifest** workflow performs the next read-only inventory
stage. It bounds Cloudinary pagination/API units and database reference reads,
includes backed-up/deleted source records and existing derived assets, and
reports reference gaps without replacing them. Its complete manifest stays in
a private temporary runner file; only counts, byte totals and its SHA-256 reach
the workflow summary. There is no artifact upload, asset copy or database write.
The tested add-only copy primitive is not exposed by the CLI or workflow; a
reviewed access, capacity and rollback design is required before enabling it.
The `derived_probe` dispatch option checks only existing transformation details
and aggregate parity, with a 35-unit Admin API cap. It uses Cloudinary's SDK query
form and one documented extensionless lookup after an initial 404, so a failed
variant lookup can be diagnosed without repeating the original asset inventory.

Manifest validation: `python -m unittest discover -s tests/maintenance -p test_stylesnap_media.py -v`.

The separate **Encrypted media manifest export** workflow preserves that complete
raw manifest for private review, including unresolved references and every source
metadata field. It encrypts the canonical bytes in memory with a fresh AES-256-GCM
key and IV, wrapping the key with RSA-OAEP SHA-256 for the reviewed public recipient
in `scripts/stylesnap-export-recipient.pem`. The receiving private key stays off
GitHub. Only ciphertext is written and uploaded, with one-day artifact retention;
the receiving owner must retain the downloaded ciphertext before it expires.
Logs contain aggregate counts, byte totals, public recipient identity and hashes.
Export is manual on `main`, after tests, with 200 Admin units, 430 total requests,
128 MiB of aggregate responses, and a 32 MiB raw-manifest limit. It shares the
existing manifest workflow's concurrency group and does not copy media, write to
Supabase, change references, or claim a consistent snapshot or completed migration.

Encrypted export validation: `node --test tests/maintenance/stylesnap-manifest-envelope.test.mjs`
and `python -m unittest discover -s tests/maintenance -p test_stylesnap_manifest_export.py -v`.

Clothing images now use a bundled placeholder for the two known missing legacy
default URLs and failed image loads. Presentation leaves stored source URLs and
privacy fields intact; newly created fallback records use the local placeholder.
The shared image component preserves caller attributes/events and resets after a
new source is supplied. This UI repair does not complete the media migration.

## Installation

```bash
# Clone the repository
git clone https://github.com/hongyime/sgStyleSnap2025.git

# Navigate to project directory
cd sgStyleSnap2025

# Install dependencies
npm install
```

### Environment Setup

Copy the `.env.example` file to `.env` and fill in your actual values:

```bash
cp .env.example .env
```

**Required environment variables:**

```bash
# Supabase Configuration (Required)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Google OAuth (Required - only authentication method)
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Cloudinary Configuration (Required)
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-unsigned-upload-preset

# Optional: AI Features
VITE_HUGGINGFACE_API_TOKEN=your_huggingface_api_token
VITE_GEMINI_API_KEY=your_gemini_api_key
```

See `.env.example` for the complete list of environment variables and setup instructions.

## Usage

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linting
npm run lint

# Run tests
npm run test
```

The application will be available at [http://localhost:5173](http://localhost:5173).

### Additional Setup

1. **Supabase**: Create a project at [supabase.com](https://supabase.com), enable Google OAuth provider in Authentication settings, and run database migrations sequentially from `database/migrations/` folder (001-048)
2. **Cloudinary**: Create an account at [cloudinary.com](https://cloudinary.com) and create an unsigned upload preset in Settings → Upload
3. **Google OAuth**: Create OAuth 2.0 credentials at [Google Cloud Console](https://console.cloud.google.com) and configure in Supabase dashboard

## Demo

See the `/screenshots` folder for application screenshots demonstrating the user interface and features.

## Disclaimer

1. FOR EDUCATIONAL PURPOSES ONLY
2. USE AT YOUR OWN DISCRETION

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

2026-09-12 portfolio rotation task list: reproduce current build/CSS and bundle findings; repair confirmed frontend/validation defects while preserving records and provider behavior; verify local tests/build/browser checks, hosted PR checks and exact production; update the portfolio HTML/Markdown evidence.

2026-09-12 frontend maintenance: page modules and the background-removal runtime load only when needed; production startup diagnostics no longer import provider SDKs. The mobile navigation selector and accessible menu labels are repaired. Hashed /js and /css outputs receive the same immutable cache policy as /assets, while HTML retains normal freshness behavior. The obsolete TypeScript baseUrl setting is removed without changing the @ alias; the complete existing type check passes. Build now stops on type failures, and npm test no longer masks failures. Automatic validation is consolidated under Build Check on Node 24: locked install, configured unit tests, type/build and isolated desktop/mobile navigation checks. Legacy Node-version and provider integration workflows remain available manually and report failures honestly; the latter still requires a separately configured test service. Existing dependency versions, provider settings, notification retention and stored user data remain unchanged. Hosted and production verification are pending.

2026-09-12 validation: 70 configured unit tests, type checking, the production build and 10 isolated desktop/mobile browser scenarios pass. Browser testing reproduced a landing-page avatar ResizeObserver callback reading a cleared DOM ref after navigation. Avatar observers and timers now have component-owned cleanup; late imports/model loads cannot restart an unmounted scene, and changing the model retains the renderer. The browser regression checks observer disconnection and deliberately delivers a queued callback after navigation. Cold local browser measurements against the previous production source show decoded JavaScript downloads falling from 1,737,899 to 317,035 bytes on login (81.8%) and from 2,514,214 to 1,142,083 bytes on the landing page (54.6%). These are uncompressed local response measurements with external requests blocked, not monthly quota savings. OAuth, real image inference, uploads and database writes were not exercised; model-library dependency versions remain unchanged.

2026-09-12 hosted-check repair: GitHub default CodeQL successfully scans both JavaScript/TypeScript and Actions. The redundant advanced CodeQL workflow was failing because default setup rejects advanced SARIF uploads; only that duplicate workflow is disabled in repository settings. The duplicate legacy Labeler workflow is also disabled; the active Pull Request Labeler remains enabled and its valid schema now preserves the union of shared rules and all StyleSnap-specific path rules. The retained legacy config is converted to the current schema. Default CodeQL configuration, other workflow states and existing bot pauses are preserved.
