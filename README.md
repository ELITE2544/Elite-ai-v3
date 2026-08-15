# Elite AI v3
AI admissions portal for Elite Technical Training Institute.

## Run
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Add your OpenAI API key and strong admin credentials.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3000`.
7. Admin dashboard: `http://localhost:3000/admin.html`.

The API key stays server-side. Do not commit `.env`.

## Included
- AI student assistant
- Course/admission guidance
- Student application/enquiry form
- SQLite application database
- Admin authentication
- Lead status workflow
- Admin search/filter
- CSV export
- Application reference numbers
- Health endpoint

Production checklist: HTTPS, managed database/backups, secure password hashing/identity provider, session store, audit logs, privacy notice/consent, and deployment secrets.
