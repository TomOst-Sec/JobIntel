# 🧪 JobIntel — Comprehensive Beta Testing Prompt

> **Audience:** AI agent or human QA tester  
> **Goal:** Methodically exercise **every feature, page, component, and API endpoint** of the JobIntel platform, document all findings (bugs, broken links, UX issues, missing data, console errors), and produce a structured test report.

---

## 0. Pre-Flight Setup

Before you begin testing, complete **all** of the following:

1. **Start the backend API** — In the `/JobIntel/JobIntel` directory, activate the virtual environment and run:
   ```bash
   source venv/bin/activate
   python run_api.py
   ```
   Confirm it starts on `http://localhost:8000`. Hit `http://localhost:8000/api/v1/health` and verify you get a JSON response with `"status": "healthy"`, `total_jobs`, `unique_companies`, `markets`, etc.

2. **Start the frontend dev server** — In `/JobIntel/JobIntel/frontend`:
   ```bash
   npm run dev
   ```
   Confirm it starts on `http://localhost:3000`.

3. **Open the browser** and navigate to `http://localhost:3000`. You should see the **landing page**.

4. **Open the browser DevTools console** — Keep it open for the entire session. Log any console errors, warnings, or failed network requests as part of your report.

5. **Create two test accounts** for testing (via the signup page):
   - **Seeker account:** `seeker@test.com` / `TestPass123!` / Full name: `Test Seeker` / Role: seeker
   - **Recruiter account:** `recruiter@test.com` / `TestPass123!` / Full name: `Test Recruiter` / Role: recruiter

---

## 1. Landing Page (`/`)

Test every element on the public-facing landing page:

- [ ] **Hero section** — Verify headline, subheadline, and CTA buttons render. Click each CTA and confirm it navigates correctly (e.g., to `/signup`, `/pricing`, or scrolls to a section).
- [ ] **Live stats counters** — Check that live counter components display numbers (jobs tracked, companies monitored, markets). Verify they animate/count up on page load.
- [ ] **Feature showcase sections** — Scroll through all feature cards. Confirm each one has an icon/illustration, title, and description. No placeholder text like "Lorem ipsum."
- [ ] **Free public tools links** — Verify links/buttons to Ghost Check (`/ghost-check`) and Salary Check (`/salary-check`) are visible and navigate correctly.
- [ ] **Pricing preview** — If a pricing section or CTA exists on the landing page, confirm it links to `/pricing`.
- [ ] **Waitlist / CTA form** — If a waitlist email form exists, enter a test email and submit. Verify success message appears. Try submitting the same email again — it should handle gracefully (no error).
- [ ] **Navigation bar** — Check logo, nav links (Home, Pricing, Login, Sign Up). Verify each link works. Check mobile responsiveness of the nav (hamburger menu if applicable).
- [ ] **Footer** — Verify all footer links work and are not broken.
- [ ] **Responsive design** — Resize browser to 375px (mobile), 768px (tablet), and 1440px (desktop). Confirm layout doesn't break at any size. No horizontal scrollbars, no overlapping elements, no cut-off text.
- [ ] **Console errors** — Record any JavaScript errors or failed API calls.

---

## 2. Authentication System

### 2.1 Signup (`/signup`)

- [ ] **Page loads** without errors.
- [ ] **Form fields** — Confirm fields exist for: Email, Password, Full Name, Role selector (seeker/recruiter).
- [ ] **Validation** — Try submitting with empty fields. Expect inline error messages. Try an invalid email format (e.g., `notanemail`). Try a short password.
- [ ] **Successful registration** — Register with valid data. Confirm redirect to the appropriate dashboard (seeker → `/seeker`, recruiter → `/recruiter/dashboard`).
- [ ] **Duplicate email** — Try registering again with the same email. Expect a clear error message, not a crash.
- [ ] **Tokens stored** — After signup, check `localStorage` for `token` and `refresh_token`. Both should be present.

### 2.2 Login (`/login`)

