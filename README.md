# Paper Generator SaaS (Vite + Supabase + GitHub Pages)

Paper Generator is a modular SaaS for admins and teachers to manage large question banks and generate exam papers (Question Paper, Answer Key, Rubrics) with PDF, DOCX, and Printable HTML exports.

## Stack
- React + Vite + TypeScript
- Tailwind CSS
- Supabase (Postgres, Auth, Storage, RLS)
- Zustand state management
- Chart.js analytics
- PapaParse + SheetJS upload pipeline
- jsPDF + pdfmake + docx exporters
- GitHub Pages static hosting

## Modules
- Authentication
- Exam Body Filtering (Punjab Govt, Sindh Govt, KPK Govt, etc.)
- Dashboard
- Class / Subject / Chapter Management
- Question Bank (manual + CSV/Excel upload)
- Blueprint Management
- Paper Generator
- Templates
- Analytics
- Settings
- AI from PDF (question generation by count/difficulty/Bloom)

## User Types
- `admin`
  - uploads and manages question banks by exam body -> class -> subject/chapter
  - manages blueprints and academic structure
- `teacher`
  - chooses exam body -> class -> subject
  - generates and downloads papers with selected settings

## Local Run
1. Install dependencies
```bash
npm install
```
2. Configure environment
```bash
cp .env.example .env
```
Set:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_BASE_PATH=/` (or your repo path for GitHub Pages)
3. Run dev server
```bash
npm run dev
```

## Supabase Setup
1. Create project in Supabase.
2. Run SQL from [`supabase/schema.sql`](supabase/schema.sql).
3. Enable Email Auth (magic link or password).
4. Create profile rows in `users` table with role (`admin`, `teacher`) and `school_id`.
5. Optional: create storage bucket for diagrams/logos.

## AI Setup (PDF -> Questions)
1. Deploy edge function:
```bash
supabase functions deploy ai-generate-questions --no-verify-jwt
```
2. Set secrets in Supabase:
```bash
supabase secrets set OPENAI_API_KEY=your_key
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```
3. In Add Questions, choose `3. AI from PDF`, upload PDF, set:
- number of questions
- difficulty
- bloom level
then generate and save to question bank.

Alternative: You can also set client-side provider keys in Settings for:
- Groq (free tier)
- OpenRouter (free models)
- Together (free credits)
- Google Gemini (free tier)
- OpenAI
The app will try selected provider first, then Supabase fallback, then mock mode.

## Content Pipeline Setup (Sources -> Jobs -> Review -> Publish)
1. Run migration:
```bash
supabase db push
```
or execute:
```sql
supabase/migrations/20260311_content_pipeline.sql
```
2. Deploy pipeline functions:
```bash
supabase functions deploy ingest-source --no-verify-jwt
supabase functions deploy run-generation-jobs --no-verify-jwt
supabase functions deploy publish-candidates --no-verify-jwt
```
3. Optional provider secrets for server-side generation:
```bash
supabase secrets set GEMINI_API_KEY=your_key
supabase secrets set GEMINI_MODEL=gemini-1.5-flash
supabase secrets set GROQ_API_KEY=your_key
supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile
supabase secrets set OPENAI_API_KEY=your_key
supabase secrets set OPENAI_MODEL=gpt-4o-mini
```
4. In admin, open `Content Pipeline`:
- upload chapter/topic source files
- click `Ingest` to create chunks
- queue and run generation jobs
- review candidates and publish approved ones
- use `Import Approved` in Add Questions to pull approved question candidates

## GitHub Pages Deployment
1. Set `VITE_BASE_PATH` in env to your repo base path, e.g. `/paper-generator/`.
2. Build and deploy:
```bash
npm run deploy
```
3. Configure GitHub Pages to use `gh-pages` branch.

## Performance Notes
- Query filters are indexed (`chapter_id`, `difficulty`, `question_type`).
- Generator uses constrained scoring with quota balancing (chapter, difficulty, Bloom) and recency exclusion.
- Large banks (100k+) are supported via indexed server-side filtering and bounded client fetches.
- Generation time is surfaced in UI and optimized for <10 seconds under indexed conditions.

## Sample Upload File
Use [`public/samples/questions.csv`](public/samples/questions.csv) as template for imports.

## Fallback Mode
If Supabase env variables are missing, app runs in local demo mode using `localStorage` seeded data so UI and workflows still work.