- [ ] **Page loads** without errors.
- [ ] **Wrong credentials** — Try logging in with a wrong password. Expect "Invalid email or password" error.
- [ ] **Non-existent email** — Try an email that doesn't exist. Should show an error, not crash.
- [ ] **Successful login** — Login with valid credentials. Confirm redirect to the correct dashboard based on role.
- [ ] **Redirect parameter** — Navigate to `/login?redirect=/seeker/jobs`. After login, confirm you're redirected to `/seeker/jobs`, not just the default dashboard.
- [ ] **Remember tokens** — Confirm `localStorage` has `token` and `refresh_token` after login.

### 2.3 Token Refresh & Session Management

- [ ] **Token refresh** — After login, manually delete or corrupt the `token` in localStorage (but keep `refresh_token`). Navigate to any authenticated page. The app should silently refresh the token and load the page, **not** kick you to login.
- [ ] **Expired refresh token** — Clear both `token` and `refresh_token`. Try navigating to an auth-required page. Should redirect to `/login`.
- [ ] **Auth guard** — Without logging in, try directly navigating to `/seeker`, `/seeker/jobs`, `/dashboard`, `/recruiter/dashboard`. All should redirect to `/login`.

### 2.4 OAuth (`/api/v1/auth/oauth`)

- [ ] **OAuth endpoints exist** — Hit `/api/v1/auth/oauth/` routes from the browser or API client. Verify they return proper responses (even if external OAuth providers aren't configured, they should not 500).

### 2.5 User Profile (`/api/v1/auth/me`)

- [ ] **GET /api/v1/auth/me** — While logged in, confirm this returns: `id`, `email`, `full_name`, `role`, `is_active`, `created_at`, `plan_name`.
- [ ] **Plan name** — Verify `plan_name` defaults to `"Free"` for new users.

---

## 3. Public Free Tools (No Auth Required)

### 3.1 Ghost Check (`/ghost-check`)

- [ ] **Page loads** without errors.
- [ ] **Input form** — Confirm there's a text field to paste a job URL and a submit button.
- [ ] **Submit a valid-looking URL** — e.g. `https://www.linkedin.com/jobs/view/1234567890`. Submit and check:
  - Response includes: `ghost_score`, `signals` (array), `verdict`, `confidence`, `source`.
  - UI displays the score visually (e.g., gauge, color coding).
  - Signals are listed clearly.
- [ ] **Submit an empty URL** — Expect validation error.
- [ ] **Submit gibberish** — e.g. `asdfasdf`. Should handle gracefully (may return a low-confidence result or an error).
- [ ] **Rate limiting** — Submit 11+ requests quickly. After 10, you should receive a rate limit response (429 or similar message).
- [ ] **CTA to sign up** — After getting a result, check if there's a prompt to sign up for full features.

### 3.2 Salary Check (`/salary-check`)

- [ ] **Page loads** without errors.
- [ ] **Input form** — Fields for: Job Title (required), Location (optional), Experience level (e.g., junior/mid/senior dropdown or input).
- [ ] **Submit valid data** — e.g. Title: "Software Engineer", Location: "San Francisco", Experience: "mid". Check response includes:
  - `percentiles` (p25, p50, p75 salary data).
  - `sample_size`.
  - `top_paying_companies` list.
  - `market_comparison` list.
  - `ai_insight` (AI-generated text).
- [ ] **UI rendering** — Salary range component should display data clearly (bar chart, range visualization, etc.).
- [ ] **Submit with only title** — Should still work (location defaults to null, experience defaults to "mid").
- [ ] **Submit empty** — Title is required; expect validation error.
- [ ] **Rate limiting** — Same 10/hour limit as ghost check.

---

## 4. Seeker Hub (`/seeker`)

Log in as the **Seeker account** for all tests in this section.

### 4.1 Seeker Dashboard (`/seeker` — main page)

- [ ] **Page loads** without errors, no blank white screen.
- [ ] **Dashboard widgets** — Verify stat cards, charts, or summary panels render with data (or sensible empty states like "No applications yet").
- [ ] **Navigation sidebar/menu** — Confirm all 16 sub-sections are accessible via navigation: Jobs, Alerts, Autopilot, Career, Chat, Companies, Competitive Map, CV, CV Intelligence, Gamification, Ghost Truth, Interview, Market Signals, Negotiate, Roadmap, Salary Reality.
- [ ] **Quick actions** — If there are quick action buttons (e.g., "Search Jobs", "Upload CV"), verify they work.

### 4.2 Jobs (`/seeker/jobs`)

- [ ] **Page loads**, job listings display (or empty state if DB is empty).
- [ ] **Search** — Type a query (e.g., "engineer") and search. Verify results update.
- [ ] **Filters** — Test each filter:
  - Market filter (Silicon Valley, Tel Aviv, London).
  - Category filter.
  - Company filter.
  - Salary range (min_salary, max_salary).
  - Remote-only toggle.
  - Date posted filter (today, 3days, week, month).
  - Sort (date, salary, relevance).
- [ ] **Pagination** — If more than 20 results, navigate to page 2. Confirm different results load.
- [ ] **Job card details** — Each job card should show: title, company, location, salary range (if available), date posted, ghost score badge.
- [ ] **Click a job** — Click on a job to see its detail view. Verify title, company, description, requirements, salary, apply URL, ghost score all display.
- [ ] **Save/track a job** — Click "Save" or "Track" on a job. Confirm it's added to your application tracker.
- [ ] **Report a job** — Click "Report" on a job (options: expired, ghost, broken). Confirm success message.

### 4.3 Application Tracker (`/seeker` dashboard section or separate page)

- [ ] **List applications** — After saving a job, verify it appears in the tracker.
- [ ] **Status management** — Change an application's status (saved → applied → interview → offer → rejected). Verify the status updates persist after page refresh.
- [ ] **Add notes** — Add a note to an application. Verify it saves with a timestamp.
- [ ] **Edit application** — Update the salary range, notes, or external URL.
- [ ] **Delete** — Delete an application. Confirm it's removed. Refresh to verify persistence.
- [ ] **Stats** — Check application stats (total count, count by status). Verify numbers are accurate.
- [ ] **Filtering** — Filter applications by status. Verify correct subset shown.

### 4.4 Alerts (`/seeker/alerts`)

- [ ] **Page loads** without errors.
- [ ] **Create alert** — Set up a job alert (e.g., "Python developer in Tel Aviv"). Confirm it saves.
- [ ] **List alerts** — Verify existing alerts display with their criteria.
- [ ] **Toggle alert** — Enable/disable an alert. Verify state change persists.
- [ ] **Delete alert** — Remove an alert. Confirm deletion.
- [ ] **Empty state** — If no alerts, verify a helpful message is shown (not a blank page).

### 4.5 Autopilot (`/seeker/autopilot`)

- [ ] **Page loads** without errors.
- [ ] **Autopilot configuration** — Verify you can set preferences (job types, locations, salary range, etc.).
- [ ] **Enable/disable** — Toggle autopilot on/off. Check that state saves.
- [ ] **Status display** — If autopilot has run, verify it shows results/actions taken.
- [ ] **Empty state** — If never configured, show an onboarding/setup prompt.

### 4.6 Career Path (`/seeker/career`)

- [ ] **Page loads** without errors.
- [ ] **Career graph/visualization** — If a career path graph renders, verify it's interactive (clickable nodes, hover states).
- [ ] **Career recommendations** — Verify AI-powered career path suggestions display.
- [ ] **Skills gap analysis** — If present, check that skills are listed with proficiency indicators.

### 4.7 AI Chat (`/seeker/chat`)

- [ ] **Page loads** with a chat interface.
- [ ] **Send a message** — Type a question like "What skills are in demand for backend engineers?" and send.
- [ ] **Receive a response** — AI should respond with relevant advice. Check for streaming or typing indicators.
- [ ] **Multiple messages** — Send 3-4 messages. Verify conversation history is maintained.
- [ ] **New conversation** — Start a new chat. Previous messages should not carry over (or should be in a separate thread).
- [ ] **Error handling** — If AI service is unavailable, verify a friendly error message is shown, not a crash.

### 4.8 Companies (`/seeker/companies`)

- [ ] **Page loads** — Company list or search displays.
- [ ] **Company detail** — Click a company. Verify: name, job count, trajectory/growth indicators, recent postings.
- [ ] **Company badge component** — Check that company badges render with proper colors/icons.

### 4.9 Competitive Map (`/seeker/competitive-map`)

- [ ] **Page loads** without errors.
- [ ] **Visualization** — If a map or chart renders, verify it's legible and interactive.
- [ ] **Data displayed** — Companies should be positioned based on some competitive metric. Tooltips or labels should provide context.

### 4.10 CV Upload (`/seeker/cv`)

- [ ] **Page loads** without errors.
- [ ] **Upload a CV** — Upload a test PDF or DOCX file. Verify:
  - Upload progress indicator.
  - Success message after upload.
  - File is stored and associated with the user.
- [ ] **Upload validation** — Try uploading a non-document file (e.g., `.exe`, `.mp3`). Should be rejected.
- [ ] **View uploaded CV** — After upload, verify you can view or download the CV.
- [ ] **Replace CV** — Upload a new CV. Verify it replaces the old one.

### 4.11 CV Intelligence (`/seeker/cv-intelligence`)

- [ ] **Page loads** without errors.
- [ ] **CV analysis results** — If a CV has been uploaded, verify AI analysis displays:
  - Skills extracted.
  - Experience summary.
  - ATS compatibility score.
  - Recommendations for improvement.
  - Keyword optimization suggestions.
- [ ] **Job matching** — If CV intelligence matches to jobs, verify match scores and suggestions.
- [ ] **No CV state** — If no CV uploaded, verify a prompt to upload is shown.

### 4.12 Gamification (`/seeker/gamification`)

- [ ] **Page loads** without errors.
- [ ] **Profile/XP section** — Verify user level, XP points, and progress bar display.
- [ ] **Badges/Achievements** — Check that earned and unearned badges render. Click on a badge for details.
- [ ] **Leaderboard** — If a leaderboard exists, verify it shows rankings.
- [ ] **Streak tracking** — Verify daily/weekly streak display.
- [ ] **Action rewards** — Perform an action (e.g., upload CV, apply to job) and verify XP increases.

### 4.13 Ghost Truth Engine (`/seeker/ghost-truth`)

- [ ] **Page loads** without errors.
- [ ] **Ghost job detection** — If integrated, verify a list of suspected ghost jobs displays with scores.
- [ ] **Ghost score component** — Verify ghost scores render with color coding (green = real, red = ghost).
- [ ] **Details** — Click a ghost-flagged job. Verify signals/reasons are listed.

### 4.14 Interview Oracle (`/seeker/interview`)

- [ ] **Page loads** without errors.
- [ ] **Company/role input** — Enter a company and role to get interview prep.
- [ ] **AI-generated content** — Verify interview questions, tips, company culture insights are generated.
- [ ] **Practice mode** — If an interactive practice mode exists, verify it functions (Q&A, timer, scoring).

### 4.15 Market Signals (`/seeker/market-signals`)

- [ ] **Page loads** without errors.
- [ ] **Signal cards** — Verify hiring signals display: company expansions, layoff warnings, funding events.
- [ ] **Filtering** — Filter by market or signal type.
- [ ] **Trend charts** — If chart visualizations exist, verify they render with data.
- [ ] **Freshness** — Check that signal dates are recent and not stale.

### 4.16 Salary Negotiation (`/seeker/negotiate`)

- [ ] **Page loads** without errors.
- [ ] **Negotiation inputs** — Enter offer details (company, role, offered salary, location).
- [ ] **AI recommendation** — Verify AI returns negotiation strategy, counter-offer range, talking points.

### 4.17 Salary Reality (`/seeker/salary-reality`)

- [ ] **Page loads** without errors.
- [ ] **Salary data** — Verify salary breakdowns by role, market, and experience level.
- [ ] **Visualization** — Salary range component should render properly (bar/gauge visualization).
- [ ] **Comparison** — If comparison features exist (e.g., "your salary vs. market"), verify they work.

### 4.18 Roadmap (`/seeker/roadmap`)

- [ ] **Page loads** without errors.
- [ ] **Personal roadmap** — Verify a career development roadmap or timeline displays.
- [ ] **Milestones** — Check that milestones/goals are listed with status indicators.

---

## 5. Recruiter Portal (`/recruiter`)

Log in as the **Recruiter account** for all tests in this section.

### 5.1 Recruiter Dashboard (`/recruiter/dashboard`)

- [ ] **Page loads** without errors.
- [ ] **Overview stats** — Verify widgets show: active pipeline count, candidates found, outreach stats.
- [ ] **Navigation** — Confirm links to: Search, Pipeline, Outreach.

### 5.2 Candidate Search (`/recruiter/search`)

- [ ] **Page loads** without errors.
- [ ] **Search form** — Enter search criteria (skills, location, experience level).
- [ ] **Results** — Verify candidate/job match results display with relevant details.
- [ ] **Filters** — Test all available filters.
- [ ] **Save to pipeline** — Click to save a candidate to pipeline. Verify success.

### 5.3 Recruiter Pipeline (`/recruiter/pipeline`)

- [ ] **Page loads** without errors.
- [ ] **Pipeline stages** — Verify a Kanban-style board or staged list exists (e.g., Sourced → Contacted → Interview → Offer).
- [ ] **Move candidates** — Drag or click to move a candidate between stages. Verify persistence.
- [ ] **Notes on candidates** — Add notes. Verify they save.
- [ ] **Remove from pipeline** — Remove a candidate. Confirm deletion.

### 5.4 Outreach (`/recruiter/outreach`)

- [ ] **Page loads** without errors.
- [ ] **Create outreach** — Compose an outreach message template.
- [ ] **Outreach history** — Verify sent outreach messages are tracked.
- [ ] **Template management** — If templates exist, verify CRUD operations (create, edit, delete).

---

## 6. Dashboard (General — `/dashboard`)

### 6.1 Main Dashboard (`/dashboard`)

- [ ] **Page loads** differently based on user role. Seeker should see seeker-relevant data, recruiter should see recruiter data.
- [ ] **Overview cards/widgets** — Stat cards, charts, counters render.

### 6.2 Admin Panel (`/dashboard/admin`)

- [ ] **Access control** — A non-admin user should NOT be able to access this. Verify redirect or 403 error.
- [ ] **Admin scraper controls** — If accessible as admin, verify scraper management UI:
  - View scraper status.
  - Trigger manual scrape.
  - View scrape history/logs.

### 6.3 Company Radar (`/dashboard/radar`)

- [ ] **Page loads** without errors.
- [ ] **Company risk/radar** — Verify a visualization of companies with risk/growth indicators.
- [ ] **Detail drilldown** — Click a company for details.

### 6.4 Search (`/dashboard/search`)

- [ ] **Page loads** without errors.
- [ ] **Global search** — Search for jobs, companies, or skills. Verify results.

### 6.5 Signals (`/dashboard/signals`)

- [ ] **Page loads** — Market/hiring signals display.
- [ ] **Signal types** — Verify different signal categories (scaling, layoffs, funding, etc.).

### 6.6 Application Tracker (`/dashboard/tracker`)

- [ ] **Page loads** — Shows application tracking (may overlap with seeker tracker).
- [ ] **CRUD operations** — Same as section 4.3.

### 6.7 Reports (`/dashboard/reports`)

- [ ] **Page loads** — List of generated reports.
- [ ] **View a report** — Click to open. Verify rendered content with data.
- [ ] **Generate a new report** — If possible, trigger report generation.

### 6.8 Companies (`/dashboard/companies`)

- [ ] **Page loads** — Company list with metrics.
- [ ] **Company detail** — Click for detailed view.

### 6.9 Notifications (`/dashboard/notifications`)

- [ ] **Page loads** without errors.
- [ ] **Notification list** — Verify notifications are displayed (or empty state if none).
- [ ] **Mark as read** — Click to mark a notification as read. Verify visual change.
- [ ] **Notification actions** — Click a notification that links to content. Verify navigation works.

### 6.10 Settings (`/dashboard/settings`)

- [ ] **Page loads** without errors.
- [ ] **Profile editing** — Change full name. Save. Verify change persists.
- [ ] **Password change** — If available, change password. Logout and re-login with new password.
- [ ] **Notification preferences** — Toggle notification settings. Verify they save.
- [ ] **Subscription/plan info** — Verify current plan displays (should be "Free" by default).

---

## 7. Reports Section (`/reports`)

### 7.1 Weekly Reports (`/reports/weekly`)

- [ ] **Page loads** without errors.
- [ ] **Report list** — Verify weekly reports are listed with dates and titles.
- [ ] **View report** — Click to read a full report. Verify formatted content (markdown rendered to HTML), data tables, charts.
- [ ] **Latest report** — Verify the most recent report is featured prominently.
- [ ] **Report by slug** — Navigate to `/reports/weekly/[slug]`. Verify correct report loads.

---

## 8. Pricing Page (`/pricing`)

- [ ] **Page loads** without errors.
- [ ] **Plan cards** — Verify three plans render: Basic ($199/mo), Pro ($399/mo), Enterprise ($499/mo).
- [ ] **Feature comparison** — Each plan card should list included features.
- [ ] **CTA buttons** — "Subscribe" or "Get Started" buttons should either:
  - Navigate to signup (if not logged in).
  - Trigger billing flow (if logged in).
- [ ] **Billing integration** — If Stripe or similar is integrated, verify the checkout flow doesn't crash. (May require test mode.)
- [ ] **Annual pricing** — If annual toggle exists, verify prices update.

---

## 9. Command Palette / Global Search

- [ ] **Keyboard shortcut** — Press `Cmd+K` (or `Ctrl+K`). Verify command palette opens.
- [ ] **Search within palette** — Type "jobs", "career", "ghost". Verify suggestions appear.
- [ ] **Navigate via palette** — Select a result. Confirm navigation to the correct page.
- [ ] **Close palette** — Press `Escape`. Verify it closes.

---

## 10. UI Components & Design System

### 10.1 Buttons (`button.tsx`)

- [ ] Verify primary, secondary, ghost, and destructive button variants render.
- [ ] Hover states, disabled state, loading state all work.

### 10.2 Status Badges (`status-badge.tsx`)

- [ ] Verify status badges render for all application statuses: saved, applied, interview, offer, rejected, withdrawn.
- [ ] Correct colors and icons per status.

### 10.3 Ghost Score (`ghost-score.tsx`)

- [ ] Renders with score from 0–100.
- [ ] Color coding: green (low ghost risk), yellow (medium), red (high ghost risk).
- [ ] Tooltip or label explains the score.

### 10.4 Salary Range (`salary-range.tsx`)

- [ ] Renders salary bar/range correctly.
- [ ] Min, max, median values displayed.
- [ ] Handles missing data gracefully (shows "N/A" or similar).

### 10.5 Intelligence Card (`intelligence-card.tsx`)

- [ ] Card renders with title, content, and metadata.
- [ ] Expand/collapse or "read more" works.

### 10.6 Stat Card (`stat-card.tsx`)

- [ ] Renders with label, value, and optional trend indicator.
- [ ] Large numbers formatted properly (e.g., "12,345" not "12345").

### 10.7 Live Counter (`live-counter.tsx`)

- [ ] Animates from 0 to target value on mount.
- [ ] Smooth animation, no visual glitches.

### 10.8 Company Badge (`company-badge.tsx`)

- [ ] Shows company name with styling.
- [ ] Handles long company names gracefully (truncation with tooltip).

---

## 11. API Endpoint Verification

For each endpoint group, make direct API calls (use the browser's fetch in DevTools console or an API client) while authenticated. Check for correct responses and proper error handling.

### 11.1 Health & Public

| Endpoint | Method | Expected |
|----------|--------|----------|
| `/api/v1/health` | GET | `{"status": "healthy", "total_jobs": N, ...}` |
| `/api/v1/public/ghost-check` | POST | Ghost check result with score |
| `/api/v1/public/salary-check` | POST | Salary data with percentiles |
| `/api/v1/public/reports/latest` | GET | Latest weekly report |
| `/api/v1/public/reports/{slug}` | GET | Report by slug |
| `/api/v1/public/radar-preview` | GET | Top 5 company radar preview |

### 11.2 Auth

| Endpoint | Method | Expected |
|----------|--------|----------|
| `/api/v1/auth/register` | POST | Token response (201) |
| `/api/v1/auth/login` | POST | Token response |
| `/api/v1/auth/refresh` | POST | New token pair |
| `/api/v1/auth/me` | GET | User profile (requires auth) |
| `/api/v1/auth/waitlist` | POST | Waitlist confirmation |

### 11.3 Jobs

| Endpoint | Method | Expected |
|----------|--------|----------|
| `/api/v1/jobs` | GET | Paginated job list |
| `/api/v1/jobs/{id}/report` | POST | Report confirmation (auth) |
| `/api/v1/jobs/stats` | GET | Total jobs, companies, markets |
| `/api/v1/jobs/markets` | GET | Market overview list |
| `/api/v1/jobs/salaries` | GET | Salary stats by category (auth) |
| `/api/v1/jobs/skills` | GET | Skill demand analysis (auth) |
| `/api/v1/jobs/scaling` | GET | Scaling companies (auth) |

### 11.4 Applications

| Endpoint | Method | Expected |
|----------|--------|----------|
| `/api/v1/applications` | POST | Create application (auth) |
| `/api/v1/applications` | GET | List applications (auth) |
| `/api/v1/applications/stats` | GET | Count by status (auth) |
| `/api/v1/applications/{id}` | PUT | Update application (auth) |
| `/api/v1/applications/{id}` | DELETE | Delete application (auth) |
| `/api/v1/applications/{id}/note` | POST | Add note (auth) |

### 11.5 Intelligence & AI

| Endpoint | Method | Expected |
|----------|--------|----------|
| `/api/v1/chat` | POST | AI chat response (auth) |
| `/api/v1/intelligence/*` | GET/POST | Various intel endpoints (auth) |
| `/api/v1/intelligence/salary/*` | GET | Salary intelligence (auth) |
| `/api/v1/market/*` | GET | Market signals (auth) |
| `/api/v1/career/*` | GET/POST | Career & interview endpoints (auth) |
| `/api/v1/cv-intelligence/*` | GET/POST | CV analysis (auth) |

### 11.6 Recruiter

| Endpoint | Method | Expected |
|----------|--------|----------|
| `/api/v1/recruiter/search` | GET/POST | Candidate search (auth, recruiter role) |
| `/api/v1/recruiter/pipeline` | GET/POST | Pipeline management (auth) |
| `/api/v1/recruiter/outreach` | GET/POST | Outreach management (auth) |

### 11.7 Other

| Endpoint | Method | Expected |
|----------|--------|----------|
| `/api/v1/cv/upload` | POST | File upload (auth) |
| `/api/v1/alerts` | GET/POST | Alert management (auth) |
| `/api/v1/billing/*` | GET/POST | Billing & subscription (auth) |
| `/api/v1/gamification/*` | GET | XP, badges, leaderboard (auth) |
| `/api/v1/autopilot/*` | GET/POST | Autopilot config & status (auth) |
| `/api/v1/feed` | GET | Activity feed (auth) |
| `/api/v1/reports` | GET | Report list (auth) |
| `/api/v1/roadmap` | GET | Roadmap data (auth) |
| `/api/v1/negotiate` | POST | Negotiation advice (auth) |
| `/api/v1/enrichment/*` | POST | Data enrichment (auth) |
| `/api/v1/content/*` | GET | SEO/content endpoints |
| `/api/v1/webhooks` | POST | Webhook processing |
| `/api/v1/admin/*` | Various | Admin-only endpoints (auth + admin role) |

---

## 12. Cross-Cutting Concerns

### 12.1 Error Handling

- [ ] **404 pages** — Navigate to `/nonexistent-page`. Verify a styled 404 page renders (not a white screen or raw error).
- [ ] **API 404** — Hit `/api/v1/nonexistent`. Expect `{"detail": "Not found: /api/v1/nonexistent"}`.
- [ ] **500 handling** — If any endpoint crashes, verify the global exception handler returns JSON `{"detail": "Internal server error"}`, not a stack trace.
- [ ] **Network failure** — Disable the API server while the frontend is loaded. Navigate around. Verify error toasts/messages appear, no infinite spinners or white screens.

### 12.2 Rate Limiting

- [ ] **Rate limit middleware** — Make rapid-fire requests to any endpoint. Verify rate limiting kicks in with a proper response (429 status or JSON error message).
- [ ] **Public endpoint limits** — Ghost check and salary check enforce 10 requests/hour per IP.

### 12.3 CORS

- [ ] **Cross-origin** — The frontend at `localhost:3000` makes requests to the API at `localhost:8000`. Verify no CORS errors in the console.

### 12.4 Performance

- [ ] **Page load times** — Each page should load within 3 seconds. Flag any page that takes longer.
- [ ] **API response times** — API calls should return within 2 seconds (except AI-powered endpoints which may take longer).
- [ ] **Large dataset handling** — If the DB has many jobs, verify pagination works and doesn't crash with thousands of items.

### 12.5 Accessibility

- [ ] **Keyboard navigation** — Tab through all interactive elements on key pages. Verify focus indicators are visible.
- [ ] **Screen reader labels** — Check for meaningful `aria-label` attributes on buttons and interactive elements.
- [ ] **Color contrast** — Verify text is readable against backgrounds (especially on dark themes).

### 12.6 Data Integrity

- [ ] **Consistent user data** — Changes made via UI (e.g., saving an application) should be reflected in API responses immediately.
- [ ] **No data leakage** — Seeker should NOT see recruiter-only data. Recruiter should NOT see another recruiter's pipeline.
- [ ] **SQL injection** — Enter `'; DROP TABLE jobs; --` in search fields. Verify the app handles it safely (parameterized queries should prevent this).

---

## 13. Activity Feed (`/api/v1/feed`)

- [ ] **Feed loads** — Verify a timeline/feed of recent activities displays (job saves, applications, alerts triggered, etc.).
- [ ] **Feed items** — Each item should have: type, timestamp, description, optional link.
- [ ] **Empty state** — New users should see a helpful empty state.
- [ ] **Pagination** — If feed is long, verify pagination/infinite scroll works.

---

## 14. SEO & Content (`/api/v1/content`)

- [ ] **SEO endpoints respond** — Hit content endpoints and verify they return structured content.
- [ ] **Meta tags** — On key public pages (landing, pricing, ghost-check, salary-check), verify:
  - `<title>` tag is descriptive and unique per page.
  - `<meta name="description">` exists and is compelling.
  - Open Graph tags (`og:title`, `og:description`, `og:image`) are present.

---

## 15. Report Template

After completing all tests, compile your findings into this format:

```markdown
# JobIntel Beta Test Report
**Date:** [date]
**Tester:** [name/identifier]
**Environment:** [OS, Browser, Screen Resolution]

## Summary
- Total tests executed: [N]
- Passed: [N]
- Failed: [N]
- Blocked: [N] (couldn't test due to dependencies)
- Warnings: [N] (works but needs improvement)

## Critical Bugs (P0 — App Breaking)
| # | Page/Feature | Description | Steps to Reproduce | Expected | Actual |
|---|-------------|-------------|--------------------|---------| -------|
| 1 | ... | ... | ... | ... | ... |

## Major Bugs (P1 — Feature Broken)
| # | Page/Feature | Description | Steps to Reproduce | Expected | Actual |
|---|-------------|-------------|--------------------|---------| -------|

## Minor Bugs (P2 — Cosmetic / UX)
| # | Page/Feature | Description | Steps to Reproduce | Expected | Actual |
|---|-------------|-------------|--------------------|---------| -------|

## Warnings / Suggestions
| # | Area | Observation | Suggestion |
|---|------|-------------|------------|

## Console Errors Log
| # | Page | Error Message | Type (JS/Network/CORS) |
|---|------|--------------|------------------------|

## Performance Notes
| Page | Load Time | API Calls | Notes |
|------|-----------|-----------|-------|

## Pages/Features Not Tested (Blocked)
| # | Page/Feature | Reason |
|---|-------------|--------|
```

---

## 16. Final Checklist

Before submitting your report, confirm:

- [ ] Every page listed above was visited and tested.
- [ ] Every form on the site was submitted with both valid and invalid data.
- [ ] Authentication was tested from both roles (seeker and recruiter).
- [ ] Console errors were captured throughout the entire session.
- [ ] At least 5 API endpoints were tested directly (not just via UI).
- [ ] Responsive design was tested at 3 breakpoints (mobile, tablet, desktop).
- [ ] The report follows the template above with severity ratings.

---

> **Remember:** The goal is not just to confirm things work — it's to actively try to **break** them. Enter unexpected inputs, click things rapidly, navigate back and forth, open multiple tabs, test edge cases. Think like a mischievous user, not a polite one. 🎯
